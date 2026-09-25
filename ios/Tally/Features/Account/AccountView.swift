import SwiftUI
import TallyKit
import UIKit

/**
 Your account, in sections that each name what they are.

 The order is how often a thing is touched: who you are and the entries you pick for (mid-week,
 often), the offices (weekly, for the few who hold one), your preferences (once), how you get onto
 another device (once per device), and Tally itself last. Every door is a full-width row with a
 chevron, so the page reads as a list of places rather than a form.

 **There is no section called "Settings".** There was, and it was a tautology on a page that is
 entirely settings — and worse, it was a drawer: notifications, the appearance control and two
 feature flags shared one heading because none of them had a better one. They are different kinds
 of thing and they say so now. *Preferences* is what you have chosen; *Signing in* is how you get
 back to this account, which is why `PasskeyRow` moved down here out of the page header, where it
 was a caption under your name rather than the security control it is.

 Three things are deliberately elsewhere. *Which entry am I picking as* is the row of names above
 the picks (`EntryPicker`); here the entries are managed, not chosen. *Which pool* is Home. And
 *how this pool scores* is the question mark in the pool's own bar — it was the first row under
 "About Tally", which filed a fact about one pool under a heading about the app.
 */
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var showCode = false
    @State private var adding = false
    @State private var attaching = false
    @State private var confirmSignOut = false
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var deleteError: String?
    @State private var renaming: Identity?
    @State private var showLabs = false
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
            Text("Account").display(32)
                .accessibilityAddTraits(.isHeader)
            header
            if inPool {
                entriesSection
                if model.isCommissioner || model.isLeagueAdmin || model.legacyPin != nil { officeSection }
            }
            preferencesSection
            signingInSection
            aboutSection
        }
        .task { await model.push.refreshPermission() }
        .sheet(isPresented: $showLabs) { LabsSheet() }
    }

    // MARK: Who

    /**
     Who you are, and the one field that is unambiguously yours to fix.

     The page showed your name and let you change nothing about it, so a typo in your own name was
     a message to whoever runs the pool — an absurd errand, and one people simply do not run, which
     is why pools fill up with names nobody meant. `PasskeyRow` used to sit under here as a caption;
     it is a way back into your account, so it is in *Signing in* with the other one.
     */
    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Signed in as")
            if let account = accountIdentity, renaming?.id == account.id {
                RenameForm(identity: account, onDone: { renaming = nil }, onCancel: { renaming = nil })
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(accountName).display(28)
                        .fixedSize(horizontal: false, vertical: true)
                    if let account = accountIdentity {
                        Button("Change display name") { renaming = account }
                            .buttonStyle(.tally(.plain, size: .small))
                            .accessibilityHint("Changes the name shown to other players. You stay signed in to the same account.")
                    }
                }
            }
        }
    }

    /// The account's own player, as something the rename form can take. Nil before the first
    /// bootstrap lands, which is the one moment the name on screen is the cache's rather than the
    /// server's — and a rename of a name the server has not confirmed is not an edit worth offering.
    private var accountIdentity: Identity? {
        guard let account = boot?.account else { return nil }
        return entries.first { $0.id == account.id }
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
                if renaming?.id == p.id, p.id != boot?.account?.id {
                    RenameForm(identity: p, onDone: { renaming = nil }, onCancel: { renaming = nil })
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardFlat()
                } else {
                    HStack(spacing: 10) {
                        Button {
                            if !active { model.switchTo(p.id) }
                        } label: {
                            HStack(spacing: 10) {
                                Text(p.name).font(TallyFont.display(16)).lineLimit(1)
                                if p.isManagedEntry { Chip(text: "you manage", size: 10) }
                                Spacer(minLength: 4)
                                if active { Chip(text: "picking", fill: .flag, size: 10, label: .onAccent) }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        // Renaming is a second thing this row does, so it is a second target
                        // rather than a long press: a hidden gesture on the row that also
                        // switches who you are picking as is a gesture nobody finds and
                        // everybody triggers by accident.
                        Button {
                            Haptics.tap()
                            renaming = p
                        } label: {
                            Image(systemName: "pencil")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color.ink3)
                                .frame(width: 32, height: 32)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Rename \(p.name)")
                    }
                    .padding(.leading, 12)
                    .padding(.trailing, 6)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .modifier(TallyCard(hard: active, fill: .surface, border: .cardBorder, radius: TallyRadius.card, dashed: false))
                }
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

    // MARK: Preferences

    /**
     What you have chosen, as opposed to what you are.

     Three rows, and Labs is one of them rather than two switches and two paragraphs sitting open
     in the middle of the page — which is what pushed *Another device* and everything about Tally
     below the fold on a phone. Appearance stays inline because a segmented control *is* the
     control; a row that opens a sheet to show three words would be a tap for nothing.
     */
    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Preferences")
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
                SettingsRow(title: "Labs", detail: labsDetail, symbol: "flask.fill", tint: labsOn > 0 ? .turf : .ink) {
                    showLabs = true
                }
            }
        }
    }

    private var labsOn: Int { (model.golfCards ? 1 : 0) + (model.poolPager ? 1 : 0) }

    private var labsDetail: String {
        labsOn == 0 ? "Things Tally is still working on. Nothing on." : "\(labsOn) of \(LabsSheet.count) on"
    }

    // MARK: Signing in

    /**
     How you get back to this account — on this phone, and on the next one.

     Both rows answer the same question, and they were in two different places: the passkey offer
     was a caption under your name at the top of the page, and the device link was a section of its
     own near the bottom. A caption is not where somebody looks for the security control, and a
     section with one row in it is a heading doing no work.
     */
    private var signingInSection: some View {
        let hasPasskey = (boot?.myPasskeys ?? 0) > 0
        return VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Signing in")
            SettingsGroup {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Image(systemName: Biometry.symbolName)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(hasPasskey ? Color.turf : Color.ink)
                            .frame(width: 24)
                        Text(Biometry.label).font(TallyFont.display(16))
                        Spacer(minLength: 4)
                    }
                    PasskeyRow(hasPasskey: hasPasskey)
                }
                .padding(12)
                SettingsDivider()
                SettingsRow(title: "Sign in on another device", detail: "A one-tap link to text yourself, and the code to type if you'd rather", symbol: "iphone.and.arrow.forward") {
                    showCode = true
                }
                .disabled(boot?.myCode == nil)
            }
            // Below the group rather than inside it: the card draws its own ground, and a card
            // inside a card is how a page starts looking like a stack of receipts.
            if showCode, let code = boot?.myCode {
                DeviceCodeCard(code: code, name: accountName, accountId: boot?.account?.id)
            }
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
                // One page, on the web, rather than a copy in the app: a privacy policy has to
                // live at a public address anyway — Apple asks for one at submission — and two
                // copies of it is how one of them goes stale.
                SettingsRow(title: "Privacy", detail: "What Tally keeps, and what it never asks for", symbol: "hand.raised.fill") {
                    openURL(model.pool.origin.appending(path: "privacy"))
                }
                SettingsDivider()
                // A settings page with no way to get help sends people to whoever runs their pool
                // for things that are not their pool's fault — and the App Store listing needs a
                // support contact anyway. The subject arrives filled in so one inbox rule catches
                // everything the app sends.
                SettingsRow(title: "Get help", detail: "Something wrong, or an idea — write to Tally", symbol: "envelope.fill") {
                    if let url = Contact.supportMailto(subject: "Tally support · \(version)") { openURL(url) }
                }
                SettingsDivider()
                HStack(spacing: 12) {
                    Image(systemName: "info.circle").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink3).frame(width: 24)
                    Text("Version \(version)").sans(13).foregroundStyle(Color.ink2)
                    Spacer()
                }
                .padding(12)
            }
            signOutRow
            deleteRow
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

extension AccountView {
    /**
     Deleting the account (App Store Guideline 5.1.1(v)). This *is* irreversible, so it is the one
     control here that takes the solid `.danger` fill that signing out deliberately does not — and
     it asks first, saying the part nobody would guess: the picks stay on the board as "Former
     player", because they are part of other people's results. It waits for the server rather than
     firing and forgetting, since a deletion that quietly failed would leave somebody believing
     they were gone.
     */
    var deleteRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(deleting ? "Deleting…" : "Delete account") {
                Haptics.tap()
                confirmDelete = true
            }
            .buttonStyle(.tally(.danger, fullWidth: true))
            .disabled(deleting)
            if let deleteError {
                Text(deleteError).sans(13, weight: .semibold).foregroundStyle(Color.danger)
            }
        }
        .padding(.top, 18)
        .confirmationDialog("Delete \(accountName)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete my account", role: .destructive) {
                deleting = true
                deleteError = nil
                Task {
                    deleteError = await model.deleteAccount()
                    deleting = false
                }
            }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text(deleteMessage)
        }
    }

    private var deleteMessage: String {
        var lines = ["Your name comes off the pool and every device signed in as you is signed out."]
        if entries.count > 1 { lines.append("The other entries you pick for are deleted with it.") }
        lines.append("Your past picks stay on the board as “Former player”, so other people's results don't change. This can't be undone.")
        return lines.joined(separator: " ")
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
    var body: some View {
        Rectangle().fill(Color.line).frame(height: 1)
            .padding(.horizontal, 12)
            .accessibilityHidden(true)
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
                // The row above already says "Face ID", so this says what it does rather than
                // its own name for the second time.
                Text("On. Opens this app and playtally.app without a code.")
                    .sans(13).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            } else if Biometry.available {
                Button(busy ? "Waiting…" : "Set up \(Biometry.label)") { Task { await turnOn() } }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(busy)
                Text("Optional. Opens your account on a new phone, a laptop, or playtally.app without a code.")
                    .sans(12).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
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

// MARK: Renaming

/**
 Changing a name you are responsible for: your own, or one of the entries you manage.

 Inline rather than a sheet, because it is one field and the thing it changes is directly above it
 — the same shape `AddEntryForm` and `AttachEntryForm` already use on this page. The server is the
 one that decides whether the id is yours; the client only shows the control for names it already
 lists, which is the same set.

 The new name goes everywhere at once because `refreshBootstrap` is what every screen reads, and
 the session cache is updated in step so the picker above the picks does not keep the old one
 until the next launch.
 */
private struct RenameForm: View {
    @Environment(AppModel.self) private var model
    let identity: Identity
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }
    private var ready: Bool { trimmed.count >= 2 && trimmed != identity.name }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Display name").sans(13, weight: .semibold)
            TextField("Display name", text: $name)
                .tallyField()
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .focused($focused)
                .disabled(busy)
                .submitLabel(.done)
                .onSubmit { if ready { Task { await submit() } } }
            if let error {
                Text(error).sans(13, weight: .semibold).foregroundStyle(Color.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                Button(busy ? "Saving…" : "Save name") { Task { await submit() } }
                    .buttonStyle(.tally(.primary, size: .small))
                    .disabled(busy || !ready)
                Button("Cancel", action: onCancel)
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(busy)
            }
            Text("Other players will see this name on the standings. Changing it keeps the same account, entry and picks.")
                .sans(12).foregroundStyle(Color.ink3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .onAppear {
            name = identity.name
            focused = true
        }
    }

    private func submit() async {
        busy = true
        error = nil
        do {
            let r = try await model.service.renameMine(playerId: identity.id, name: trimmed)
            model.renamed(id: r.player.id, to: r.player.name)
            model.toast("Now \(r.player.name).", kind: .success)
            onDone()
        } catch {
            self.error = error.asAPIError.message
            busy = false
        }
    }
}

// MARK: Labs

/**
 What Tally is still working on, behind one door.

 It used to be two switches with a paragraph each, sitting open in the middle of the account page
 — about two hundred points of experiments between the appearance control and everything about
 Tally, which is how *Another device* ended up below the fold on a phone. Labs is by nature the
 least-visited thing on a settings page and was taking the most room on it.

 Off is not a reset, in either case: the golf cards stay on the phone and the pager's pools stay
 in the catalogue, so a switch flicked to see what it does costs nothing to flick back.
 */
struct LabsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    /// How many there are, so the row that opens this can say "1 of 2 on" without counting twice.
    static let count = 2

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Built, working, and not switched on for everybody yet. Turning one off leaves everything it made on your phone.")
                            .sans(13).foregroundStyle(Color.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                        SettingsGroup {
                            LabsSwitch(
                                title: "Golf cards",
                                symbol: "figure.golf",
                                on: Binding(get: { model.golfCards }, set: { model.golfCards = $0 }),
                                detail: "A tally of whose shots your scramble team kept, hole by hole, with longest drive and closest to the pin beside it. Adds your cards to Home. Early: one phone keeps the card."
                            )
                            SettingsDivider()
                            LabsSwitch(
                                title: "Pool pager",
                                symbol: "arrow.left.arrow.right",
                                on: Binding(get: { model.poolPager }, set: { model.poolPager = $0 }),
                                detail: "A row at the top of the Pool tab to flick between your pools, when you have more than one. Home still switches too."
                            )
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 24)
                }
            }
            .noZoom()
            .navigationTitle("Labs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct LabsSwitch: View {
    let title: String
    let symbol: String
    @Binding var on: Bool
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(on ? Color.turf : Color.ink)
                    .frame(width: 24)
                Text(title).font(TallyFont.display(16))
                Spacer(minLength: 8)
                Toggle(title, isOn: Binding(get: { on }, set: { value in
                    Haptics.tap()
                    on = value
                }))
                .labelsHidden()
                .tint(Color.turf)
            }
            Text(detail)
                .sans(12).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
    }
}
