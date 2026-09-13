import SwiftUI
import TallyKit

/**
 The commissioner's office, ported from `Admin.tsx`: results, players, tools, behind the PIN.
 The PIN is kept per pool in the Keychain. A PIN that stops working is dropped rather than
 replayed, because every retry counts against the server's lockout.
 */
struct AdminView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    enum Section: Hashable { case results, players, tools }
    @State private var section: Section = .results

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                if let pin = model.adminPin {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            TallySegmented(value: $section, options: [(.results, "Results"), (.players, "Players"), (.tools, "Tools")])
                            switch section {
                            case .results: AdminResultsView(pin: pin)
                            case .players: AdminPlayersView(pin: pin)
                            case .tools: AdminToolsView(pin: pin)
                            }
                        }
                        .padding(16)
                        .padding(.bottom, 40)
                    }
                } else {
                    ScrollView { PinGate().padding(16) }
                }
            }
            .navigationTitle("Commissioner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

/// Drops a PIN the server just refused, so the next screen asks for it again.
@MainActor
func handleAdminError(_ error: Error, model: AppModel) -> String {
    let err = error.asAPIError
    if err.code == "BAD_PIN" || err.code == "PIN_LOCKED" { model.setAdminPin(nil) }
    return err.message
}

struct PinGate: View {
    @Environment(AppModel.self) private var model
    @State private var pin = ""
    @State private var error: String?
    @State private var busy = false
    @State private var shake = 0
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Commissioner's office").display(24)
            Text("Enter the admin PIN to record results.").sans(14).foregroundStyle(Color.ink2)
            SecureField("PIN", text: $pin)
                .tallyField(font: TallyFont.body(18))
                .keyboardType(.numberPad)
                .focused($focused)
                .shake(shake)
                .accessibilityLabel("Admin PIN")
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            Button(busy ? "Checking…" : "Open up") { Task { await submit() } }
                .buttonStyle(.tally(.primary, fullWidth: true))
                .disabled(busy || pin.isEmpty)
                .padding(.top, 4)
        }
        .padding(20)
        .card()
        .onAppear { focused = true }
    }

    private func submit() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await model.service.verifyPin(pin)
            model.setAdminPin(pin)
        } catch {
            self.error = error.asAPIError.message
            shake += 1
        }
    }
}

// MARK: Results

struct AdminResultsView: View {
    @Environment(AppModel.self) private var model
    let pin: String
    @State private var week: Int?
    @State private var data: Loadable<AdminWeekResponse> = .idle
    @State private var pulling = false
    @State private var conflicts: [AdminPullConflict] = []

    private var activeWeek: Int { week ?? model.boot.value?.boardWeek ?? 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                WeekMenu(week: activeWeek, max: model.maxWeek, onChange: { week = $0 })
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Capsule().fill(Color.white))
                    .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                Spacer()
                Button(pulling ? "Pulling…" : "Pull final scores") { Task { await pull() } }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(pulling)
            }
            Text("Tap the winner. Tap again to clear. Boards update instantly. Automatic pulls only fill blanks, so anything you set here stands.")
                .sans(12).foregroundStyle(Color.ink2)
            if !conflicts.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("The feed disagrees with \(Format.plural(conflicts.count, "result")) you entered").sans(14, weight: .bold)
                    ForEach(conflicts) { c in
                        Text("\(c.gameId): you recorded \(c.recorded), the feed says \(c.feed) (\(c.awayScore)–\(c.homeScore)). Clear that game and pull again to take the feed's version.")
                            .sans(12).foregroundStyle(Color.ink2)
                    }
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .flagSoft, border: .flag)
            }
            switch data {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let res):
                ForEach(res.games) { g in
                    AdminGameRow(game: g, onSet: { winner in Task { await set(g, winner) } })
                }
            }
        }
        .task(id: activeWeek) { await load() }
    }

    private func load() async {
        if data.value == nil { data = .loading }
        do { data = .loaded(try await model.service.adminWeek(activeWeek, pin: pin)) } catch { data = .failed(APIError(status: 0, code: "X", message: handleAdminError(error, model: model))) }
    }

    private func set(_ g: AdminGame, _ winner: String?) async {
        do {
            _ = try await model.service.setResult(gameId: g.id, winner: winner, pin: pin)
            let text = winner == nil ? "Result cleared" : winner == "TIE" ? "Recorded as a tie" : "\(model.sport.teamOrPlaceholder(winner!).nickname) win recorded"
            model.toast(text, kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch {
            model.toast(handleAdminError(error, model: model), kind: .error)
        }
    }

    private func pull() async {
        pulling = true
        defer { pulling = false }
        do {
            let r = try await model.service.pullResults(week: activeWeek, pin: pin)
            conflicts = r.conflicts
            model.toast(r.ok ? "Applied \(r.applied), confirmed \(r.confirmed), \(r.pending) still pending." : (r.reason ?? "The feed was refused."), kind: r.ok ? .success : .error)
            await load()
            await model.refreshBootstrap()
        } catch {
            model.toast(handleAdminError(error, model: model), kind: .error)
        }
    }
}

struct AdminGameRow: View {
    @Environment(AppModel.self) private var model
    let game: AdminGame
    let onSet: (String?) -> Void

    var body: some View {
        let away = model.sport.teamOrPlaceholder(game.away)
        let home = model.sport.teamOrPlaceholder(game.home)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Format.kickoff(game.kickoffAt)).sans(12, weight: .semibold).foregroundStyle(Color.ink2)
                Spacer()
                Text(game.status == .final ? "Final" : game.locked ? "Live" : "Upcoming").sans(11, weight: .bold).foregroundStyle(Color.ink3)
                if let a = game.awayScore, let h = game.homeScore { Text("\(a)–\(h)").sans(12, weight: .bold) }
            }
            HStack(spacing: 8) {
                choice(away, selected: game.winner == away.abbr) { onSet(game.winner == away.abbr ? nil : away.abbr) }
                Button("Tie") { onSet(game.winner == "TIE" ? nil : "TIE") }
                    .buttonStyle(.tally(game.winner == "TIE" ? .primary : .plain, size: .small))
                choice(home, selected: game.winner == home.abbr) { onSet(game.winner == home.abbr ? nil : home.abbr) }
            }
            if !game.picks.isEmpty {
                Text(game.picks.sorted { $0.rank < $1.rank }.map { "\($0.name) \(model.sport.teamOrPlaceholder($0.team).display)·\(Scoring.points(forRank: $0.rank))" }.joined(separator: ", "))
                    .sans(11).foregroundStyle(Color.ink3)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: game.winner != nil ? .turfSoft : .white)
    }

    private func choice(_ team: Team, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                TeamSticker(team: team, size: 28, flat: true)
                Text(team.display)
            }
        }
        .buttonStyle(.tally(selected ? .turf : .plain, size: .small, fullWidth: true))
    }
}

// MARK: Players

struct AdminPlayersView: View {
    @Environment(AppModel.self) private var model
    let pin: String
    @State private var data: Loadable<AdminPlayersResponse> = .idle
    @State private var filter: Filter = .all
    @State private var renaming: AdminPlayer?
    @State private var newName = ""
    @State private var confirmDelete: AdminPlayer?

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
                    AdminPlayerRow(player: p,
                                   onReady: { Task { await setReady(p, !p.ready) } },
                                   onRename: { renaming = p; newName = p.name },
                                   onReset: { Task { await reset(p) } },
                                   onCopyLink: { copyLink(p) },
                                   onPutHere: { Task { await putHere(p) } },
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
    }

    private func load() async {
        if data.value == nil { data = .loading }
        do { data = .loaded(try await model.service.adminPlayers(pin: pin)) } catch { data = .failed(APIError(status: 0, code: "X", message: handleAdminError(error, model: model))) }
    }

    private func setReady(_ p: AdminPlayer, _ ready: Bool) async {
        do { _ = try await model.service.setReady(playerId: p.id, ready: ready, pin: pin); await load() } catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }

    private func rename(_ p: AdminPlayer, _ name: String) async {
        renaming = nil
        do { _ = try await model.service.renamePlayer(playerId: p.id, name: name, pin: pin); model.toast("Renamed to \(name)", kind: .success); await load(); await model.refreshBootstrap() }
        catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }

    private func reset(_ p: AdminPlayer) async {
        do {
            let r = try await model.service.resetAccess(playerId: p.id, pin: pin)
            UIPasteboard.general.string = Codes.format(r.code)
            model.toast("New code for \(p.name): \(Codes.format(r.code)) (copied). Their old devices are signed out.", kind: .success)
            await load()
        } catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }

    private func copyLink(_ p: AdminPlayer) {
        guard let code = p.code else { model.toast("\(p.name) has no code yet — reset access to issue one.", kind: .error); return }
        UIPasteboard.general.string = model.pool.webURL(path: "/welcome?claim=\(p.id)&code=\(code)").absoluteString
        model.toast("Sign-in link for \(p.name) copied. One tap signs that phone in.", kind: .success)
    }

    /// Puts an existing player on this phone with the PIN; their own devices keep working.
    private func putHere(_ p: AdminPlayer) async {
        do {
            let r = try await model.service.adminDevice(playerId: p.id, pin: pin)
            model.setPlayer(Identity(player: r.player, token: r.token, accountId: r.player.id, managed: true))
            model.toast("This phone can now pick as \(p.name). Switch from the account sheet.", kind: .success)
        } catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }

    private func delete(_ p: AdminPlayer) async {
        confirmDelete = nil
        do { _ = try await model.service.deletePlayer(playerId: p.id, pin: pin); model.toast("\(p.name) removed", kind: .success); await load(); await model.refreshBootstrap() }
        catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }
}

struct AdminPlayerRow: View {
    let player: AdminPlayer
    let onReady: () -> Void
    let onRename: () -> Void
    let onReset: () -> Void
    let onCopyLink: () -> Void
    let onPutHere: () -> Void
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
                Text("\(Format.plural(player.picksCount, "pick")) · \(Format.plural(player.weeksPlayed, "week")) · \(Format.plural(player.devices, "device"))\(player.adminDevices > 0 ? " (\(player.adminDevices) admin)" : "") · seen \(Format.relative(player.lastSeenAt))")
                    .sans(11).foregroundStyle(Color.ink2).lineLimit(2)
                if let code = player.code { Text("Code \(Codes.format(code))").sans(11, weight: .semibold).foregroundStyle(Color.ink3) }
            }
            Spacer()
            Menu {
                Button("Copy sign-in link", systemImage: "link", action: onCopyLink)
                Button("Rename", systemImage: "pencil", action: onRename)
                Button("Pick as them on this phone", systemImage: "iphone", action: onPutHere)
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

// MARK: Tools

struct AdminToolsView: View {
    @Environment(AppModel.self) private var model
    let pin: String
    @State private var status: Loadable<AdminStatus> = .idle
    @State private var busy: String?
    @State private var csv: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch status {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let s):
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(text: "Status")
                    row("Build", s.build)
                    row("Schedule", "\(s.scheduleVersion) · synced \(s.scheduleSyncedAt.map { Format.relative($0) } ?? "never")\(s.scheduleLastChanges.map { " · \($0) changes" } ?? "")")
                    if let e = s.scheduleSyncError { Text("Schedule sync error: \(e)").sans(12).foregroundStyle(Color.danger) }
                    row("Results", "last pull \(s.resultsSyncedAt.map { Format.relative($0) } ?? "never")")
                    if let e = s.resultsSyncError { Text("Results sync error: \(e)").sans(12).foregroundStyle(Color.danger) }
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardFlat()
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Tools")
                tool("Check nflverse now", note: "Moves any kickoff the NFL has flexed. Never touches picks or results.") { await sync("remote") }
                tool("Pull final scores (season)", note: "Fills in every finished game without a result. Anything you entered stands.") { await pull() }
                tool("Download picks CSV", note: "Every pick with its game, result and points — the backup.") { await export() }
                tool("Reload bundled schedule", note: "Re-applies the schedule shipped with the app's Worker.") { await sync("bundled") }
            }
            if let csv {
                ShareLink(item: csv) { Label("Share picks.csv", systemImage: "square.and.arrow.up") }
                    .buttonStyle(.tally(.primary, size: .small))
            }
            DashedDivider().padding(.top, 8)
            HStack(spacing: 8) {
                ShareLink(item: model.shareURL) { Label("Invite link", systemImage: "square.and.arrow.up") }
                    .buttonStyle(.tally(.plain, size: .small))
                Button("Forget PIN on this phone") { model.setAdminPin(nil) }.buttonStyle(.tally(.ghost, size: .small))
            }
        }
        .task { await load() }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(k).sans(12, weight: .bold).frame(width: 70, alignment: .leading)
            Text(v).sans(12).foregroundStyle(Color.ink2)
        }
    }

    private func tool(_ title: String, note: String, action: @escaping () async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(busy == title ? "Working…" : title) { Task { busy = title; await action(); busy = nil } }
                .buttonStyle(.tally(.plain, size: .small))
                .disabled(busy != nil)
            Text(note).sans(12).foregroundStyle(Color.ink2)
        }
    }

    private func load() async {
        if status.value == nil { status = .loading }
        do { status = .loaded(try await model.service.adminStatus(pin: pin)) } catch { status = .failed(APIError(status: 0, code: "X", message: handleAdminError(error, model: model))) }
    }

    private func sync(_ source: String) async {
        do { let r = try await model.service.syncSchedule(source: source, pin: pin); model.toast(r.summary, kind: .success); await load(); await model.refreshBootstrap() }
        catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }

    private func pull() async {
        do {
            let r = try await model.service.pullResults(week: nil, pin: pin)
            model.toast(r.ok ? "Applied \(r.applied), confirmed \(r.confirmed), \(r.pending) pending, \(r.conflicts.count) conflicts." : (r.reason ?? "The feed was refused."), kind: r.ok ? .success : .error)
            await load()
            await model.refreshBootstrap()
        } catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }

    private func export() async {
        do {
            let data = try await model.service.exportCSV(pin: pin)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("tally-picks-\(model.pool.slug).csv")
            try data.write(to: url)
            csv = url
            model.toast("CSV ready — share it to save a copy.", kind: .success)
        } catch { model.toast(handleAdminError(error, model: model), kind: .error) }
    }
}
