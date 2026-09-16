import SwiftUI
import TallyKit

/**
 The front door. It is Tally's, not the pool's: whoever opens this app has been handed a link by
 a friend and has no idea what Tally is, so the mark and one plain sentence come first and the
 pool they are joining sits underneath as a fact rather than a headline.

 Almost nobody should ever read it. A device with a passkey is signed in before this draws
 (`attemptAutomaticSignIn`), and a device that has been here before is remembered. What is left
 is the genuinely new person — a name and a button — with the ways back in for someone who
 already has an account kept one tap away rather than in front of them.
 */
struct WelcomeView: View {
    @Environment(AppModel.self) private var model

    enum Mode { case new, roster, taken, differentiate, code }

    @State private var mode: Mode = .new
    @State private var name = ""
    @State private var error: String?
    /// The roster entry we are claiming, or that a typed name collided with.
    @State private var target: Player?
    @State private var shake = 0
    @State private var busy = false
    @State private var linkSigningIn = false
    @State private var biometricOffer: Identity?
    @State private var showRules = false

    private var players: [RosterPlayer] { model.boot.value?.players ?? [] }
    private var taken: [String: RosterPlayer] {
        Dictionary(players.map { (Names.key($0.name), $0) }, uniquingKeysWith: { a, _ in a })
    }
    /// The roster entry this typed name would collide with, if any.
    private var collision: RosterPlayer? {
        Names.normalize(name).count >= 2 ? taken[Names.key(name)] : nil
    }

    var body: some View {
        ZStack {
            PaperBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Hero()
                    panel
                    Footnote(onRules: { showRules = true })
                }
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 48)
            }
        }
        .sheet(item: $biometricOffer) { identity in
            BiometricOfferSheet(player: identity) {
                PasskeyOffer.dismiss(identity.id)
                biometricOffer = nil
                finish()
            }
        }
        .sheet(isPresented: $showRules) {
            NavigationStack {
                ScrollView { RulesView().padding(20) }
                    .background(Color.paper)
                    .navigationTitle("How to play")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { showRules = false } } }
            }
        }
        .task { await attemptAutomaticSignIn() }
        .onAppear {
            if model.welcomeStartsNew { mode = .new; model.welcomeStartsNew = false }
        }
        .onChange(of: model.boot.value?.now, initial: true) { _, _ in applyPendingClaim() }
    }

    // MARK: The card

    @ViewBuilder
    private var panel: some View {
        switch model.boot {
        case .idle, .loading:
            Spinner(label: "Finding the pool…")
                .frame(maxWidth: .infinity)
                .card()
        case .failed(let err):
            ErrorState(message: err.message) { Task { await model.refreshBootstrap() } }
        case .loaded:
            VStack(alignment: .leading, spacing: 16) {
                PoolBadge(poolName: model.poolName, sport: model.poolType.sports.first ?? "NFL", season: model.boot.value?.season)

                if let player = model.player, player.token != nil {
                    Button {
                        finish()
                    } label: {
                        HStack(spacing: 8) {
                            Text("Continue as \(player.name)").lineLimit(1)
                            Image(systemName: "arrow.right")
                        }
                    }
                    .buttonStyle(.tally(.turf, fullWidth: true))
                }

                Group {
                    switch mode {
                    case .code:
                        if linkSigningIn, let target {
                            Spinner(label: "Signing you in as \(target.name)…")
                        } else if let target {
                            CodeForm(
                                player: target,
                                busy: busy,
                                onSubmit: { code in try await claim(target, code: code) },
                                onBack: {
                                    mode = players.isEmpty ? .new : .roster
                                    self.target = nil
                                }
                            )
                        } else {
                            newPanel
                        }
                    case .taken: takenPanel
                    case .differentiate: differentiatePanel
                    case .roster: rosterPanel
                    case .new: newPanel
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
    }

    private var newPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What should we call you?").display(21)
            Text("This is the name everyone sees on the board.")
                .sans(14).foregroundStyle(Color.ink2)
            NameInput(text: $name, placeholder: "Your name", shake: shake) { error = nil }
            if let error {
                Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger)
            } else if let collision {
                HStack(spacing: 4) {
                    Text("Someone's already “\(collision.name).”").sans(14, weight: .semibold).foregroundStyle(Color.ink2)
                    LinkButton(title: "That's me →") { target = collision.player; mode = .code }
                }
            }
            Button(busy ? "One sec…" : "Let's go") { Task { await submitName() } }
                .buttonStyle(.tally(.turf, fullWidth: true))
                .disabled(busy || Names.normalize(name).count < 2)
                .padding(.top, 2)

            PasskeySignIn()

            if !players.isEmpty {
                DashedDivider().padding(.top, 6)
                HStack(spacing: 4) {
                    Text("Already in this pool?").sans(14).foregroundStyle(Color.ink2)
                    LinkButton(title: "Find your name") { mode = .roster }
                }
            }
        }
    }

    private var rosterPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tap your name").display(21)
            Text("We'll ask for your code once, then remember you on this phone.")
                .sans(14).foregroundStyle(Color.ink2)
            FlowLayout(spacing: 8) {
                ForEach(players) { p in
                    Button(p.name) { Task { await tapRoster(p) } }
                        .buttonStyle(.plain)
                        .sans(15, weight: .bold)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(Color.surface))
                        .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                }
            }
            PasskeySignIn()
            DashedDivider().padding(.top, 6)
            LinkButton(title: "Not listed? Add your name →") { mode = .new; name = "" }
        }
    }

    private var takenPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("“\(target?.name ?? "")” is already here").display(21)
            Text("If that's you on another device, your code brings your picks and points with you.")
                .sans(14).foregroundStyle(Color.ink2)
            Button("That's me — I have a code") { mode = .code }
                .buttonStyle(.tally(.turf, fullWidth: true))
            Button("I'm a different \(target?.name ?? "")") {
                mode = .differentiate
                name = "\(target?.name ?? "") "
                error = nil
            }
            .buttonStyle(.tally(.plain, fullWidth: true))
            LinkButton(title: "Start over", color: .ink2) { target = nil; name = ""; mode = .new }
                .padding(.top, 2)
        }
    }

    private var differentiatePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Make it yours").display(21)
            Text("Two \(target?.name ?? "")s would be chaos on the board. Add a last initial or a nickname.")
                .sans(14).foregroundStyle(Color.ink2)
            NameInput(text: $name, placeholder: "\(target?.name ?? "") W.", shake: shake) { error = nil }
            Group {
                if let error {
                    Text(error).foregroundStyle(Color.danger)
                } else if let collision {
                    Text("Still “\(collision.name)” — change it a little more.").foregroundStyle(Color.danger)
                } else if Names.normalize(name).count >= 2 {
                    Text("Nice — “\(Names.normalize(name))” is free.").foregroundStyle(Color.turf)
                } else {
                    Text("e.g. \(target?.name ?? "") W.").foregroundStyle(Color.ink3)
                }
            }
            .sans(14, weight: .semibold)
            Button(busy ? "One sec…" : "Join as this name") { Task { await submitName() } }
                .buttonStyle(.tally(.turf, fullWidth: true))
                .disabled(busy || collision != nil || Names.normalize(name).count < 2)
            LinkButton(title: "Actually, that other \(target?.name ?? "") is me", color: .ink2) {
                mode = .taken
                name = target?.name ?? ""
            }
        }
    }

    // MARK: Actions

    private func finish() {
        model.pendingClaim = nil
        model.showWelcome = false
    }

    /// Every way in ends here. Anyone who did *not* arrive by passkey is offered one on the way
    /// past, because that single step is what makes the next device — and the website — open
    /// with a look and nothing typed.
    private func go(_ identity: Identity, returning: Bool, offerPasskey: Bool = true) {
        model.setPlayer(identity)
        if returning { model.toast("Picking as \(identity.name). Not you? Tap your name up top to switch.") }
        if offerPasskey, Biometry.available, !PasskeyOffer.dismissed(identity.id) {
            biometricOffer = identity
            return
        }
        finish()
    }

    private func welcomeNewPlayer(_ identity: Identity) {
        model.toast("Welcome to the pool, \(identity.name)!", kind: .success)
        go(identity, returning: false)
    }

    /// One quiet attempt as the app opens. If this phone holds a passkey for the pool's domain —
    /// created here or in Safari on the website — the system shows Face ID and that is the
    /// entire sign-in. If it holds none, nothing appears and the name form is already on screen.
    private func attemptAutomaticSignIn() async {
        guard model.player == nil, model.pendingClaim == nil, !model.welcomeStartsNew, !model.triedAutoPasskey else { return }
        model.triedAutoPasskey = true
        do {
            let identity = try await PasskeyFlows.signIn(service: model.service, passkeys: model.passkeys, onlyIfAvailable: true)
            model.setPlayer(identity)
            model.toast("Welcome back, \(identity.name).", kind: .success)
            model.showWelcome = false
        } catch {
            // No passkey on this device, or it was waved away. Nothing to report.
        }
    }

    /// Tapping a name on the roster: unclaimed names come free, claimed ones want the code.
    private func tapRoster(_ p: RosterPlayer) async {
        error = nil
        target = p.player
        if !p.claimed {
            if let r = try? await model.service.claim(playerId: p.id, code: nil) {
                go(Identity(player: r.player, token: r.token, accountId: r.player.id), returning: true)
                return
            }
            // Someone claimed it between the roster loading and this tap: fall through to the code.
        }
        mode = .code
    }

    private func claim(_ target: Player, code: String) async throws {
        busy = true
        defer { busy = false }
        let r = try await model.service.claim(playerId: target.id, code: code)
        go(Identity(player: r.player, token: r.token, accountId: r.player.id), returning: true)
    }

    private func submitName() async {
        let check = Names.validate(name)
        guard let clean = check.name else {
            error = check.message
            shake += 1
            return
        }
        // Caught before the round trip: this name is already on the roster.
        if let collision {
            target = collision.player
            mode = .taken
            error = nil
            return
        }
        error = nil
        busy = true
        defer { busy = false }
        do {
            let res = try await model.service.createPlayer(name: clean)
            if res.created, let token = res.token {
                welcomeNewPlayer(Identity(player: res.player, token: token, accountId: res.player.id))
            } else {
                // Someone claimed it between our roster load and this submit.
                target = res.player
                mode = .taken
            }
        } catch {
            self.error = error.asAPIError.message
            shake += 1
        }
    }

    /// A sign-in link (`/welcome?claim=<id>&code=<code>`), or "someone else's turn on this phone".
    private func applyPendingClaim() {
        guard let pending = model.pendingClaim, let boot = model.boot.value else { return }
        guard let found = boot.players.first(where: { $0.id == pending.playerId }) else {
            model.pendingClaim = nil
            return
        }
        target = found.player
        mode = .code
        guard let code = pending.code, !linkSigningIn else { return }
        linkSigningIn = true
        model.pendingClaim = nil
        Task {
            defer { linkSigningIn = false }
            do {
                let r = try await model.service.claim(playerId: found.id, code: Codes.normalize(code))
                go(Identity(player: r.player, token: r.token, accountId: r.player.id), returning: true)
            } catch {
                self.error = error.asAPIError.message
            }
        }
    }
}

// MARK: - Brand

/// Tally first, because most people arriving here have never heard of it.
private struct Hero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image("TallyMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(Color.ink).offset(x: 3, y: 3))
                    .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(Color.ink, lineWidth: 2))
                Text("Tally").font(TallyFont.display(40))
            }
            Text("Free pools to play with your friends.")
                .font(TallyFont.display(27))
                .fixedSize(horizontal: false, vertical: true)
            Text("Pick, rank, argue about it all season. Tally keeps score so nobody has to run a spreadsheet.")
                .sans(15).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            TeamStrip()
        }
        .accessibilityElement(children: .combine)
    }
}

/// A few logos for warmth. Deliberately a fixed, short row: it has to fit the narrowest phone
/// without pushing the layout wider than the screen.
private struct TeamStrip: View {
    @Environment(AppModel.self) private var model
    private let abbrs = ["KC", "PHI", "DET", "BUF", "SF", "DAL"]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(abbrs, id: \.self) { abbr in
                TeamSticker(team: model.sport.teamOrPlaceholder(abbr), size: 38)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
    }
}

/// Which pool this link was for. A fact, not a headline — you are here because a friend sent it.
private struct PoolBadge: View {
    let poolName: String
    let sport: String
    let season: Int?

    var body: some View {
        HStack(spacing: 10) {
            FlagMark(size: 34) {
                Image(systemName: "football.fill").font(.system(size: 15, weight: .bold))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("YOU'RE JOINING").font(TallyFont.sans(10, weight: .bold)).tracking(1.2).foregroundStyle(Color.ink3)
                Text(poolName).font(TallyFont.display(18)).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(season.map { "\(sport) \($0)" } ?? sport)
                .sans(12, weight: .bold)
                .foregroundStyle(Color.ink2)
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: .flagSoft)
    }
}

private struct Footnote: View {
    let onRules: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("Five picks a week, ranked. No weekly deadline.").sans(13).foregroundStyle(Color.ink3)
                LinkButton(title: "How it plays", color: .ink2, action: onRules)
            }
            Text("Free, and always will be.").sans(13).foregroundStyle(Color.ink3)
        }
    }
}

// MARK: - Ways back in

/// Remembering that the offer was waved away, so it is made once.
enum PasskeyOffer {
    private static let key = "tally.passkeyOfferDismissed"
    static func dismissed(_ playerId: String) -> Bool {
        (UserDefaults.standard.stringArray(forKey: key) ?? []).contains(playerId)
    }
    static func dismiss(_ playerId: String) {
        var seen = UserDefaults.standard.stringArray(forKey: key) ?? []
        if !seen.contains(playerId) { seen.append(playerId) }
        UserDefaults.standard.set(seen, forKey: key)
    }
}

/// A passkey knows who you are, so there is nothing to type.
struct PasskeySignIn: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Task { await go() }
            } label: {
                Label(busy ? "Waiting…" : "Sign in with \(Biometry.label)", systemImage: Biometry.symbolName)
            }
            .buttonStyle(.tally(.plain, size: .small, fullWidth: true))
            .disabled(busy)
            if let error { Text(error).sans(12).foregroundStyle(Color.ink2) }
        }
        .padding(.top, 2)
    }

    private func go() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let identity = try await PasskeyFlows.signIn(service: model.service, passkeys: model.passkeys)
            model.setPlayer(identity)
            model.toast("Picking as \(identity.name). Not you? Tap your name up top to switch.")
            model.pendingClaim = nil
            model.showWelcome = false
        } catch {
            // Cancelling the sheet is not a failure, and neither is having no passkey yet.
            let e = PasskeyService.translate(error)
            if e != .cancelled { self.error = "No passkey on this phone yet — use your name above, and we'll offer to set one up." }
        }
    }
}

struct CodeForm: View {
    let player: Player
    let busy: Bool
    let onSubmit: (String) async throws -> Void
    let onBack: () -> Void
    @State private var code = ""
    @State private var error: String?
    @State private var shake = 0
    @FocusState private var focused: Bool

    private var ready: Bool { Codes.normalize(code).count == Codes.length }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Prove you're \(player.name)").display(21)
            Text("Open the pool on the device you already use and tap your name up top — your code is there.")
                .sans(14).foregroundStyle(Color.ink2)
            TextField("QRT4-9MKP", text: $code)
                .tallyField(centered: true, font: TallyFont.display(24))
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .textContentType(.oneTimeCode)
                .focused($focused)
                .shake(shake)
                .onChange(of: code) { _, new in
                    let formatted = Codes.formatWhileTyping(new)
                    if formatted != new { code = formatted }
                    error = nil
                }
                .accessibilityLabel("Your device code")
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            Button(busy ? "Checking…" : "Pick as \(player.name)") { Task { await submit() } }
                .buttonStyle(.tally(.turf, fullWidth: true))
                .disabled(busy || !ready)
            DashedDivider().padding(.top, 4)
            HStack(spacing: 4) {
                Text("Lost it? The commissioner can issue a new one.").sans(13).foregroundStyle(Color.ink2)
                LinkButton(title: "Go back", action: onBack)
            }
        }
        .onAppear { focused = true }
    }

    private func submit() async {
        guard ready else { return }
        error = nil
        do {
            try await onSubmit(Codes.normalize(code))
        } catch {
            self.error = error.asAPIError.message
            shake += 1
        }
    }
}

struct NameInput: View {
    @Binding var text: String
    let placeholder: String
    let shake: Int
    let onEdit: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .tallyField(font: TallyFont.sans(18))
            .textInputAutocapitalization(.words)
            .textContentType(.name)
            .autocorrectionDisabled()
            .focused($focused)
            .shake(shake)
            .onChange(of: text) { _, _ in onEdit() }
            .accessibilityLabel("Your name")
    }
}
