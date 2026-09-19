import SwiftUI
import TallyKit

/**
 The tee you are standing on, and the names.

 Built for a cart between shots: the four names are the biggest things on the page, one tap each,
 and the hole ends on one of two deliberate taps — *Holed it* if the last shot went in, *Tap-in*
 if it was a gimme. A par four is four taps. Undo is always one step back, whatever the step was,
 and a finished hole stays finished until it is reopened, so a stray tap after the ball is in
 cannot turn a birdie into a par. Finishing moves to the next hole still to play, and says what
 the last one was in a toast rather than a screen, so the next tee is already up.
 */
struct RoundView: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String

    /// The word for the hole that just went in, stamped over the page for a beat before the next
    /// tee slides up. Nil is the whole rest of the time.
    @State private var stamp: HoleStamp?

    private var card: ScrambleCard? { golf.card(cardId) }

    var body: some View {
        if let card {
            let entry = card.entry(card.currentHole) ?? HoleEntry(hole: card.currentHole)
            VStack(alignment: .leading, spacing: 14) {
                if card.isComplete { RoundDoneCard(card: card) }
                if entry.strokes.isEmpty, let last = card.lastFinished, last.hole != card.currentHole {
                    LastHoleStrip(card: card, entry: last)
                }
                HoleHeader(card: card)
                if let side = card.standing(on: card.currentHole) {
                    ContestStrip(card: card, contest: side.contest, winner: side.winner)
                }
                StrokeStrip(card: card, entry: entry)
                if entry.finished {
                    FinishedHoleCard(card: card, entry: entry)
                } else {
                    // Keyed by hole so the review state cannot follow the screen to the next tee.
                    HoleEntryControls(card: card, entry: entry) { done in stamped(done, on: card) }
                        .id(card.currentHole)
                }
            }
            .animation(Motion.settle, value: card.currentHole)
            .overlay {
                if let stamp {
                    StampCard(stamp: stamp)
                        .transition(.scale(scale: 2.4).combined(with: .opacity))
                        .allowsHitTesting(false)
                }
            }
            .animation(Motion.slap, value: stamp)
        } else {
            EmptyState(title: "This card is gone", body: "Pick another from the menu, or start a new one.")
        }
    }
}

    /**
     The hole is in: stamp it, then move on.

     The swipe finishes the hole without advancing, the word comes down over the page (birdie in
     turf, anything else in ink), and a beat later the card steps to the next tee on its own —
     nothing to tap, which was the ask. `advance(card:from:)` is guarded by the hole, so if
     somebody has already flicked to another tee in that beat they are not moved twice.
     */
    private func stamped(_ done: HoleEntry, on card: ScrambleCard) {
        let par = card.par(done.hole)
        let word = ScrambleTally.label(score: done.score, par: par)
        stamp = HoleStamp(text: word, under: done.score < par)
        if done.score < par { Haptics.won() } else { Haptics.lockedIn() }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.15))
            stamp = nil
            golf.advance(card: card.id, from: done.hole)
        }
    }
}

private struct HoleStamp: Equatable {
    let text: String
    /// Under par earns the turf; a par or worse is stamped in ink, which is a fact and not a prize.
    let under: Bool
}

/// The word, slapped down at an angle on a card of its own so it reads over whatever is under it.
private struct StampCard: View {
    let stamp: HoleStamp

    var body: some View {
        Stamp(text: stamp.text, color: stamp.under ? .turf : .ink)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).fill(Color.surface))
            .overlay(RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).strokeBorder(Color.ink, lineWidth: 2))
            .shadow(color: Color.shadow, radius: 0, x: 4, y: 4)
            .rotationEffect(.degrees(-6))
            .accessibilityLabel("Hole finished: \(stamp.text)")
    }
}

// MARK: The hole

private struct HoleHeader: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard

    private var hole: Int { card.currentHole }

    var body: some View {
        HStack(spacing: 10) {
            StepButton(symbol: "chevron.left", enabled: hole > 1) { golf.go(card: card.id, to: hole - 1) }
            VStack(alignment: .leading, spacing: 4) {
                Text("Hole \(hole)")
                    .font(TallyFont.display(28))
                    .contentTransition(.numericText())
                HStack(spacing: 6) {
                    ParChip(card: card, hole: hole)
                    if let entry = card.entry(hole), entry.finished {
                        Chip(text: ScrambleTally.label(score: entry.score, par: card.par(hole)), fill: .turfSoft, size: 11)
                    }
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(ScrambleTally.toParText(card.toPar))
                    .font(TallyFont.display(28))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text(card.throughHole == 0 ? "not started" : "through \(card.throughHole)")
                    .sans(11, weight: .bold)
                    .foregroundStyle(Color.ink3)
            }
            StepButton(symbol: "chevron.right", enabled: hole < card.holeCount) { golf.go(card: card.id, to: hole + 1) }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .card()
    }
}

/**
 The hole's par, and the one tap that corrects it.

 The setup sheet guesses par 72 laid out the usual way, because nobody fills in eighteen numbers on
 the first tee. So the truth arrives one tee at a time, and this is where it arrives: tap to cycle
 3, 4, 5. It used to take the card menu, the edit sheet, *Set the pars*, finding the hole and
 saving — five layers away from the screen you are looking at when you notice.
 */
private struct ParChip: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard
    let hole: Int

    var body: some View {
        let par = card.par(hole)
        Button {
            Haptics.tap()
            golf.setPar(par >= 5 ? 3 : par + 1, card: card.id, hole: hole)
        } label: {
            HStack(spacing: 4) {
                Text("Par \(par)")
                    .font(TallyFont.sans(11, weight: .bold))
                    .contentTransition(.numericText())
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 8, weight: .black))
                    .foregroundStyle(Color.ink3)
            }
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.surface))
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Par \(par). Change it")
        .accessibilityHint("Cycles between par 3, 4 and 5")
    }
}

/**
 What the hole you just left came to, and the way back into it.

 Finishing moves the screen to the next tee, which is right in a cart and wrong for the three
 seconds afterwards, when somebody says that last one was Dan's. The toast has gone by then and
 the Undo on this hole is about *this* hole. So the last hole keeps a line at the top of the next
 one until a stroke is logged, and tapping it stands you back on it, where Reopen is waiting.
 */
private struct LastHoleStrip: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard
    let entry: HoleEntry

    private var detail: String {
        let word = ScrambleTally.label(score: entry.score, par: card.par(entry.hole))
        if let who = card.player(entry.holedBy)?.name { return "\(entry.score), \(word) · \(who) holed it" }
        return "\(entry.score), \(word)"
    }

    var body: some View {
        Button {
            Haptics.tap()
            golf.go(card: card.id, to: entry.hole)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(Color.ink2)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Hole \(entry.hole) is in").font(TallyFont.display(13, weight: .bold))
                    Text(detail).sans(11).foregroundStyle(Color.ink2).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("Fix").font(TallyFont.display(12, weight: .bold)).foregroundStyle(Color.ink2)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(Color.ink3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .cardFlat(fill: .paper2)
        .accessibilityLabel("Hole \(entry.hole) is in: \(detail). Go back to it")
    }
}

/**
 The hole's side bet, claimed in one tap.

 It sits directly under the hole header, above the strokes, because it is settled *before* the
 team decides whose ball to play — everybody tees off, you walk up, and one drive is furthest.
 Putting it below the name grid would have meant scrolling past the thing you are about to do.

 One control, no modes: the names are always drawn and the claimed one is filled, so claiming,
 changing your mind and taking it back are the same gesture. It is drawn on a finished hole too,
 because an award changes no score — the argument about who was closest often outlives the putt.

 Yellow while it is unclaimed and green once it is, which is the app's whole vocabulary for *wants
 you* and *settled*, so the tee tells you at a glance whether anything is owed here.
 */
private struct ContestStrip: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard
    let contest: SideContest
    let winner: GolfPlayer?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: contest.symbol)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(winner == nil ? Color.ink2 : Color.turf)
                SectionLabel(text: contest.title)
                Spacer(minLength: 4)
                if winner != nil {
                    Button("Clear") {
                        Haptics.unpick()
                        golf.award(contest, card: card.id, hole: card.currentHole, to: nil)
                    }
                    .buttonStyle(.tally(.ghost, size: .small))
                }
            }
            Text(winner.map { "\($0.name) \(contest.took)." } ?? contest.prompt)
                .sans(13, weight: winner == nil ? .semibold : .regular)
                .foregroundStyle(winner == nil ? Color.ink : Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            FlowRow(spacing: 6, rowSpacing: 6) {
                ForEach(card.players) { player in
                    ContestPill(name: player.name, taken: player.id == winner?.id) {
                        Haptics.pick()
                        // Tapping the name already on it takes it back, so one control does
                        // claim, change and undo without a mode to be in.
                        let next: String? = player.id == winner?.id ? nil : player.id
                        golf.award(contest, card: card.id, hole: card.currentHole, to: next)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: winner == nil ? .flagSoft : .turfSoft)
        .animation(Motion.settle, value: winner?.id)
    }
}

private struct ContestPill: View {
    let name: String
    let taken: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if taken {
                    Image(systemName: "checkmark").font(.system(size: 10, weight: .black))
                }
                Text(name)
                    .font(TallyFont.display(14, weight: .bold))
                    .lineLimit(1)
            }
            .foregroundStyle(taken ? Color.onFill : Color.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Capsule().fill(taken ? Color.turf : Color.surface))
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(taken ? .isSelected : [])
        .accessibilityHint(taken ? "Has it. Tap to take it back" : "Give it to them")
    }
}

private struct StepButton: View {
    let symbol: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .black))
                .foregroundStyle(Color.ink)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Color.surface))
                .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
        .accessibilityLabel(symbol == "chevron.left" ? "Previous hole" : "Next hole")
    }
}

// MARK: What has been taken

/// The strokes on this hole so far, numbered, in the order they were taken.
private struct StrokeStrip: View {
    let card: ScrambleCard
    let entry: HoleEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: entry.strokes.isEmpty ? "This hole" : "This hole · \(entry.score)")
            if entry.strokes.isEmpty {
                Text("Tap whoever's drive the team took. Then whoever's shot, until the ball is in.")
                    .sans(13).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                FlowRow(spacing: 6, rowSpacing: 6) {
                    ForEach(Array(entry.strokes.enumerated()), id: \.element.id) { index, stroke in
                        StrokePill(
                            number: index + 1,
                            stroke: stroke,
                            card: card,
                            holed: entry.finished && index == entry.strokes.count - 1,
                            open: !entry.finished
                        )
                    }
                }
                Text(entry.finished
                     ? "Tap a stroke to change whose it was."
                     : "Tap a stroke to change whose it was, or take it off.")
                    .sans(11).foregroundStyle(Color.ink3)
            }
        }
    }
}

/**
 One stroke on the hole, and the menu that corrects it.

 The correction people actually make is "that was Dan's, not Pete's", and it is made after the
 hole is in — once the tally has moved and somebody notices their number. Until this was a menu
 the only repair was to reopen the hole, undo back past the stroke and re-enter everything after
 it, so a wrong name three strokes back on a par five was nine taps on a tee where the next hole
 had already started. Now it is two: the stroke, and the name.

 Reassigning is allowed on a finished hole because it changes no score; taking a stroke *off* is
 not, for the same reason `record` refuses a finished hole — the count is the score, so reopen it
 first. A tap-in is not offered here on purpose: "that was holed, not given" is Reopen and then
 *Holed it*, which credits the stroke that was already there.
 */
private struct StrokePill: View {
    @Environment(GolfModel.self) private var golf
    let number: Int
    let stroke: Stroke
    let card: ScrambleCard
    /// The stroke that finished the hole. A shot that did earns the turf; a tap-in does not.
    let holed: Bool
    /// The hole is still open, so the stroke can come off as well as change hands.
    let open: Bool

    private var text: String {
        switch stroke.kind {
        case .shot: return card.player(stroke.playerId)?.name ?? "?"
        case .tapIn: return "Tap-in"
        case .penalty: return "Penalty"
        case .unclaimed: return "Nobody's"
        }
    }

    private var credited: Bool { holed && stroke.kind == .shot }

    var body: some View {
        Menu {
            Section("Stroke \(number) was") {
                ForEach(card.players) { player in
                    Button {
                        Haptics.pick()
                        golf.reassign(strokeId: stroke.id, card: card.id, to: .shot, playerId: player.id)
                    } label: {
                        if stroke.kind == .shot, stroke.playerId == player.id {
                            Label(player.name, systemImage: "checkmark")
                        } else {
                            Text(player.name)
                        }
                    }
                }
            }
            Section {
                Button {
                    Haptics.tap()
                    golf.reassign(strokeId: stroke.id, card: card.id, to: .penalty)
                } label: {
                    Label("Penalty stroke", systemImage: stroke.kind == .penalty ? "checkmark" : "exclamationmark.triangle")
                }
                Button {
                    Haptics.tap()
                    golf.reassign(strokeId: stroke.id, card: card.id, to: .unclaimed)
                } label: {
                    Label("Nobody's ball", systemImage: stroke.kind == .unclaimed ? "checkmark" : "circle.dashed")
                }
            }
            if open {
                Section {
                    Button(role: .destructive) {
                        Haptics.unpick()
                        golf.remove(strokeId: stroke.id, card: card.id)
                    } label: {
                        Label("Take this stroke off", systemImage: "minus.circle")
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text("\(number)")
                    .font(TallyFont.display(12))
                    .foregroundStyle(credited ? Color.onFill : Color.ink3)
                Text(text).font(TallyFont.display(13, weight: .bold))
                if credited {
                    Image(systemName: "flag.fill").font(.system(size: 10, weight: .bold))
                }
            }
            .foregroundStyle(credited ? Color.onFill : Color.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(credited ? Color.turf : stroke.kind == .shot ? Color.surface : Color.paper2))
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            .contentShape(Capsule())
        }
        .accessibilityLabel("Stroke \(number), \(text)\(credited ? ", holed" : ""). Change it")
    }
}

// MARK: Taking the next one

/**
 Taking the hole's strokes, and the confirmation that closes it.

 The names are one tap each. *Holed it* and *Tap-in* used to be the end of the hole — one tap and
 the screen had moved to the next tee, with the outcome in a toast that was gone before anybody
 in the cart had read it. Now they open a **review**: the score and the word, each name's shots
 on this hole, whether it ended on somebody's putt or a gimme, and who took the hole's side game
 if it has one — the whole outcome, on one card, with the strokes above it still tappable to fix.
 The hole closes on a swipe, the same gesture the pool uses to lock picks in, because a swipe is
 a decision and a tap is a reflex. Then the word is stamped over the page and the next tee slides
 up on its own.
 */
private struct HoleEntryControls: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard
    let entry: HoleEntry
    /// The hole is in. `RoundView` stamps it and moves on.
    let onFinished: (HoleEntry) -> Void

    private enum Closing { case holed, tapIn }
    /// Which way the hole is ending, once one of the two buttons has been tapped. Nil is still
    /// taking strokes.
    @State private var closing: Closing?

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    /// Each name's running count, so the buttons carry the score they are adding to.
    private var kept: [String: Int] {
        Dictionary(uniqueKeysWithValues: ScrambleTally.rows(card).map { ($0.id, $0.kept) })
    }

    /// Whoever's mark *Holed it* would be: the last stroke's owner, if the last stroke was a shot.
    /// After a penalty or nobody's ball there is nobody to credit, and the button says only what
    /// it does.
    private var lastShotName: String? {
        guard let last = entry.strokes.last, last.kind == .shot else { return nil }
        return card.player(last.playerId)?.name
    }

    var body: some View {
        // A stroke taken off while reviewing can empty the hole, and there is nothing to review then.
        if let closing, !entry.strokes.isEmpty {
            HoleReviewCard(
                card: card,
                entry: entry,
                tapIn: closing == .tapIn,
                onBack: {
                    Haptics.unpick()
                    withAnimation(Motion.settle) { self.closing = nil }
                },
                onConfirm: { confirm(tapIn: closing == .tapIn) }
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
            controls
        }
    }

    private var controls: some View {
        let kept = kept
        return VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: entry.strokes.isEmpty ? "Whose drive?" : "Whose shot?")
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(card.players) { player in
                    Button {
                        Haptics.pick()
                        golf.record(.shot(by: player.id), card: card.id)
                    } label: {
                        VStack(spacing: 2) {
                            Text(player.name)
                                .font(TallyFont.display(20))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            Text("\(kept[player.id, default: 0]) kept")
                                .sans(12, weight: .semibold)
                                .foregroundStyle(Color.ink2)
                        }
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.cardPress)
                    .card()
                    .accessibilityLabel("\(player.name)'s shot")
                }
            }
            HStack(spacing: 10) {
                // The button carries the name it is about to credit, so "Holed it" is never a
                // surprise about whose putt that was — the one thing a scramble card exists to
                // get right.
                Button(lastShotName.map { "\($0) holed it" } ?? "Holed it") { review(.holed) }
                    .buttonStyle(.tally(.turf, fullWidth: true))
                Button("Tap-in") { review(.tapIn) }
                    .buttonStyle(.tally(.plain, fullWidth: true))
            }
            .disabled(entry.strokes.isEmpty)
            Text(lastShotName.map { "\($0) holed it: that last shot went in, and it counts for \($0). Tap-in: one more stroke on the card, nobody's. Either way you check the hole before it closes." }
                 ?? "Holed it: the last shot went in, and it counts for whoever hit it. Tap-in: one more stroke on the card, nobody's. Either way you check the hole before it closes.")
                .sans(12).foregroundStyle(Color.ink3)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Undo") {
                    Haptics.unpick()
                    golf.undo(card: card.id)
                }
                .buttonStyle(.tally(.ghost, size: .small))
                .disabled(entry.strokes.isEmpty)
                Spacer()
                // This used to be a single "+1 penalty", which made it the only way to log a
                // stroke nobody was going to be credited with — so it got used for strokes that
                // were simply forgotten, and put the word *penalty* on the card for them.
                Menu {
                    Button {
                        Haptics.tap()
                        golf.record(.penalty, card: card.id)
                    } label: {
                        Label("Penalty stroke", systemImage: "exclamationmark.triangle")
                    }
                    Button {
                        Haptics.tap()
                        golf.record(.unclaimed, card: card.id)
                    } label: {
                        Label("Nobody's ball", systemImage: "circle.dashed")
                    }
                } label: {
                    Text("+1 stroke")
                        .font(TallyFont.display(15, weight: .bold))
                        .foregroundStyle(Color.ink)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 38)
                }
                .accessibilityLabel("Add a stroke nobody gets credit for")
            }
        }
    }

    private func review(_ how: Closing) {
        Haptics.tap()
        withAnimation(Motion.settle) { closing = how }
    }

    /// The swipe went home. Finish without advancing; the stamp and the move are `RoundView`'s.
    private func confirm(tapIn: Bool) {
        guard let done = golf.finishHole(card: card.id, tapIn: tapIn, advance: false) else { return }
        onFinished(done)
    }
}

/**
 The hole, read back before it closes.

 Everything the group is about to agree to, in the order they would argue about it: the score and
 what it is called, whose shots the team played and how many each, how the ball went in, and the
 side game if this hole runs one. The strokes above are still menus, so "that was Dan's" is fixed
 here rather than after. A side game nobody has named is not a blocker — a hole can close with
 the argument still open and the Tally tab keeps a dashed tile for it — but the card says so in
 yellow, because a closest to the pin forgotten on the tee is a fight on the eighteenth.
 */
private struct HoleReviewCard: View {
    let card: ScrambleCard
    let entry: HoleEntry
    let tapIn: Bool
    let onBack: () -> Void
    let onConfirm: () -> Void

    private var par: Int { card.par(entry.hole) }
    private var score: Int { entry.score + (tapIn ? 1 : 0) }
    private var word: String { ScrambleTally.label(score: score, par: par) }

    /// Who holed it, if the hole is ending on somebody's shot rather than a gimme.
    private var holedBy: String? {
        guard !tapIn, let last = entry.strokes.last, last.kind == .shot else { return nil }
        return card.player(last.playerId)?.name
    }

    /// Every name on the card and their shots on this hole, zeros included — "how many each" is
    /// the question, and a name missing from the answer is a name somebody will ask about.
    private var shots: [(player: GolfPlayer, count: Int)] {
        card.players.map { player in
            (player, entry.strokes.filter { $0.kind == .shot && $0.playerId == player.id }.count)
        }
    }

    /// The strokes on the card for nobody: "a tap-in", "a penalty", "2 nobody's".
    private var nameless: String? {
        var parts: [String] = []
        if tapIn { parts.append("a tap-in") }
        let penalties = entry.strokes.filter { $0.kind == .penalty }.count
        let unclaimed = entry.strokes.filter { $0.kind == .unclaimed }.count
        if penalties > 0 { parts.append(penalties == 1 ? "a penalty" : "\(penalties) penalties") }
        if unclaimed > 0 { parts.append(unclaimed == 1 ? "a nobody's ball" : "\(unclaimed) nobody's balls") }
        return parts.isEmpty ? nil : Format.list(parts) + " on the card, credited to nobody."
    }

    private var ending: String {
        if let holedBy { return "\(holedBy) holed it." }
        if tapIn { return "Finished with a tap-in." }
        return "The last stroke was nobody's, so nobody is credited with holing it."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Hole \(entry.hole)").display(20)
                Text("par \(par)").sans(13, weight: .bold).foregroundStyle(Color.ink3)
                Spacer(minLength: 4)
                Text("\(score)").font(TallyFont.display(34)).monospacedDigit()
                Chip(text: word, fill: score < par ? .turfSoft : .paper2, size: 11)
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(shots, id: \.player.id) { line in
                    HStack(spacing: 8) {
                        Text(line.player.name)
                            .font(TallyFont.display(15))
                            .foregroundStyle(line.count > 0 ? Color.ink : Color.ink3)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(line.count == 0 ? "—" : Format.plural(line.count, "shot"))
                            .sans(13, weight: .bold)
                            .monospacedDigit()
                            .foregroundStyle(line.count > 0 ? Color.ink : Color.ink3)
                    }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .cardFlat()
            VStack(alignment: .leading, spacing: 3) {
                Text(ending).sans(13, weight: .semibold)
                if let nameless {
                    Text(nameless).sans(12).foregroundStyle(Color.ink2)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            if let side = card.standing(on: entry.hole) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: side.winner == nil ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(side.winner == nil ? Color.ink : Color.turf)
                    Text(side.winner.map { "\(side.contest.title): \($0.name)." }
                         ?? "\(side.contest.title): nobody named yet. Tap a name up top, or settle it later from the Tally tab.")
                        .sans(13, weight: side.winner == nil ? .semibold : .regular)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: side.winner == nil ? .flagSoft : .turfSoft)
            }
            SlideToLock(
                pending: false,
                disabled: false,
                title: "Swipe to finish the hole",
                busy: "Finishing…",
                symbols: ("flag", "flag.fill"),
                onSubmit: onConfirm
            )
            Button("Back to the strokes", action: onBack)
                .buttonStyle(.tally(.ghost, size: .small))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .accessibilityElement(children: .contain)
    }
}

// MARK: A hole that is in

private struct FinishedHoleCard: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard
    let entry: HoleEntry

    private var line: String {
        if let who = card.player(entry.holedBy)?.name { return "\(who) holed it. Reopen the hole to change anything." }
        if entry.endedWithTapIn { return "Finished with a tap-in. Reopen the hole to change anything." }
        return "Reopen the hole to change anything."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(entry.score)").font(TallyFont.display(40)).monospacedDigit()
                Text(ScrambleTally.label(score: entry.score, par: card.par(entry.hole))).display(18)
                Spacer()
            }
            Text(line).sans(13).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if let next = card.nextUnfinishedHole(after: entry.hole) {
                    Button("On to hole \(next)") {
                        Haptics.tap()
                        golf.go(card: card.id, to: next)
                    }
                    .buttonStyle(.tally(.primary, size: .small))
                }
                Button("Reopen") {
                    Haptics.unpick()
                    golf.undo(card: card.id)
                }
                .buttonStyle(.tally(.plain, size: .small))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: .turfSoft)
    }
}

// MARK: The round is in

private struct RoundDoneCard: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard

    var body: some View {
        let rows = ScrambleTally.rows(card)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                FlagMark(size: 32) {
                    Image(systemName: "flag.checkered").font(.system(size: 14, weight: .bold))
                }
                Text("That's the round").display(20)
            }
            Text("\(card.strokesTaken) strokes, \(ScrambleTally.toParText(card.toPar)) on a par \(card.totalPar).")
                .sans(14).foregroundStyle(Color.ink2)
            if let top = rows.first, top.kept > 0 {
                let leaders = rows.filter { $0.place == 1 }.map(\.player.name)
                Text("\(Format.list(leaders)) had the most shots kept, with \(top.kept).")
                    .sans(14).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                Button("See the tally") {
                    Haptics.tap()
                    golf.tab = .tally
                }
                .buttonStyle(.tally(.primary, size: .small))
                // The argument happens in a thread, not in an app the other three have not
                // installed, so the round leaves as a drawn card rather than a paragraph.
                Button {
                    Haptics.tap()
                    golf.sharing = card
                } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.tally(.plain, size: .small))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(fill: .flagSoft)
    }
}
