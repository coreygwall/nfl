import SwiftUI
import TallyKit

// MARK: Select

struct SelectStep: View {
    @Environment(AppModel.self) private var model
    let games: [Game]
    let draft: Draft
    let frozen: [Pick]
    let lockedNow: (Game) -> Bool
    let pickCounts: [String: PickCount]
    let allLocked: Bool
    let hasSaved: Bool
    let currentWeek: Int
    let week: Int
    let now: Date
    let openCount: Int
    let picked: Int
    let slotCount: Int
    let status: (label: String, fill: Color)?
    let onPick: (Game, String, CGRect?) -> Void

    @State private var showStarted: Bool? = nil

    private var full: Bool { picked >= slotCount && slotCount > 0 }
    private var frozenByGame: [String: Pick] { Dictionary(frozen.map { ($0.gameId, $0) }, uniquingKeysWith: { a, _ in a }) }
    private var open: [Game] { games.filter { !lockedNow($0) } }
    private var started: [Game] { games.filter(lockedNow) }
    private let columns = [GridItem(.adaptive(minimum: 320), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if allLocked {
                VStack(alignment: .leading, spacing: 4) {
                    (Text("Every Week \(week) game has kicked off. ").bold() + Text(hasSaved ? "Your picks are in the books." : "No picks this week."))
                        .sans(14)
                    if currentWeek != week {
                        LinkButton(title: "Pick Week \(currentWeek) →") { model.pickWeek = currentWeek }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .paper2)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("Pick \(slotCount) winner\(slotCount == 1 ? "" : "s")").display(30)
                        if picked > 0 { Text("\(picked)/\(slotCount) in").sans(15, weight: .bold).foregroundStyle(Color.ink3) }
                        if let status { Chip(text: status.label, fill: status.fill) }
                    }
                    Text(full ? "That's your five. Rank them next — surest pick 5 pts, least sure 1."
                              : "Tap a team to pick it. Choose five, then rank them — surest pick 5 pts, least sure 1.")
                        .sans(14).foregroundStyle(Color.ink2)
                    HStack(spacing: 8) {
                        HStack(spacing: 3) {
                            Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                            Text("No weekly deadline").sans(10, weight: .bold)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(Color.surface))
                        .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                        Text("Games lock one by one at kickoff · \(openCount) open").sans(12).foregroundStyle(Color.ink3)
                    }
                }
            }

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(open) { g in card(g) }
            }

            if !started.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    DashedDivider().padding(.top, 12)
                    Button {
                        withAnimation { showStarted = !(showStarted ?? !frozen.isEmpty) }
                    } label: {
                        HStack {
                            SectionLabel(text: "Already kicked off (\(started.count))")
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color.ink3)
                                .rotationEffect(.degrees((showStarted ?? !frozen.isEmpty) ? 180 : 0))
                        }
                    }
                    .buttonStyle(.plain)
                    if showStarted ?? !frozen.isEmpty {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(started) { g in card(g) }
                        }
                    }
                }
            }
        }
    }

    private func card(_ g: Game) -> some View {
        GameCard(
            game: g,
            locked: lockedNow(g),
            now: now,
            selection: draft.selections[g.id] ?? frozenByGame[g.id]?.team,
            frozenPick: frozenByGame[g.id],
            counts: pickCounts[g.id],
            muted: full && draft.selections[g.id] == nil && frozenByGame[g.id] == nil,
            onPick: { onPick(g, $0, $1) }
        )
    }
}

// MARK: Rank

struct RankStep: View {
    @Environment(AppModel.self) private var model
    let frozen: [Pick]
    let order: [String]
    let availableRanks: [Int]
    let selections: [String: String]
    let gamesById: [String: Game]
    let merged: [Pick]
    let pending: Bool
    let error: String?
    let offline: Bool
    let onOrder: ([String]) -> Void
    let onBack: () -> Void
    let onSubmit: () -> Void

    private var possible: Int { merged.reduce(0) { $0 + Scoring.points(forRank: $1.rank) } }
    private var canSubmit: Bool { !pending && !offline && !(order.isEmpty && frozen.isEmpty) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button(action: onBack) { Label("Back", systemImage: "chevron.left") }
                .buttonStyle(.tally(.plain, size: .small))
                .disabled(pending)
            VStack(alignment: .leading, spacing: 4) {
                Text("How sure are you?").display(26)
                (Text("Drag to reorder — top pick ") + Text("5 points").bold() + Text(", bottom one ") + Text("1").bold() + Text(". Up to ") + Text("\(possible)").bold() + Text(" this week."))
                    .sans(14).foregroundStyle(Color.ink2)
            }
            if !frozen.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Locked in")
                    ForEach(frozen) { p in
                        HStack(spacing: 12) {
                            RankBadge(rank: p.rank, muted: true)
                            TeamSticker(team: model.sport.teamOrPlaceholder(p.team), size: 44, flat: true)
                            MatchupText(pick: p, game: gamesById[p.gameId], compact: true)
                            Spacer()
                            Image(systemName: "lock.fill").foregroundStyle(Color.ink3)
                        }
                        .padding(10)
                        .cardFlat(fill: Color.paper2.opacity(0.7))
                    }
                }
            }
            ReorderList(order: order, availableRanks: availableRanks, selections: selections, gamesById: gamesById, onOrder: onOrder)
            Text("You can still change a pick until that game kicks off.").sans(12).foregroundStyle(Color.ink3)
            if error != nil || offline {
                HStack(alignment: .top, spacing: 12) {
                    Text(offline ? "You're offline. Your picks are saved on this phone — lock them in once you're back." : (error ?? ""))
                        .sans(14, weight: .semibold)
                    if !offline {
                        Spacer()
                        Button("Try again", action: onSubmit).buttonStyle(.tally(.plain, size: .small)).disabled(pending)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .dangerSoft, border: .danger)
            }
            SlideToLock(pending: pending, disabled: !canSubmit, onSubmit: onSubmit)
        }
    }
}

// MARK: Done

/**
 Five picks, saved: the one moment in the week the app is allowed to make a fuss.

 It is choreographed rather than faded in, because the order is the point. The three rising taps of
 `Haptics.lockedIn` start first and the stamp is timed so their heaviest beat lands on the frame
 the stamp hits the page — a thud you feel in the hand at the instant you see it. The page gives a
 couple of points under the blow, a ring of ink spreads from the edge of the stamp, the paper goes
 up, and then the five are counted out one by one with a tick each: a tally, being kept.

 It all used to be `.transition`s on the stamp and the rows, which never ran — a transition only
 fires on the view being inserted, and here the whole step is inserted at once — so the payoff of
 the whole flow was a cross-fade. This drives the sequence from state instead, and plays it once:
 coming back to the tab later finds the stamp already down. With Reduce Motion on, everything is
 simply there, and the haptic still says it.
 */
struct DoneStep: View {
    @Environment(AppModel.self) private var model
    let name: String
    let week: Int
    let picks: [Pick]
    let gamesById: [String: Game]
    let onReview: () -> Void
    let shareURL: URL
    /// The instant the stamp lands, which is where the confetti belongs.
    var onStamp: () -> Void = {}

    @State private var down = false
    /// How many of the five have been counted onto the page.
    @State private var counted = 0
    /// Bumped on impact; the page's give and the ring of ink both key off it.
    @State private var thud = 0

    private struct Ripple {
        var scale: CGFloat = 1
        var opacity: Double = 0
    }

    var body: some View {
        let sorted = picks.sorted { $0.rank < $1.rank }
        VStack(spacing: 8) {
            Stamp(text: "Locked in")
                .background {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.turf, lineWidth: 3)
                        .keyframeAnimator(initialValue: Ripple(), trigger: thud) { ring, v in
                            ring.scaleEffect(v.scale).opacity(v.opacity)
                        } keyframes: { _ in
                            KeyframeTrack(\.scale) {
                                MoveKeyframe(1)
                                CubicKeyframe(1.7, duration: 0.5)
                            }
                            KeyframeTrack(\.opacity) {
                                MoveKeyframe(0.6)
                                LinearKeyframe(0, duration: 0.5)
                            }
                        }
                }
                .scaleEffect(down ? 1 : 2.8)
                .rotationEffect(.degrees(down ? -6 : -18))
                .opacity(down ? 1 : 0)
                .blur(radius: down ? 0 : 4)
                .padding(.top, 24)
            Text("Nice, \(name).").display(26).padding(.top, 16)
            Text("Your five are in for Week \(week).").sans(14).foregroundStyle(Color.ink2)
            VStack(spacing: 8) {
                ForEach(Array(sorted.enumerated()), id: \.element.id) { i, p in
                    let shown = i < counted
                    HStack(spacing: 12) {
                        RankBadge(rank: p.rank, size: .small)
                            .scaleEffect(shown ? 1 : 0.4)
                        TeamSticker(team: model.sport.teamOrPlaceholder(p.team), size: 36, flat: true)
                        MatchupText(pick: p, game: gamesById[p.gameId])
                        Spacer()
                    }
                    .padding(8)
                    .cardFlat()
                    // Opacity and offset rather than insertion, so the list has its full height
                    // from the first frame and nothing underneath moves as the rows arrive.
                    .opacity(shown ? 1 : 0)
                    .offset(x: shown ? 0 : -28)
                    .rotationEffect(.degrees(shown ? 0 : -3), anchor: .leading)
                }
            }
            .frame(maxWidth: 400)
            .padding(.top, 16)
            HStack(spacing: 8) {
                Button("Done", action: onReview).buttonStyle(.tally(.plain))
                Button("See the board") {
                    model.boardScope = .week
                    model.boardWeek = week
                    model.tab = .board
                }.buttonStyle(.tally(.primary))
            }
            .padding(.top, 16)
            ShareLink(item: shareURL) {
                Label("Invite someone to join", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.tally(.ghost, size: .small))
            .foregroundStyle(Color.ink2)
        }
        .frame(maxWidth: .infinity)
        // The page taking the blow: down a few points and back, once, on impact.
        .keyframeAnimator(initialValue: CGFloat(0), trigger: thud) { page, y in
            page.offset(y: y)
        } keyframes: { _ in
            KeyframeTrack {
                CubicKeyframe(5, duration: 0.05)
                SpringKeyframe(0, duration: 0.45, spring: .bouncy)
            }
        }
        .task { await play(count: sorted.count) }
    }

    private func play(count: Int) async {
        // Once. The tab keeps this view's state, so coming back to it finds the stamp down.
        guard !down else { return }
        guard !Motion.reduced else {
            down = true
            counted = count
            Haptics.lockedIn()
            onStamp()
            return
        }
        // Let the step's own fade settle, so the stamp is the first thing that moves.
        try? await Task.sleep(for: .milliseconds(120))
        // The taps lead: their heaviest beat is 0.18s in, and this spring first reaches the page
        // about 0.1s after it starts — so the stamp leaves 0.08s after the first tap.
        Haptics.lockedIn()
        try? await Task.sleep(for: .milliseconds(80))
        withAnimation(.spring(response: 0.24, dampingFraction: 0.58)) { down = true }
        try? await Task.sleep(for: .milliseconds(100))
        thud += 1
        onStamp()
        try? await Task.sleep(for: .milliseconds(300))
        for i in 0..<count {
            withAnimation(Motion.slap) { counted = i + 1 }
            Haptics.tap()
            try? await Task.sleep(for: .milliseconds(95))
        }
    }
}

// MARK: Review

/**
 The week, once your five are in — which on a Sunday is the screen that matters.

 It used to be a receipt: five rows, a points total, "3 of 4 right so far". That is fine on a
 Tuesday and useless at four o'clock, when what you want to know is which of yours is on, whether
 it is winning, what is still to play for and where that leaves you. So this is the lock screen's
 Live Activity, drawn large: the same phase rule, the same words under the header, the same banked
 / outstanding pairing on the number, and the place beside it — with the room a phone screen has
 to add the score of each game and who is leading it. One rule and one wording, so the lock screen
 and the tab never disagree about the afternoon.
 */
struct ReviewStep: View {
    @Environment(AppModel.self) private var model
    let week: Int
    let games: [Game]
    let myPicks: [Pick]
    let pickCounts: [String: PickCount]
    let lockedNow: (Game) -> Bool
    let anyUnlocked: Bool
    let submitted: Int
    let standing: WeekResponse.Standing?
    let status: (label: String, fill: Color)?
    let onEdit: () -> Void

    private struct Row: Identifiable {
        let pick: Pick
        let game: Game?
        let outcome: PickOutcome
        let points: Int
        var id: String { pick.gameId }
    }

    private var rows: [Row] {
        let byId = Dictionary(games.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return myPicks.sorted { $0.rank < $1.rank }.map { p in
            let g = byId[p.gameId]
            let scored = Scoring.score(p, game: g, now: model.now)
            return Row(pick: p, game: g, outcome: scored.outcome, points: scored.points)
        }
    }

    /// The same state the lock screen is pushed, worked out from the week in hand.
    private var state: WeekActivityAttributes.ContentState {
        .from(picks: myPicks, games: games, now: model.now, place: standing?.place, field: standing?.field)
    }

    var body: some View {
        let rows = rows
        let state = state
        let started = games.filter(lockedNow)
        let nextKick = games.filter { !lockedNow($0) }.map(\.kickoffAt).min()

        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 8) {
                            Text("Your five").display(26)
                            if let status { Chip(text: status.label, fill: status.fill) }
                        }
                        WeekStatusLine(state: state)
                        Text(state.settledCount == 0
                             ? "\(Format.plural(rows.count, "pick")) in · \(Format.plural(submitted, "player")) submitted"
                             : "\(state.wonCount) of \(state.settledCount) right so far")
                            .sans(12).foregroundStyle(Color.ink3)
                        if anyUnlocked, let nextKick {
                            HStack(spacing: 3) {
                                Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                                Text("Next game locks \(Format.slot(nextKick))")
                            }
                            .sans(12).foregroundStyle(Color.ink3)
                        }
                    }
                    Spacer(minLength: 12)
                    WeekScore(state: state)
                }
                VStack(spacing: 8) {
                    ForEach(rows) { row in
                        HStack(spacing: 12) {
                            RankBadge(rank: row.pick.rank, size: .small)
                            TeamSticker(team: model.sport.teamOrPlaceholder(row.pick.team), size: 40, dimmed: row.outcome == .tie, lost: row.outcome == .loss, flat: true)
                            MatchupText(pick: row.pick, game: row.game)
                            Spacer()
                            OutcomeTag(outcome: row.outcome, points: row.points)
                                .id(row.outcome)
                                .transition(.scale(scale: 0.4).combined(with: .opacity))
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OutcomeStyle.fill(row.outcome)))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(OutcomeStyle.border(row.outcome), lineWidth: 2))
                        .modifier(SettleFlourish(outcome: row.outcome))
                        .animation(Motion.slap, value: row.outcome)
                    }
                }
                HStack(spacing: 8) {
                    if anyUnlocked {
                        Button("Edit picks", action: onEdit).buttonStyle(.tally(.plain, size: .small))
                    }
                    Button("See the board") {
                        model.boardScope = .week
                        model.boardWeek = week
                        model.tab = .board
                    }.buttonStyle(.tally(.primary, size: .small))
                }
            }
            .padding(16)
            .card()

            if !started.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Who picked whom").display(18)
                    ForEach(started) { g in
                        WhoPickedWhom(game: g, counts: pickCounts[g.id] ?? PickCount(away: 0, home: 0), mine: myPicks.first { $0.gameId == g.id }?.team)
                    }
                }
            }
        }
    }
}

/**
 A pick settling while you watch.

 On a Sunday this screen is left open on the arm of a sofa, and a result used to arrive as a row
 quietly changing colour on the next poll. Now it arrives: a win swells a touch and a band of green
 light passes across it, left to right, as the "+5" pops in; a loss gives a short shake of the
 head. Only a change *from* live or not-yet counts — a row that was already decided when the screen
 opened is history, not news. The buzz for the same moment is the board's (`Haptics.won`/`lost`
 in `WeekBoardView.react`); this is what the eye gets. Nothing moves with Reduce Motion on, and
 the colours still change.
 */
private struct SettleFlourish: ViewModifier {
    let outcome: PickOutcome
    @State private var won = 0
    @State private var lost = 0

    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { geo in
                    LinearGradient(
                        colors: [Color.turf2.opacity(0), Color.turf2.opacity(0.4), Color.turf2.opacity(0)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: 90)
                    .rotationEffect(.degrees(16))
                    .keyframeAnimator(initialValue: CGFloat(-140), trigger: won) { band, x in
                        band.offset(x: x)
                    } keyframes: { _ in
                        KeyframeTrack {
                            MoveKeyframe(-140)
                            CubicKeyframe(geo.size.width + 60, duration: 0.75)
                            MoveKeyframe(-140)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
            .keyframeAnimator(initialValue: CGFloat(1), trigger: won) { row, scale in
                row.scaleEffect(scale)
            } keyframes: { _ in
                KeyframeTrack {
                    CubicKeyframe(1.03, duration: 0.12)
                    SpringKeyframe(1, duration: 0.4, spring: .bouncy)
                }
            }
            .keyframeAnimator(initialValue: CGFloat(0), trigger: lost) { row, x in
                row.offset(x: x)
            } keyframes: { _ in
                KeyframeTrack {
                    LinearKeyframe(-7, duration: 0.06)
                    LinearKeyframe(6, duration: 0.07)
                    LinearKeyframe(-4, duration: 0.07)
                    LinearKeyframe(2, duration: 0.06)
                    SpringKeyframe(0, duration: 0.2)
                }
            }
            .onChange(of: outcome) { old, new in
                guard !Motion.reduced, old == .live || old == .pending else { return }
                if new == .win { won += 1 }
                if new == .loss { lost += 1 }
            }
    }
}

/// The phase, in a sentence, with the lock screen's dot in front of it.
private struct WeekStatusLine: View {
    let state: WeekActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 6) {
            if let dot { Circle().fill(dot).frame(width: 7, height: 7) }
            Text(state.statusLine(clock: Format.time))
                .sans(14, weight: .semibold).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var dot: Color? {
        switch state.phase {
        case .live: return .turf
        case .between: return .flag
        case .final: return state.place == 1 ? .flag : nil
        case .locked, .watching: return nil
        }
    }
}

/**
 Banked, and what is still out there — the lock screen's pairing, at phone size.

 Before anything settles a big 0 is an accurate number and a discouraging one, so the stake leads
 instead. Once points exist they lead and roll as they change, with the outstanding total behind
 them in green as the reason to keep watching. The place sits underneath when there is one, and
 takes the flag on a won week.
 */
private struct WeekScore: View {
    let state: WeekActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if state.phase == .locked {
                Text("\(state.possible)").font(TallyFont.display(40)).monospacedDigit().foregroundStyle(Color.ink2)
                Text("TO PLAY").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(state.points)").font(TallyFont.display(40)).monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(Motion.settle, value: state.points)
                    if state.possible > 0 {
                        Text("+\(state.possible)").font(TallyFont.display(16)).monospacedDigit().foregroundStyle(Color.turf)
                            .accessibilityLabel("\(state.possible) still to play for")
                    }
                }
                Text("POINTS").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
            }
            if let place = state.place, let field = state.field, field > 1 {
                let winner = place == 1 && state.phase == .final
                Text("\(Scoring.ordinal(place)) of \(field)")
                    .sans(11, weight: .bold).monospacedDigit()
                    .foregroundStyle(winner ? Color.onAccent : Color.ink2)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(winner ? Color.flag : Color.paper2))
                    .padding(.top, 4)
                    .accessibilityLabel("\(Scoring.ordinal(place)) of \(field)")
            }
        }
    }
}

/// Side-by-side bars of who took which side, once a game has kicked off.
struct WhoPickedWhom: View {
    @Environment(AppModel.self) private var model
    let game: Game
    let counts: PickCount
    let mine: String?

    var body: some View {
        let away = model.sport.teamOrPlaceholder(game.away)
        let home = model.sport.teamOrPlaceholder(game.home)
        let total = max(counts.total, 1)
        let homeColor = home.primary.lowercased() == away.primary.lowercased() ? home.secondary : home.primary
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                TeamSticker(team: away, size: 28, flat: true)
                Text(away.display).sans(14, weight: .bold).foregroundStyle(mine == game.away ? Color.turf : Color.ink)
                Spacer()
                Text(game.winner.map { $0 == "TIE" ? "Tie" : "\(model.sport.teamOrPlaceholder($0).display) won" } ?? "In progress")
                    .sans(12).foregroundStyle(Color.ink3)
                Spacer()
                Text(home.display).sans(14, weight: .bold).foregroundStyle(mine == game.home ? Color.turf : Color.ink)
                TeamSticker(team: home, size: 28, flat: true)
            }
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(Color(hex: away.primary)).frame(width: geo.size.width * CGFloat(counts.away) / CGFloat(total))
                    Spacer(minLength: 0)
                    Rectangle().fill(Color(hex: homeColor)).frame(width: geo.size.width * CGFloat(counts.home) / CGFloat(total))
                }
            }
            .frame(height: 12)
            .background(Color.paper2)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            HStack {
                Text("\(counts.away) picked")
                Spacer()
                Text("\(counts.home) picked")
            }
            .sans(11, weight: .semibold).foregroundStyle(Color.ink2)
        }
        .padding(12)
        .cardFlat()
    }
}
