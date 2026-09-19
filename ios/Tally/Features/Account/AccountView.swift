import SwiftUI
import TallyKit
import UIKit

/**
 Your account, grouped the way Settings groups things: who you are, what you run, what you have
 switched on, and the doors out.

 It used to be one long column in which "add an entry", "set up Face ID", the appearance control
 and a row of small office buttons all carried the same weight, and the two things a commissioner
 opens most were the smallest controls on the page. The order here is how often each thing is
 touched: entries (mid-week, often), the offices (weekly, for the few who hold one), settings
 (once), the other-device link (once per device), and everything about Tally itself last. Every
 door is a full-width row with a chevron, so the page reads as a list of places rather than a
 form.

 Two things are deliberately elsewhere. *Which entry am I picking as* is the row of names above the
 picks (`EntryPicker`); here the entries are managed, not chosen. And *which pool* is the chip in
 the navigation bar, so the entries section is named after the pool to say whose entries these are.
 */
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var showCode = false
    @State private var adding = false
    @State private var attaching = false
    @State private var confirmSignOut = false
    /// Drawn from the pool's shell, or from a golf card's. The account is the same person either
    /// way; the entries and the offices are the pool's, so from a card they are not on the page.
    let inPool: Bool

    init(inPool: Bool = true) {
        self.inPool = inPool
    }

    private var boot: BootstrapResponse? { model.boot.value }
    private var accountName: String { boot?.account?.name ?? model.player?.name ?? "" }
    private var entries: [Identity] { model.entries }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
            if inPool {
                entriesSection
                if model.isCommissioner || model.isLeagueAdmin || model.legacyPin != nil { officeSection }
            }
            settingsSection
            deviceSection
            aboutSection
        }
        .task { await model.push.refreshPermission() }
    }

    // MARK: Who

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Signed in as")
            Text(accountName).display(28)
            PasskeyRow(hasPasskey: (boot?.myPasskeys ?? 0) > 0)
        }
    }

    // MARK: Entries

    private var entriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Entries in \(model.poolName)")
            // The entries belong to the account, so a device the server does not recognise can only
            // show the name it happens to have saved. Saying so beats drawing one row where a
            // family should be and leaving somebody to wonder where everybody went.
            if model.deviceUnrecognised {
                VStack(alignment: .leading, spacing: 8) {
                    Text("This phone isn't signed in to your account.").display(16)
                    Text("Your entries live on the account rather than on the phone, so only the name saved here is showing. Signing back in brings the rest across; nobody's picks are touched.")
                        .sans(13).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Sign back in") { model.showWelcome = true }
                        .buttonStyle(.tally(.primary, size: .small))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .flagSoft)
            }
            ForEach(entries) { p in
                let active = p.id == model.player?.id
                Button {
                    if !active { model.switchTo(p.id) }
                } label: {
                    HStack(spacing: 10) {
                        Text(p.name).font(TallyFont.display(16))
                        if p.isManagedEntry { Chip(text: "you manage", size: 10) }
                        Spacer()
                        if active { Chip(text: "picking", fill: .flag, size: 10, label: .onAccent) }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.cardPress)
                .modifier(TallyCard(hard: active, fill: .surface, border: .cardBorder, radius: TallyRadius.card, dashed: false))
            }
            if adding {
                AddEntryForm(onDone: { identity in
                    adding = false
                    model.setPlayer(identity)
                    model.tab = .picks
                }, onCancel: { adding = false })
            } else if attaching {
                AttachEntryForm(onDone: { identity in
                    attaching = false
                    model.setPlayer(identity)
                }, onCancel: { attaching = false })
            } else {
                HStack(spacing: 14) {
                    Button("Add an entry") { adding = true }
                        .buttonStyle(.tally(.plain, size: .small))
                    Button("Attach an existing one") { attaching = true }
                        .buttonStyle(.tally(.plain, size: .small))
                }
                Text("Add: for your kids, a partner, a friend who won't install anything. Attach: for a name that already joined the pool on its own — type it and its code, and it becomes one of your entries. Either way it gets its own picks and its own row on the board.")
                    .sans(12).foregroundStyle(Color.ink2)
            }
        }
    }

    // MARK: Offices

    /// Drawn only for someone with a door to open — or a PIN saved from when the PIN *was* the door,
    /// which the claim card inside the commissioner sheet turns into a proper grant.
    private var officeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Run the pool")
            SettingsGroup {
                if model.isCommissioner {
                    SettingsRow(title: "Commissioner", detail: "\(model.poolName): roster, name, invite, export", symbol: "key.fill") {
                        model.showCommissioner = true
                    }
                } else if model.legacyPin != nil {
                    SettingsRow(title: "Claim the commissioner's office", detail: "This phone still has the pool's PIN. One tap moves the office onto your account.", symbol: "key.fill") {
                        model.showCommissioner = true
                    }
                }
                if model.isLeagueAdmin {
                    if model.isCommissioner || model.legacyPin != nil { SettingsDivider() }
                    SettingsRow(title: "League office", detail: "Results, schedule and the score feed, for every pool on Tally", symbol: "building.columns.fill") {
                        model.showLeagueOffice = true
                    }
                }
            }
        }
    }

    // MARK: Settings

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Settings")
            SettingsGroup {
                notificationsRow
                SettingsDivider()
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Image(systemName: "circle.lefthalf.filled").font(.system(size: 15, weight: .bold)).frame(width: 24)
                        Text("Appearance").font(TallyFont.display(16))
                    }
                    TallySegmented(
                        value: Binding(get: { model.theme }, set: { model.theme = $0 }),
                        options: ThemeChoice.allCases.map { ($0, $0.label) }
                    )
                    Text("Auto matches your iPhone. Light or Dark stays selected until you change it.")
                        .sans(12).foregroundStyle(Color.ink2)
                }
                .padding(12)
                SettingsDivider()
                labsRow
            }
        }
    }

    /**
     Labs: built, and not yet on for everyone. Off by default, and off is not a reset — the cards
     stay on the phone for when golf comes back on.
     */
    private var labsRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            labsSwitch(
                title: "Golf cards",
                symbol: "flask.fill",
                on: Binding(get: { model.golfCards }, set: { model.golfCards = $0 }),
                detail: "A tally of whose shots your scramble team kept, hole by hole. Adds your cards to Home. Early: one phone keeps the card."
            )
            labsSwitch(
                title: "Pool pager",
                symbol: "arrow.left.arrow.right",
                on: Binding(get: { model.poolPager }, set: { model.poolPager = $0 }),
                detail: "A row at the top of the Pool tab to flick between your pools, when you have more than one. Home still switches too."
            )
        }
        .padding(12)
    }

    private func labsSwitch(title: String, symbol: String, on: Binding<Bool>, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.system(size: 15, weight: .bold)).frame(width: 24)
                Text(title).font(TallyFont.display(16))
                Chip(text: "labs", size: 10)
                Spacer()
                Toggle(title, isOn: Binding(get: { on.wrappedValue }, set: { value in
                    Haptics.tap()
                    on.wrappedValue = value
                }))
                .labelsHidden()
                .tint(.turf)
            }
            Text(detail)
                .sans(12).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /**
     One row that says where notifications stand and does the one thing that changes it.

     iOS only ever asks once, so the row's job changes with the answer: not asked yet, it asks;
     allowed, it opens the per-kind, per-entry switches; refused, it goes to Settings, which is the
     only place a refusal can be undone. A second in-app prompt after a "no" is silently a no.
     */
    @ViewBuilder private var notificationsRow: some View {
        switch model.push.permission {
        case .granted:
            SettingsRow(title: "Notifications", detail: "On · choose what to hear, and about whom", symbol: "bell.fill", tint: .turf) {
                model.showNotificationSettings = true
            }
        case .denied:
            SettingsRow(title: "Notifications", detail: "Off in Settings — iOS only asks once, so it has to be changed there", symbol: "bell.slash.fill") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
        case .notAsked, .unknown:
            SettingsRow(title: "Notifications", detail: "A message when each set of games is done, and a nudge if you haven't picked", symbol: "bell") {
                Task { await model.offerNotifications() }
            }
        }
    }

    // MARK: Another device

    private var deviceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Another device")
            if showCode, let code = boot?.myCode {
                DeviceCodeCard(code: code, name: accountName, accountId: boot?.account?.id)
            } else {
                SettingsGroup {
                    SettingsRow(title: "Sign in on another device", detail: "A one-tap link to text yourself, and the code to type if you'd rather", symbol: "iphone.and.arrow.forward") {
                        showCode = true
                    }
                    .disabled(boot?.myCode == nil)
                }
            }
        }
    }

    // MARK: About

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String
        return build.map { "\(short) (\($0))" } ?? short
    }

    /**
     What Tally is, and the way out.

     *How scoring works* used to be the first row here, which put a fact about **one pool** under a
     heading about the app, one line above its version number. It is the pool's, so it is in the
     pool's bar now — the question mark beside the megaphone (`RulesButton`) — and a phone holding
     two pools no longer has a settings page claiming to explain both at once.
     */
    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "About Tally")
            SettingsGroup {
                SettingsRow(title: "Join or start a pool", detail: "And what else Tally plays", symbol: "square.grid.2x2.fill") { model.showPools = true }
                SettingsDivider()
                HStack(spacing: 12) {
                    Image(systemName: "info.circle").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink3).frame(width: 24)
                    Text("Version \(version)").sans(13).foregroundStyle(Color.ink2)
                    Spacer()
                }
                .padding(12)
            }
            signOutRow
        }
    }

    /**
     Signing out is a button, and it asks first.

     It was an underlined link with the explanation in grey underneath — the visual weight of a
     footnote on the one control that ends the session, sitting directly below a list of full-width
     rows that all *look* like the things you tap. It is a real button now, in the app's own
     shape, so it reads as deliberate.

     **The word is red; the fill is not.** A solid `.danger` fill is this app's vocabulary for
     irreversible — deleting a golf card, where every hole goes with it — and signing out is not
     that: every pick stays on the board and the way back is Face ID. Spending the loud red here
     is how it stops meaning anything where it matters. The confirmation carries the same reassurance
     the grey line used to, at the moment somebody is actually deciding rather than before they
     have thought about it.
     */
    private var signOutRow: some View {
        Button("Sign out") {
            Haptics.tap()
            confirmSignOut = true
        }
        .buttonStyle(.tally(.plain, fullWidth: true, label: Color.danger))
        .padding(.top, 6)
        .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { model.signOut() }
            Button("Stay signed in", role: .cancel) {}
        } message: {
            Text("Your picks stay on the board and nothing is deleted. Signing back in on this phone needs \(Biometry.label) or your code.")
        }
    }
}

// MARK: Rows

/// A door: a symbol, a title, what is behind it, and a chevron. Full width, so it reads as a place.
private struct SettingsRow: View {
    let title: String
    var detail: String? = nil
    let symbol: String
    var tint: Color = .ink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(TallyFont.display(16)).foregroundStyle(Color.ink)
                    if let detail {
                        Text(detail).sans(12).foregroundStyle(Color.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.ink3)
                    .accessibilityHidden(true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Rows stacked in one card, the way Settings groups them.
private struct SettingsGroup<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .cardFlat()
    }
}

private struct SettingsDivider: View {
    var body: some View { DashedDivider().padding(.horizontal, 12) }
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

/**
 The other way an entry joins an account: it already exists.

 "Add an entry" only ever covers a name created from inside the account. Most of a pool joins the
 other way — typing a name straight into the shared link — and a name that got there first never
 had an owner to give it one, on this account or any other. This is how that gets corrected
 without a commissioner in the loop: the same proof `/players/:id/claim` already accepts for a
 fresh device, since if that code is enough to sign in as somebody, it is enough to say they are
 yours to manage.
 */
struct AttachEntryForm: View {
    @Environment(AppModel.self) private var model
    let onDone: (Identity) -> Void
    let onCancel: () -> Void
    @State private var name = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var nameFocused: Bool

    private var ready: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && Codes.normalize(code).count == Codes.length
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashedDivider()
            Text("Attach an existing entry").display(15)
            Text("The name they already play under, and the code that came with it — the same one that signs a second phone in as them.")
                .sans(14).foregroundStyle(Color.ink2)
            TextField("Their name", text: $name)
                .tallyField()
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .focused($nameFocused)
                .disabled(busy)
            TextField("Their code", text: $code)
                .tallyField(centered: true, font: TallyFont.display(20))
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .disabled(busy)
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            HStack(spacing: 10) {
                Button(busy ? "Attaching…" : "Attach") { Task { await submit() } }
                    .buttonStyle(.tally(.primary, size: .small))
                    .disabled(busy || !ready)
                Button("Cancel", action: onCancel).buttonStyle(.tally(.plain, size: .small)).disabled(busy)
            }
        }
        .onAppear { nameFocused = true }
    }

    private func submit() async {
        guard let player = model.player else { return }
        busy = true
        error = nil
        do {
            let r = try await model.service.attachEntry(name: name, code: Codes.normalize(code))
            model.toast("\(r.player.name) is now one of your entries.", kind: .success)
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
