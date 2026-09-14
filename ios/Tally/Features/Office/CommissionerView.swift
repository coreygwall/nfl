import SwiftUI
import TallyKit
import UIKit

/**
 The commissioner's office: everything about *this pool*. The roster, its name, its invite, who
 still needs chasing.

 What is deliberately not here is who won on Sunday. Every Tally pool scores the same games, so a
 pool that could set its own results is a pool that can disagree with the one next door — results
 live in `LeagueOfficeView`, behind a grant that has nothing to do with running a pool.

 It opens straight away. There is no PIN gate any more: the office is attached to the account, so
 by the time this sheet exists the server has already said yes.
 */
struct CommissionerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    enum Section: Hashable { case pool, roster }
    @State private var section: Section = .pool

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if model.isCommissioner || model.isLeagueAdmin {
                            TallySegmented(value: $section, options: [(.pool, "Pool"), (.roster, "Roster")])
                            switch section {
                            case .pool: PoolSettingsView()
                            case .roster: RosterView()
                            }
                            if model.isLeagueAdmin { leagueDoor }
                        } else {
                            ClaimKeysCard()
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("Commissioner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }

    /// The one place the two offices meet, and it says out loud that they are different jobs.
    private var leagueDoor: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashedDivider()
            SectionLabel(text: "League office")
            Text("Results, the schedule and the score feed. They apply to every Tally pool, so they aren't a commissioner's to set — you can open them because you run the league.")
                .sans(12).foregroundStyle(Color.ink2)
            Button {
                dismiss()
                // Let the sheet finish leaving before the next one arrives.
                Task { try? await Task.sleep(for: .milliseconds(350)); model.showLeagueOffice = true }
            } label: {
                Label("Open the league office", systemImage: "building.columns.fill")
            }
            .buttonStyle(.tally(.plain, size: .small))
        }
    }
}

// MARK: Pool

private struct PoolSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var data: Loadable<CommissionerOverview> = .idle
    @State private var name = ""
    @State private var saving = false
    @State private var csv: URL?
    @State private var exporting = false
    /// The commissioner being granted or revoked, so the whole card disables while it lands.
    @State private var granting: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch data {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let o):
                nameCard(o)
                whosIn(o)
                commissioners(o)
                backup()
            }
        }
        .task { await load() }
    }

    private func nameCard(_ o: CommissionerOverview) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Pool name")
            Text("What everyone sees on the board, in a shared link and on a home screen.")
                .sans(12).foregroundStyle(Color.ink2)
            TextField("Pool name", text: $name)
                .tallyField()
                .textInputAutocapitalization(.words)
                .disabled(saving)
            HStack(spacing: 8) {
                Button(saving ? "Saving…" : "Save name") { Task { await rename(o) } }
                    .buttonStyle(.tally(.primary, size: .small))
                    .disabled(saving || name.trimmingCharacters(in: .whitespaces).count < 2 || name.trimmingCharacters(in: .whitespaces) == o.pool.name)
                Spacer()
                Text("/p/\(o.pool.slug)").sans(11).foregroundStyle(Color.ink3)
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardFlat()
    }

    private func whosIn(_ o: CommissionerOverview) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Who's in")
            Text("\(Format.plural(o.playerCount, "entry", "entries")) · \(o.readyCount) squared away · \(o.unclaimedCount == 0 ? "everyone has a device" : "\(o.unclaimedCount) not on a phone yet")")
                .sans(13).foregroundStyle(Color.ink2)
            ShareLink(item: model.shareURL) { Label("Share the invite link", systemImage: "square.and.arrow.up") }
                .buttonStyle(.tally(.plain, size: .small))
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardFlat()
    }

    /// Sharing the office, or handing it over. A co-commissioner gets the roster and the settings —
    /// never the results, which are not this pool's to set in the first place.
    private func commissioners(_ o: CommissionerOverview) -> some View {
        let held = Set(o.commissioners.map(\.id))
        let candidates = (model.boot.value?.players ?? []).filter { !held.contains($0.id) }
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Commissioners")
            ForEach(o.commissioners) { c in
                HStack {
                    Text(c.name).font(TallyFont.display(15))
                    Spacer()
                    if o.commissioners.count > 1 {
                        Button("Remove") { Task { await removeCommissioner(c) } }
                            .buttonStyle(.tally(.ghost, size: .small))
                            .disabled(granting != nil)
                    }
                }
            }
            if o.commissioners.isEmpty {
                Text("Nobody yet.").sans(13).foregroundStyle(Color.ink2)
            }
            if candidates.isEmpty {
                Text("A co-commissioner shares the roster and the settings, never the results.")
                    .sans(12).foregroundStyle(Color.ink3)
            } else {
                Menu {
                    ForEach(candidates) { p in
                        Button(p.name) { Task { await addCommissioner(p) } }
                    }
                } label: {
                    Label(granting == nil ? "Add a co-commissioner" : "Adding…", systemImage: "person.badge.key.fill")
                }
                .buttonStyle(.tally(.plain, size: .small))
                .disabled(granting != nil)
                Text("They share the roster and the settings, never the results. It has to be an account rather than an entry someone manages.")
                    .sans(12).foregroundStyle(Color.ink3)
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardFlat()
    }

    private func addCommissioner(_ p: RosterPlayer) async {
        granting = p.id
        defer { granting = nil }
        do {
            _ = try await model.service.addCommissioner(playerId: p.id)
            model.toast("\(p.name) can run this pool now.", kind: .success)
            await load()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }

    private func removeCommissioner(_ c: RoleHolder) async {
        granting = c.id
        defer { granting = nil }
        do {
            _ = try await model.service.removeCommissioner(playerId: c.id)
            model.toast("\(c.name) no longer runs this pool.", kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }

    private func backup() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Backup")
            Text("Every pick with its game, result and points. It settles arguments.")
                .sans(12).foregroundStyle(Color.ink2)
            Button(exporting ? "Preparing…" : "Download picks CSV") { Task { await export() } }
                .buttonStyle(.tally(.plain, size: .small))
                .disabled(exporting)
            if let csv {
                ShareLink(item: csv) { Label("Share picks.csv", systemImage: "square.and.arrow.up") }
                    .buttonStyle(.tally(.plain, size: .small))
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardFlat()
    }

    private func load() async {
        if data.value == nil { data = .loading }
        do {
            let o = try await model.service.commissionerOverview()
            if name.isEmpty { name = o.pool.name }
            data = .loaded(o)
        } catch {
            data = .failed(error.asAPIError)
        }
    }

    private func rename(_ o: CommissionerOverview) async {
        saving = true
        defer { saving = false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await model.service.renamePool(name: trimmed)
            model.toast("This pool is called \(trimmed) now.", kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch {
            model.toast(error.asAPIError.message, kind: .error)
        }
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        do {
            let bytes = try await model.service.exportCSV()
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("tally-picks-\(model.pool.slug).csv")
            try bytes.write(to: url)
            csv = url
            model.toast("CSV ready — share it to save a copy.", kind: .success)
        } catch {
            model.toast(error.asAPIError.message, kind: .error)
        }
    }
}

// MARK: Roster

private struct RosterView: View {
    @Environment(AppModel.self) private var model
    @State private var data: Loadable<CommissionerPlayersResponse> = .idle
    @State private var filter: Filter = .all
    @State private var renaming: CommissionerPlayer?
    @State private var newName = ""
    @State private var confirmDelete: CommissionerPlayer?
    @State private var confirmReset: CommissionerPlayer?

    enum Filter: Hashable { case all, ready, waiting }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TallySegmented(value: $filter, options: [(.all, "All"), (.ready, "Ready"), (.waiting, "Waiting")])
            switch data {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let res):
                let rows = res.players.filter { filter == .all || ($0.ready == (filter == .ready)) }
                Text("\(res.players.filter(\.ready).count) of \(res.players.count) squared away · tap the circle to tick someone off")
                    .sans(12).foregroundStyle(Color.ink2)
                ForEach(rows) { p in
                    RosterRow(player: p,
                              onReady: { Task { await setReady(p, !p.ready) } },
                              onRename: { renaming = p; newName = p.name },
                              onReset: { confirmReset = p },
                              onCopyLink: { copyLink(p) },
                              onDelete: { confirmDelete = p })
                }
            }
        }
        .task { await load() }
        .alert("Rename \(renaming?.name ?? "")", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $newName)
            Button("Save") { if let p = renaming { Task { await rename(p, newName) } } }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .confirmationDialog("Remove \(confirmDelete?.name ?? "") from the pool?", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }), titleVisibility: .visible) {
            Button("Remove player", role: .destructive) { if let p = confirmDelete { Task { await delete(p) } } }
            Button("Keep", role: .cancel) { confirmDelete = nil }
        } message: {
            Text("Their picks leave the board. The pick history keeps a copy, so nothing is truly lost.")
        }
        .confirmationDialog("Give \(confirmReset?.name ?? "") a new code?", isPresented: Binding(get: { confirmReset != nil }, set: { if !$0 { confirmReset = nil } }), titleVisibility: .visible) {
            Button("New code, sign out their devices", role: .destructive) {
                if let p = confirmReset { Task { await reset(p) } }
            }
            Button("Cancel", role: .cancel) { confirmReset = nil }
        } message: {
            Text("They will be signed out everywhere and will need the new code to get back in. It is copied for you to send them.")
        }
    }

    private func load() async {
        if data.value == nil { data = .loading }
        do { data = .loaded(try await model.service.commissionerPlayers()) } catch { data = .failed(error.asAPIError) }
    }

    private func setReady(_ p: CommissionerPlayer, _ ready: Bool) async {
        do { _ = try await model.service.setReady(playerId: p.id, ready: ready); await load() }
        catch { model.toast(error.asAPIError.message, kind: .error) }
    }

    private func rename(_ p: CommissionerPlayer, _ name: String) async {
        renaming = nil
        do {
            _ = try await model.service.renamePlayer(playerId: p.id, name: name)
            model.toast("Renamed to \(name)", kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }

    private func reset(_ p: CommissionerPlayer) async {
        confirmReset = nil
        do {
            let r = try await model.service.resetAccess(playerId: p.id)
            UIPasteboard.general.string = Codes.format(r.code)
            model.toast("New code for \(p.name): \(Codes.format(r.code)) (copied). Their old devices are signed out.", kind: .success)
            await load()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }

    private func copyLink(_ p: CommissionerPlayer) {
        guard let code = p.code else { model.toast("\(p.name) has no code yet — reset access to issue one.", kind: .error); return }
        UIPasteboard.general.string = model.pool.webURL(path: "/welcome?claim=\(p.id)&code=\(code)").absoluteString
        model.toast("Sign-in link for \(p.name) copied. One tap signs that phone in.", kind: .success)
    }

    private func delete(_ p: CommissionerPlayer) async {
        confirmDelete = nil
        do {
            _ = try await model.service.deletePlayer(playerId: p.id)
            model.toast("\(p.name) removed", kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }
}

private struct RosterRow: View {
    let player: CommissionerPlayer
    let onReady: () -> Void
    let onRename: () -> Void
    let onReset: () -> Void
    let onCopyLink: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onReady) {
                Image(systemName: player.ready ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(player.ready ? Color.turf : Color.ink3)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(player.ready ? "Ready" : "Waiting")
            VStack(alignment: .leading, spacing: 2) {
                Text(player.name).font(TallyFont.display(16))
                Text("\(Format.plural(player.picksCount, "pick")) · \(Format.plural(player.weeksPlayed, "week")) · \(Format.plural(player.devices, "device")) · seen \(Format.relative(player.lastSeenAt))")
                    .sans(11).foregroundStyle(Color.ink2).lineLimit(2)
                if let code = player.code { Text("Code \(Codes.format(code))").sans(11, weight: .semibold).foregroundStyle(Color.ink3) }
            }
            Spacer()
            Menu {
                Button("Copy sign-in link", systemImage: "link", action: onCopyLink)
                Button("Rename", systemImage: "pencil", action: onRename)
                Button("Reset access (new code)", systemImage: "arrow.counterclockwise", action: onReset)
                Button("Remove from pool", systemImage: "trash", role: .destructive, action: onDelete)
            } label: {
                Image(systemName: "ellipsis.circle").font(.system(size: 22)).foregroundStyle(Color.ink2).padding(4)
            }
        }
        .padding(12)
        .cardFlat()
    }
}


// MARK: Taking the keys

/**
 How an account becomes the commissioner, and the only thing the owner PIN still does.

 The PIN used to *be* the commissioner: typed on every visit, worth as much as every account in the
 pool put together, and handed to anyone who needed to help. Now it is entered once and hands both
 offices to the account that typed it. Losing that account is still recoverable — typing it again
 attaches them to the new one.
 */
private struct ClaimKeysCard: View {
    @Environment(AppModel.self) private var model
    @State private var asking = false
    @State private var pin = ""
    @State private var busy = false
    @State private var error: String?
    @State private var shake = 0
    @FocusState private var focused: Bool

    /// This phone kept a PIN from when the PIN was the login. Offer it rather than make them find it.
    private var saved: String? { model.legacyPin }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("This isn't your pool to run").display(22)
            Text("\(model.boot.value?.poolName ?? "This pool") has a commissioner, and it isn't this account. They set the roster, the name and the invites — if something needs changing, ask them.")
                .sans(14).foregroundStyle(Color.ink2)
            DashedDivider().padding(.top, 6)
            if let saved, !asking {
                Text("This phone still has the pool's PIN saved from before. One tap moves the office onto your account, and the saved copy goes away once it has.")
                    .sans(12).foregroundStyle(Color.ink2)
                Button(busy ? "Checking…" : "Take the keys with the saved PIN") { Task { await submit(saved) } }
                    .buttonStyle(.tally(.primary, fullWidth: true))
                    .disabled(busy)
                if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
                Button("Type a different PIN") { asking = true }
                    .buttonStyle(.tally(.ghost, size: .small))
            } else if !asking {
                Button("I own this pool and lost access") { asking = true }
                    .buttonStyle(.tally(.ghost, size: .small))
            } else {
                Text("Owner PIN").sans(12, weight: .bold)
                Text("Entered once. It hands the office to the account you're signed in as — not a password you'll type again.")
                    .sans(12).foregroundStyle(Color.ink3)
                SecureField("PIN", text: $pin)
                    .tallyField(font: TallyFont.sans(18))
                    .keyboardType(.numberPad)
                    .focused($focused)
                    .shake(shake)
                    .accessibilityLabel("Owner PIN")
                if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
                Button(busy ? "Checking…" : "Take the keys") { Task { await submit(pin) } }
                    .buttonStyle(.tally(.primary, fullWidth: true))
                    .disabled(busy || pin.isEmpty)
                    .onAppear { focused = true }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func submit(_ candidate: String) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await model.service.claimRoles(pin: candidate)
            // Spent: it bought the offices, and the grant on the account is what matters now.
            model.spendLegacyPin()
            pin = ""
            await model.refreshBootstrap()
            model.toast("You're the commissioner of this pool. The office is attached to your account now.", kind: .success)
        } catch {
            let api = error.asAPIError
            self.error = api.message
            shake += 1
            // A PIN the server has rejected outright is worth nothing; stop offering it. A network
            // failure says nothing about the PIN, so that one is kept.
            if api.code == "BAD_PIN", candidate == model.legacyPin {
                model.spendLegacyPin()
                asking = true
            }
        }
    }
}
