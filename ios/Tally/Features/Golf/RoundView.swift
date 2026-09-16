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

    private var card: ScrambleCard? { golf.card(cardId) }

    var body: some View {
        if let card {
            let entry = card.entry(card.currentHole) ?? HoleEntry(hole: card.currentHole)
            VStack(alignment: .leading, spacing: 14) {
                if card.isComplete { RoundDoneCard(card: card) }
                HoleHeader(card: card)
                StrokeStrip(card: card, entry: entry)
                if entry.finished {
                    FinishedHoleCard(card: card, entry: entry)
                } else {
                    HoleEntryControls(card: card, entry: entry)
                }
            }
            .animation(Motion.settle, value: card.currentHole)
        } else {
            EmptyState(title: "This card is gone", body: "Pick another from the menu, or start a new one.")
        }
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
                    Chip(text: "Par \(card.par(hole))", size: 11)
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
                            holed: entry.finished && index == entry.strokes.count - 1
                        )
                    }
                }
            }
        }
    }
}

private struct StrokePill: View {
    let number: Int
    let stroke: Stroke
    let card: ScrambleCard
    /// The stroke that finished the hole. A shot that did earns the turf; a tap-in does not.
    let holed: Bool

    private var text: String {
        switch stroke.kind {
        case .shot: return card.player(stroke.playerId)?.name ?? "?"
        case .tapIn: return "Tap-in"
        case .penalty: return "Penalty"
        }
    }

    private var credited: Bool { holed && stroke.kind == .shot }

    var body: some View {
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
        .accessibilityLabel("Stroke \(number), \(text)\(credited ? ", holed" : "")")
    }
}

// MARK: Taking the next one

private struct HoleEntryControls: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard
    let entry: HoleEntry

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    /// Each name's running count, so the buttons carry the score they are adding to.
    private var kept: [String: Int] {
        Dictionary(uniqueKeysWithValues: ScrambleTally.rows(card).map { ($0.id, $0.kept) })
    }

    var body: some View {
        let kept = kept
        VStack(alignment: .leading, spacing: 12) {
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
                Button("Holed it") { finish(tapIn: false) }
                    .buttonStyle(.tally(.turf, fullWidth: true))
                Button("Tap-in") { finish(tapIn: true) }
                    .buttonStyle(.tally(.plain, fullWidth: true))
            }
            .disabled(entry.strokes.isEmpty)
            Text("Holed it: the last shot went in, and it counts for whoever hit it. Tap-in: one more stroke on the card, nobody's.")
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
                Button("+1 penalty") {
                    Haptics.tap()
                    golf.record(.penalty, card: card.id)
                }
                .buttonStyle(.tally(.ghost, size: .small))
            }
        }
    }

    private func finish(tapIn: Bool) {
        let hole = card.currentHole
        let par = card.par(hole)
        guard let done = golf.finishHole(card: card.id, tapIn: tapIn) else { return }
        let word = ScrambleTally.label(score: done.score, par: par)
        let who = card.player(done.holedBy)?.name
        let tail = who.map { " \($0) holed it." } ?? (tapIn ? " Tap-in." : "")
        model.toast("Hole \(hole): \(word).\(tail)", kind: done.score < par ? .success : .info)
        if done.score < par { Haptics.won() } else { Haptics.lockedIn() }
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
            Button("See the tally") {
                Haptics.tap()
                golf.tab = .tally
            }
            .buttonStyle(.tally(.primary, size: .small))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(fill: .flagSoft)
    }
}
