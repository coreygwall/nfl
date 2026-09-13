import SwiftUI
import TallyKit

/**
 The front door, ported from `Welcome.tsx`. Almost everyone here is signing up, so the name
 field leads; the ways back in for someone who already has a name — Face ID, the roster and a
 code, a link from the commissioner — sit underneath and take over when they are what arrived.
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
                VStack(alignment: .leading, spacing: 20) {
                    TeamMarquee().padding(.top, 8)
                    Hero(onRules: { showRules = true })
                    panel
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 40)
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
                ScrollView { RulesView().padding(16) }
                    .background(Color.paper)
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { showRules = false } } }
            }
        }
        .onAppear {
            if model.welcomeStartsNew { mode = .new; model.welcomeStartsNew = false }
        }
        .onChange(of: model.boot.value?.now, initial: true) { _, _ in
            applyPendingClaim()
        }
    }

    // MARK: Panels

    @ViewBuilder
    private var panel: some View {
        switch model.boot {
        case .idle, .loading:
            Spinner(label: "Getting the roster…").card()
        case .failed(let err):
            ErrorState(message: err.message) { Task { await model.refreshBootstrap() } }
        case .loaded:
            VStack(alignment: .leading, spacing: 14) {
                if let player = model.player, player.token != nil {
                    HStack {
                        (Text("This device picks as ") + Text(player.name).bold()).sans(14)
                        Spacer()
                        Button("Continue") { finish() }.buttonStyle(.tally(.plain, size: .small))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .cardFlat(fill: .flagSoft)
                }
                Group {
                    switch mode {
                    case .code:
                        if linkSigningIn, let target {
                            Spinner(label: "Signing you in as \(target.name)…")
                        } else if let target {
                            CodeForm(player: target, busy: busy, onSubmit: { code in try await claim(target, code: code) }, onBack: {
                                mode = players.isEmpty ? .new : .roster
                                self.target = nil
                            })
                        } else {
                            newPanel
                        }
                    case .taken:
                        takenPanel
                    case .differentiate:
                        differentiatePanel
                    case .roster:
                        rosterPanel
                    case .new:
                        newPanel
                    }
                }
                .transition(.opacity)
                .animation(.easeOut(duration: 0.16), value: modeKey)
                PasskeySignIn()
            }
            .padding(20)
            .card()
        }
    }

    private var modeKey: String {
        switch mode {
        case .new: return "new"
        case .roster: return "roster"
        case .taken: return "taken"
        case .differentiate: return "differentiate"
        case .code: return "code"
        }
    }

    private var newPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What should we call you?").display(20)
            Text("This is how you'll show up on the board. One account each — you can add entries for your kids or friends from it later.")
                .sans(14).foregroundStyle(Color.ink2)
            NameInput(text: $name, placeholder: "Your name", shake: shake) { error = nil }
            if let error {
                Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger)
            } else if let collision {
                HStack(spacing: 4) {
                    Text("Someone's already picking as “\(collision.name).”").sans(14, weight: .semibold).foregroundStyle(Color.ink2)
                    LinkButton(title: "That's me →") { target = collision.player; mode = .code }
                }
            }
            Button(busy ? "One sec…" : "Let's go") { Task { await submitName() } }
                .buttonStyle(.tally(.turf, fullWidth: true))
                .disabled(busy || Names.normalize(name).count < 2)
                .padding(.top, 4)
            if !players.isEmpty {
                DashedDivider().padding(.top, 4)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(players.count) \(players.count == 1 ? "player is" : "players are") already in.").sans(14, weight: .bold)
                    HStack(spacing: 4) {
                        Text("Joining from another device?").sans(14).foregroundStyle(Color.ink2)
                        LinkButton(title: "I already entered") { mode = .roster }
                    }
                }
            }
        }
    }

    private var rosterPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tap your name").display(20)
            Text("We'll ask for your code, then remember you on this device.").sans(14).foregroundStyle(Color.ink2)
            FlowLayout(spacing: 8) {
                ForEach(players) { p in
                    Button(p.name) { Task { await tapRoster(p) } }
                        .buttonStyle(.plain)
                        .sans(15, weight: .bold)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(Color.white))
                        .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                }
            }
            DashedDivider().padding(.top, 6)
            LinkButton(title: "Don't see your name? Add it →") { mode = .new; name = "" }
        }
    }

    private var takenPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("“\(target?.name ?? "")” is already in the pool").display(20)
            Text("If that's you picking from another device, your code will bring your picks and points with you.")
                .sans(14).foregroundStyle(Color.ink2)
            Button("That's me — I have a code") { mode = .code }.buttonStyle(.tally(.turf, fullWidth: true))
            Button("I'm a different \(target?.name ?? "")") {
                mode = .differentiate
                name = "\(target?.name ?? "") "
                error = nil
            }.buttonStyle(.tally(.plain, fullWidth: true))
            LinkButton(title: "Start over", color: .ink2) { target = nil; name = ""; mode = .new }.padding(.top, 4)
        }
    }

    private var differentiatePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Make it yours").display(20)
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
                    Text("e.g. \(target?.name ?? "") W. · Big \(target?.name ?? "")").foregroundStyle(Color.ink3)
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

    private func go(_ identity: Identity, returning: Bool) {
        model.setPlayer(identity)
        if returning { model.toast("Picking as \(identity.name). Not you? Tap your name up top to switch.") }
        finish()
    }

    private func welcomeNewPlayer(_ identity: Identity) {
        model.setPlayer(identity)
        model.toast("Welcome to the pool, \(identity.name)!", kind: .success)
        if !PasskeyOffer.dismissed(identity.id) {
            biometricOffer = identity
        } else {
            finish()
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

    /// A sign-in link (`/welcome?claim=<id>&code=<code>`) or "someone else's turn": go straight to that name.
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

/// Offered under the name form: a passkey knows who you are, so there is nothing to type.
struct PasskeySignIn: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Task { await go() }
            } label: {
                Label(busy ? "Waiting…" : "Sign in with Face ID", systemImage: "faceid")
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
            if e != .cancelled { self.error = "No passkey for this phone yet — use your name above." }
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
            Text("Prove you're \(player.name)").display(20)
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
                Text("Lost it? The commissioner can issue a new one.").sans(14).foregroundStyle(Color.ink2)
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

/// All 32 logos drifting past. Decorative.
struct TeamMarquee: View {
    @Environment(AppModel.self) private var model
    @State private var offset: CGFloat = 0
    private let size: CGFloat = 56
    private let gap: CGFloat = 14

    var body: some View {
        let strip = NFL.marquee + NFL.marquee
        let half = CGFloat(NFL.marquee.count) * (size + gap)
        HStack(alignment: .bottom, spacing: gap) {
            ForEach(Array(strip.enumerated()), id: \.offset) { i, abbr in
                TeamSticker(team: model.sport.teamOrPlaceholder(abbr), size: size)
                    .padding(.bottom, i % 3 == 1 ? 12 : i % 3 == 2 ? 4 : 0)
            }
        }
        .offset(x: offset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: size + 16)
        .clipped()
        .mask(LinearGradient(colors: [.clear, .black, .black, .black, .black, .clear], startPoint: .leading, endPoint: .trailing))
        .padding(.horizontal, -16)
        .accessibilityHidden(true)
        .onAppear {
            offset = 0
            withAnimation(.linear(duration: 42).repeatForever(autoreverses: false)) { offset = -half }
        }
    }
}

struct Hero: View {
    let onRules: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Chip(text: "2026 season", fill: .flag)
            Text("Pick five.\nRank them.")
                .font(TallyFont.display(42))
            Text("Every week, pick the winner of five games and rank them 1 to 5. Nail your #1 for 5 points, your #5 for 1. Most points over the season wins.")
                .sans(15).foregroundStyle(Color.ink2)
            HStack(spacing: 8) {
                ForEach(Array([("Pick 5", "winners"), ("Rank them", "1 to 5"), ("Score", "5·4·3·2·1")].enumerated()), id: \.offset) { i, step in
                    VStack(spacing: 2) {
                        Text("STEP \(i + 1)").font(TallyFont.display(10)).tracking(1).foregroundStyle(Color.ink3)
                        Text(step.0).font(TallyFont.display(15))
                        Text(step.1).sans(12).foregroundStyle(Color.ink2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .cardFlat()
                }
            }
            HStack(spacing: 4) {
                Text("No weekly deadline — each game locks at kickoff.").sans(12).foregroundStyle(Color.ink3)
                LinkButton(title: "Full rules", action: onRules)
            }
        }
    }
}
