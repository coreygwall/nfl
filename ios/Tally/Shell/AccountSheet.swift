import SwiftUI
import TallyKit

/**
 The account sheet, as on the web: most people see one line here and never touch it. The code
 stays hidden until someone actually needs another device; entries the account manages are one
 tap to switch; Face ID is offered, never required. Pools and the commissioner's office hang
 off the bottom, because both are rare.
 */
struct AccountSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var showCode = false
    @State private var adding = false
    @State private var copied = false

    private var boot: BootstrapResponse? { model.boot.value }
    private var others: [Identity] { model.people.filter { $0.id != model.player?.id } }
    private var accountName: String { boot?.account?.name ?? model.player?.name ?? "" }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.white.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 4) {
                            Text("Picking as").sans(14).foregroundStyle(Color.ink2)
                            Text(model.player?.name ?? "").sans(14, weight: .bold)
                        }

                        if !others.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionLabel(text: "Your other entries")
                                FlowLayout(spacing: 8) {
                                    ForEach(others) { p in
                                        Button {
                                            model.switchTo(p.id)
                                            dismiss()
                                        } label: {
                                            HStack(spacing: 4) {
                                                Text(p.name)
                                                if p.isManagedEntry { Text("YOURS").sans(10, weight: .bold).foregroundStyle(Color.ink3) }
                                            }
                                            .sans(14, weight: .bold)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 9)
                                            .background(Capsule().fill(Color.white))
                                            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }

                        Text("Add entries for your kids, family, or friends. Each gets their own picks and score, all managed by your account.")
                            .sans(14).foregroundStyle(Color.ink2)

                        PasskeyRow(hasPasskey: (boot?.myPasskeys ?? 0) > 0)

                        if adding {
                            AddEntryForm(onDone: { identity in
                                adding = false
                                model.setPlayer(identity)
                                dismiss()
                            }, onCancel: { adding = false })
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                DashedDivider()
                                if showCode, let code = boot?.myCode {
                                    DeviceCodeCard(code: code, name: accountName, accountId: boot?.account?.id)
                                } else {
                                    LinkButton(title: "Play on another device →") { showCode = true }
                                        .disabled(boot?.myCode == nil)
                                }
                                HStack(spacing: 8) {
                                    Button("Add an entry") { adding = true }.buttonStyle(.tally(.plain, size: .small))
                                    Button("I'm someone new") {
                                        model.welcomeStartsNew = true
                                        model.showWelcome = true
                                        dismiss()
                                    }.buttonStyle(.tally(.plain, size: .small))
                                }
                                if let roster = boot?.players, roster.count > model.people.count {
                                    SomeoneElse(roster: roster.filter { r in !model.people.contains { $0.id == r.id } }) { id in
                                        model.pendingClaim = PendingClaim(playerId: id, code: nil)
                                        model.showWelcome = true
                                        dismiss()
                                    }
                                }
                            }
                        }

                        DashedDivider().padding(.top, 6)
                        VStack(alignment: .leading, spacing: 10) {
                            SectionLabel(text: "More")
                            HStack(spacing: 8) {
                                Button {
                                    dismiss()
                                    model.showAdmin = true
                                } label: { Label("Commissioner", systemImage: "key.fill") }
                                .buttonStyle(.tally(.plain, size: .small))
                                Button {
                                    dismiss()
                                    model.showPools = true
                                } label: { Label("Pools", systemImage: "square.grid.2x2.fill") }
                                .buttonStyle(.tally(.plain, size: .small))
                            }
                            LinkButton(title: "Sign out on this phone", color: .danger) {
                                model.signOut()
                                dismiss()
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Your account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
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
            Text("Choose the name everyone will see on the board. No separate sign-in needed.").sans(14).foregroundStyle(Color.ink2)
            Text("Entry name").sans(14, weight: .bold)
            TextField("e.g. Parker", text: $name)
                .tallyField()
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .focused($focused)
                .disabled(busy)
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            HStack(spacing: 10) {
                Button(busy ? "Adding…" : "Add entry & make picks") { Task { await submit() } }
                    .buttonStyle(.tally(.primary))
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                Button("Cancel", action: onCancel).buttonStyle(.tally(.plain)).disabled(busy)
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
            DashedDivider()
            if done || hasPasskey {
                Label("\(Biometry.label) is on — it opens this app and the website.", systemImage: Biometry.symbolName)
                    .sans(14).foregroundStyle(Color.ink2)
            } else if Biometry.available {
                Button(busy ? "Waiting…" : "Set up \(Biometry.label)") { Task { await turnOn() } }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(busy)
                Text("Optional. Opens your account on a new phone, a laptop, or playtally.app without a code.")
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
            SectionLabel(text: "Play on another device")
            if let link {
                ShareLink(item: link) {
                    Label("Send myself a sign-in link", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.tally(.primary, size: .small, fullWidth: true))
                .padding(.top, 2)
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
