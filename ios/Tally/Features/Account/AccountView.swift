import SwiftUI
import TallyKit
import UIKit

/**
 Two different jobs used to share one sheet, which is why it felt busy: *which name am I picking
 as* is a thing you do mid-week in two taps, and *my account* is a thing you visit once. The
 switcher stays on the name chip; everything else lives here, on its own tab.
 */
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @State private var showCode = false
    @State private var adding = false

    private var boot: BootstrapResponse? { model.boot.value }
    private var accountName: String { boot?.account?.name ?? model.player?.name ?? "" }
    private var entries: [Identity] { model.people }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 4) {
                SectionLabel(text: "Signed in as")
                Text(accountName).display(28)
                Text("One account, and every entry it picks for.")
                    .sans(14).foregroundStyle(Color.ink2)
            }

            entriesSection
            passkeySection
            notificationsSection
            anotherDeviceSection
            moreSection
        }
    }

    // MARK: Entries

    private var entriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Your entries")
            ForEach(entries) { p in
                let active = p.id == model.player?.id
                Button {
                    if !active { model.switchTo(p.id) }
                } label: {
                    HStack(spacing: 10) {
                        Text(p.name).font(TallyFont.display(16))
                        if p.isManagedEntry { Chip(text: "you manage", size: 10) }
                        Spacer()
                        if active { Chip(text: "picking", fill: .flag, size: 10) }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .modifier(TallyCard(hard: active, fill: .white, border: .ink, radius: TallyRadius.card, dashed: false))
            }
            if adding {
                AddEntryForm(onDone: { identity in
                    adding = false
                    model.setPlayer(identity)
                    model.tab = .picks
                }, onCancel: { adding = false })
            } else {
                Button("Add an entry") { adding = true }
                    .buttonStyle(.tally(.plain, size: .small))
                Text("For your kids, a partner, a friend who won't install anything. Each gets its own picks and its own row on the board; none of them needs a sign-in of its own.")
                    .sans(12).foregroundStyle(Color.ink2)
            }
        }
    }

    // MARK: Face ID

    private var passkeySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Signing in")
            PasskeyRow(hasPasskey: (boot?.myPasskeys ?? 0) > 0)
        }
    }

    // MARK: Notifications

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Notifications")
            NotificationsRow()
        }
    }

    // MARK: Another device

    private var anotherDeviceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Play on another device")
            if showCode, let code = boot?.myCode {
                DeviceCodeCard(code: code, name: accountName, accountId: boot?.account?.id)
            } else {
                Button("Show my sign-in link and code") { showCode = true }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(boot?.myCode == nil)
                Text("A one-tap link you can text yourself, and the code to type if you'd rather.")
                    .sans(12).foregroundStyle(Color.ink2)
            }
            if let roster = boot?.players, roster.count > entries.count {
                SomeoneElse(roster: roster.filter { r in !entries.contains { $0.id == r.id } }) { id in
                    model.pendingClaim = PendingClaim(playerId: id, code: nil)
                    model.showWelcome = true
                }
            }
        }
    }

    // MARK: More

    private var moreSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            DashedDivider()
            HStack(spacing: 8) {
                Button { model.showAdmin = true } label: { Label("Commissioner", systemImage: "key.fill") }
                    .buttonStyle(.tally(.plain, size: .small))
                Button { model.showPools = true } label: { Label("Pools", systemImage: "square.grid.2x2.fill") }
                    .buttonStyle(.tally(.plain, size: .small))
            }
            LinkButton(title: "Sign out on this phone", color: .danger) { model.signOut() }
                .padding(.top, 4)
            Text("Your picks stay on the board. Signing back in needs \(Biometry.label) or your code.")
                .sans(12).foregroundStyle(Color.ink3)
        }
    }
}

/// The name chip's sheet: who am I picking as, and nothing else to read.
struct EntrySwitcherSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var adding = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.white.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(model.people) { p in
                            let active = p.id == model.player?.id
                            Button {
                                if !active { model.switchTo(p.id) }
                                dismiss()
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: active ? "largecircle.fill.circle" : "circle")
                                        .font(.system(size: 20, weight: .bold))
                                        .foregroundStyle(active ? Color.turf : Color.ink3)
                                    Text(p.name).font(TallyFont.display(17))
                                    if p.isManagedEntry { Chip(text: "you manage", size: 10) }
                                    Spacer()
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .cardFlat()
                        }

                        if adding {
                            AddEntryForm(onDone: { identity in
                                adding = false
                                model.setPlayer(identity)
                                model.tab = .picks
                                dismiss()
                            }, onCancel: { adding = false })
                        } else {
                            Button("Add an entry") { adding = true }
                                .buttonStyle(.tally(.plain, size: .small))
                                .padding(.top, 2)
                            Text("Pick for someone who isn't going to install anything.")
                                .sans(12).foregroundStyle(Color.ink2)
                        }

                        DashedDivider().padding(.top, 8)
                        Button {
                            model.tab = .account
                            dismiss()
                        } label: {
                            Label("Account settings", systemImage: "person.crop.circle")
                        }
                        .buttonStyle(.tally(.plain, size: .small))
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Picking as")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

/// Every signed-in account can create a named entry it owns.
struct AddEntryForm: View {
    @Environment(AppModel.self) private var model
    let onDone: (Identity) -> Void
    let onCancel: () -> Void
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashedDivider()
            Text("Add an entry").display(15)
            Text("Choose the name everyone will see on the board. No separate sign-in needed.")
                .sans(14).foregroundStyle(Color.ink2)
            TextField("e.g. Parker", text: $name)
                .tallyField()
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .focused($focused)
                .disabled(busy)
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            HStack(spacing: 10) {
                Button(busy ? "Adding…" : "Add & make picks") { Task { await submit() } }
                    .buttonStyle(.tally(.primary, size: .small))
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                Button("Cancel", action: onCancel).buttonStyle(.tally(.plain, size: .small)).disabled(busy)
            }
        }
        .onAppear { focused = true }
    }

    private func submit() async {
        guard let player = model.player else { return }
        busy = true
        error = nil
        do {
            let r = try await model.service.addEntry(name: name)
            model.toast("\(r.player.name)'s entry is ready. Let's make their picks!", kind: .success)
            onDone(Identity(player: r.player, token: player.token, accountId: player.accountId ?? player.id, managed: true))
        } catch {
            self.error = error.asAPIError.message
            busy = false
        }
    }
}

/// Face ID / Touch ID: an offer, never a requirement.
struct PasskeyRow: View {
    @Environment(AppModel.self) private var model
    let hasPasskey: Bool
    @State private var busy = false
    @State private var done = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if done || hasPasskey {
                Label("\(Biometry.label) is on — it opens this app and the website.", systemImage: Biometry.symbolName)
                    .sans(14).foregroundStyle(Color.ink2)
            } else if Biometry.available {
                Button(busy ? "Waiting…" : "Set up \(Biometry.label)") { Task { await turnOn() } }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(busy)
                Text("Optional. Opens your account on a new phone, a laptop, or playtally.app without a code.")
                    .sans(12).foregroundStyle(Color.ink2)
            } else {
                Text("This device has no biometrics, so your code is the way onto another one.")
                    .sans(12).foregroundStyle(Color.ink2)
            }
        }
    }

    private func turnOn() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await PasskeyFlows.addPasskey(service: model.service, passkeys: model.passkeys)
            done = true
            model.toast("\(Biometry.label) is ready for your account.", kind: .success)
            await model.refreshBootstrap()
        } catch {
            let e = PasskeyService.translate(error)
            if e != .cancelled { model.toast(e.localizedDescription, kind: .error) }
        }
    }
}

/**
 Getting onto a second device. The link is the easy path — one tap signs that device in, and it
 opens this app rather than the browser on any iPhone that has it. The code stays underneath for
 reading aloud to someone across the room.
 */
struct DeviceCodeCard: View {
    @Environment(AppModel.self) private var model
    let code: String
    let name: String
    let accountId: String?
    @State private var copied = false

    private var link: URL? {
        accountId.map { model.pool.webURL(path: "/welcome?claim=\($0)&code=\(code)") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let link {
                ShareLink(item: link) {
                    Label("Send myself a sign-in link", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.tally(.primary, size: .small, fullWidth: true))
                Text("Text or AirDrop it to yourself. One tap signs that device in as \(name). Treat it like a password.")
                    .sans(12).foregroundStyle(Color.ink2)
            }
            DashedDivider().padding(.top, 6)
            Text("OR TYPE THIS CODE").sans(10, weight: .bold).foregroundStyle(Color.ink3)
            HStack {
                Text(Codes.format(code)).font(TallyFont.display(24)).tracking(3)
                Spacer()
                Button(copied ? "Copied" : "Copy") {
                    UIPasteboard.general.string = Codes.format(code)
                    copied = true
                    Task { try? await Task.sleep(for: .seconds(2)); copied = false }
                }
                .buttonStyle(.tally(.plain, size: .small))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: .flagSoft)
    }
}

struct SomeoneElse: View {
    let roster: [RosterPlayer]
    let onPick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Someone else's turn on this phone?").sans(12).foregroundStyle(Color.ink3)
            FlowLayout(spacing: 6) {
                ForEach(roster.prefix(6)) { p in
                    Button(p.name) { onPick(p.id) }
                        .buttonStyle(.plain)
                        .sans(12, weight: .bold)
                        .foregroundStyle(Color.ink2)
                        .underline()
                }
            }
        }
    }
}

/// Chips that wrap onto the next line, the way `flex-wrap` does.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/**
 What the app will tell you about, and how to change your mind.

 Once iOS has been answered it will not ask again, so a "no" here is a trip to Settings — which is
 what the button does rather than pretending a second prompt would work.
 */
private struct NotificationsRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch model.push.permission {
            case .granted:
                HStack(spacing: 8) {
                    Image(systemName: "bell.fill").foregroundStyle(Color.turf)
                    Text("On").font(TallyFont.display(16))
                    Spacer()
                    Chip(text: "you'll hear", fill: .turfSoft, size: 10)
                }
                Text("One message per entry each time a set of games finishes — the 1:00 games, the 4:00 games, Sunday night — plus a nudge if your picks aren't in.")
                    .sans(12).foregroundStyle(Color.ink2)
            case .denied:
                Text("Turned off in Settings.").font(TallyFont.display(16))
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(.tally(.plain, size: .small))
                Text("iOS only asks once, so this has to be changed there.")
                    .sans(12).foregroundStyle(Color.ink2)
            case .notAsked, .unknown:
                Button("Tell me when my games finish") {
                    Task { await model.offerNotifications() }
                }
                .buttonStyle(.tally(.plain, size: .small))
                Text("A message when each set of games is done, and a nudge if you haven't picked.")
                    .sans(12).foregroundStyle(Color.ink2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat()
        .task { await model.push.refreshPermission() }
    }
}
