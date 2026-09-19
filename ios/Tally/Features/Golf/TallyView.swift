import SwiftUI
import TallyKit

/**
 The leaderboards the round is about, and the bets beside it.

 **Shots kept** is the card's own currency: whose shots the team played from, with where they were
 kept underneath, because "six kept" and "six kept, five of them drives" are different afternoons.
 A tie shares a place, and nothing here quietly breaks that with a tiebreaker nobody agreed to on
 the first tee.

 **Points** is the board a group builds for itself — a shot kept is worth something, a longest
 drive and a closest to the pin are worth more — and it only exists when somebody has switched it
 on. When it does exist it is the one shown first, on purpose: a group that sat down and priced a
 closest to the pin did it to decide something, and the board that decides should not be the one
 you have to tap to reach. Shots kept is one tap away and unchanged.

 **Side games** is its own card under both, rather than a column on either. The two boards answer
 "who is winning"; this answers "which holes are still unclaimed, and who took the ones that
 aren't" — a different question, asked at a different moment, and the only one with a hole number
 in the answer. Every tile is a way back to that tee.
 */
struct TallyView: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String

    private enum Board: Hashable { case points, kept }
    @State private var board: Board = .points

    private var card: ScrambleCard? { golf.card(cardId) }

    var body: some View {
        if let card {
            // Points is the default when it is on, and simply not a choice when it is off.
            let shown: Board = card.points.enabled ? board : .kept
            VStack(alignment: .leading, spacing: 14) {
                RoundSummary(card: card)
                if card.points.enabled {
                    TallySegmented(
                        value: $board,
                        options: [(Board.points, "Points"), (Board.kept, "Shots kept")]
                    )
                }
                if shown == .points {
                    PointsBoard(card: card)
                } else {
                    KeptBoard(card: card)
                }
                if card.contests.any { SideGamesCard(card: card) }
                if card.throughHole > 0 { DriveNote(rows: ScrambleTally.rows(card)) }
            }
            .animation(Motion.settle, value: card.strokesTaken)
        } else {
            EmptyState(title: "This card is gone", body: "Pick another from the menu, or start a new one.")
        }
    }
}

/// Where the round stands: the score, and how far in it is.
private struct RoundSummary: View {
    let card: ScrambleCard

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ScrambleTally.toParText(card.toPar))
                    .font(TallyFont.display(34))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text(card.throughHole == 0 ? "not started" : card.isComplete ? "final" : "through \(card.throughHole)")
                    .sans(11, weight: .bold).foregroundStyle(Color.ink3)
            }
            Capsule().fill(Color.line).frame(width: 2, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(card.strokesTaken)")
                    .font(TallyFont.display(34))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text("strokes").sans(11, weight: .bold).foregroundStyle(Color.ink3)
            }
            Spacer()
            if card.isComplete {
                FlagMark(size: 36) {
                    Image(systemName: "flag.checkered").font(.system(size: 16, weight: .bold))
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

// MARK: Shots kept

private struct KeptBoard: View {
    let card: ScrambleCard

    var body: some View {
        let rows = ScrambleTally.rows(card)
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Shots kept")
            if card.strokesTaken == 0 && rows.allSatisfy({ $0.kept == 0 }) {
                EmptyState(
                    title: "Nothing kept yet",
                    body: "Tap a name on the Round tab each time the team plays somebody's ball. This fills in as you go."
                )
            } else {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    TallyRowCard(row: row, leader: row.place == 1 && row.kept > 0)
                        .dealt(index)
                }
            }
        }
    }
}

private struct TallyRowCard: View {
    let row: TallyRow
    let leader: Bool

    private var breakdown: String {
        var parts: [String] = []
        if row.drives > 0 { parts.append(Format.plural(row.drives, "drive")) }
        if row.holed > 0 { parts.append("\(row.holed) holed") }
        if row.between > 0 { parts.append("\(row.between) in between") }
        return parts.isEmpty ? "nothing kept yet" : parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 12) {
            PlaceBadge(place: row.place, muted: row.kept == 0)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(row.player.name).font(TallyFont.display(17)).lineLimit(1)
                    if leader { Chip(text: "most kept", fill: .flag, size: 10, label: .onAccent) }
                }
                Text(breakdown).sans(12).foregroundStyle(Color.ink2).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(row.kept)")
                    .font(TallyFont.display(30))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(Motion.settle, value: row.kept)
                Text("KEPT").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .modifier(TallyCard(hard: leader, fill: leader ? .flagSoft : .surface, border: .cardBorder, radius: TallyRadius.card, dashed: false))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.player.name), \(row.kept) kept, \(breakdown)")
    }
}

// MARK: Points

/**
 The board a group priced for itself, settled as a pot.

 Every line is a **net**, so the column adds to nothing and half of it is usually negative. That is
 the point: a prize board makes everybody a winner by some amount, and this one says who is buying.
 A zero is a real answer too — somebody who took nothing and paid nothing because nothing they are
 in has been claimed yet.

 The row carries the counts and the total; the arithmetic between them is said once underneath,
 because it is the same on every line and a row that shows its own working has no room for a name.
 A negative row gets one extra thing the positive rows do not need: what it won and what it put in,
 because "−40" on its own reads like a mistake until you can see it is 0 won and 40 in.
 */
private struct PointsBoard: View {
    let card: ScrambleCard

    var body: some View {
        let rows = ScrambleTally.points(card)
        let live = card.points.playing(card.contests)
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Points")
            if live.isEmpty {
                EmptyState(
                    title: "Nothing is being played for",
                    body: "Open the card's settings and put a stake on a shot kept, a longest drive or a closest to the pin."
                )
            } else if rows.allSatisfy({ $0.points == 0 }) {
                EmptyState(
                    title: "Nobody is up or down yet",
                    body: "Keep a shot on the Round tab, or hand somebody a hole's side game, and the pot starts moving."
                )
            } else {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    PointsRowCard(row: row, card: card, leader: row.place == 1 && row.points > 0)
                        .dealt(index)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(ScrambleTally.pointsLine(card))
                if !live.isEmpty {
                    Text("Everybody puts that in each time. It adds up to nothing overall — what one person is up, the rest are down.")
                }
            }
            .sans(12).foregroundStyle(Color.ink3)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct PointsRowCard: View {
    let row: PointsRow
    let card: ScrambleCard
    let leader: Bool

    /// What they took, in the order worth arguing about.
    private var breakdown: String {
        var parts: [String] = []
        for item in card.points.playing(card.contests) where row.wins(item) > 0 {
            parts.append(item == .shotKept ? "\(row.kept) kept" : "\(row.wins(item))× \(item.contest?.initials ?? "")")
        }
        if parts.isEmpty { return row.paid > 0 ? "nothing taken yet" : "nothing yet" }
        return parts.joined(separator: " · ")
    }

    /// Only drawn when somebody is down, because that is the number that looks like a bug until
    /// its two halves are visible.
    private var ledger: String? {
        guard row.points < 0 else { return nil }
        return "\(row.won) won · \(row.paid) in"
    }

    private var tone: Color {
        if row.points > 0 { return .turf }
        if row.points < 0 { return .danger }
        return .ink3
    }

    var body: some View {
        HStack(spacing: 12) {
            PlaceBadge(place: row.place, muted: row.points <= 0)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(row.player.name).font(TallyFont.display(17)).lineLimit(1)
                    if leader { Chip(text: "up most", fill: .flag, size: 10, label: .onAccent) }
                }
                Text(breakdown).sans(12).foregroundStyle(Color.ink2).lineLimit(1)
                if let ledger {
                    Text(ledger).sans(11).foregroundStyle(Color.ink3).lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 0) {
                Text(ScrambleTally.netText(row.points))
                    .font(TallyFont.display(30))
                    .monospacedDigit()
                    .foregroundStyle(tone)
                    .contentTransition(.numericText())
                    .animation(Motion.settle, value: row.points)
                Text("POINTS").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .modifier(TallyCard(hard: leader, fill: leader ? .flagSoft : .surface, border: .cardBorder, radius: TallyRadius.card, dashed: false))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }

    private var label: String {
        let net = row.points == 0 ? "level" : row.points > 0 ? "up \(row.points)" : "down \(-row.points)"
        return "\(row.player.name), \(net), \(breakdown)"
    }
}

// MARK: The bets beside the round

/**
 Every contest hole on the card, and who has it.

 One tile per hole rather than one row per winner, because the useful question here is *which ones
 are still up for grabs* — and an unclaimed hole has no winner to be a row about. A dashed tile
 with a hole number on it is the one thing on this screen that is asking for something, and
 tapping any tile stands you back on that tee, where the names are.
 */
private struct SideGamesCard: View {
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard

    var body: some View {
        let results = ScrambleTally.contestResults(card)
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Side games")
            if results.isEmpty {
                Text("No hole on this card hosts one yet. A longest drive wants a par 5 and a closest to the pin wants a par 3 — set the pars from the tee and they appear.")
                    .sans(13).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(card.contests.playing, id: \.self) { contest in
                let mine = results.filter { $0.contest == contest }
                if !mine.isEmpty {
                    ContestSection(contest: contest, results: mine, card: card) { hole in
                        Haptics.tap()
                        golf.go(card: card.id, to: hole)
                        golf.tab = .round
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

private struct ContestSection: View {
    let contest: SideContest
    let results: [ContestResult]
    let card: ScrambleCard
    let onOpen: (Int) -> Void

    /// Who is ahead at this one contest, and by how many. Silent until somebody has one, because
    /// "nobody has any" is not a standing.
    private var leadLine: String {
        let rows = ScrambleTally.points(card)
        let top = rows.map { $0.wins(contest) }.max() ?? 0
        guard top > 0 else {
            let left = results.filter { !$0.claimed }.count
            return "\(Format.plural(left, "hole")) still up for grabs."
        }
        let names = rows.filter { $0.wins(contest) == top }.map(\.player.name)
        return "\(Format.list(names)) — \(contest.counted(top))."
    }

    /// "2/4" — how many of this contest's holes have somebody's name on them.
    private var tally: String {
        let claimed = results.filter { $0.claimed }.count
        return "\(claimed)/\(results.count)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: contest.symbol)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.turf)
                Text(contest.title).font(TallyFont.display(16))
                Spacer(minLength: 4)
                Chip(text: tally, size: 10)
            }
            Text(leadLine)
                .sans(12).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            FlowRow(spacing: 6, rowSpacing: 6) {
                ForEach(results) { result in
                    ContestTile(result: result) { onOpen(result.hole) }
                }
            }
        }
    }
}

private struct ContestTile: View {
    let result: ContestResult
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 1) {
                Text("\(result.hole)")
                    .font(TallyFont.display(15))
                    .monospacedDigit()
                Text(result.winner?.name ?? "open")
                    .font(TallyFont.sans(10, weight: .bold))
                    .foregroundStyle(result.claimed ? Color.ink2 : Color.ink3)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(minWidth: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Claimed settles into turf; unclaimed stays dashed, which is this app's word for a slot
        // with nothing in it yet.
        .cardFlat(
            fill: result.claimed ? .turfSoft : .surface,
            radius: TallyRadius.badge,
            dashed: !result.claimed
        )
        .accessibilityLabel(
            result.winner.map { "Hole \(result.hole), \($0.name). Go to it" }
                ?? "Hole \(result.hole), unclaimed. Go to it"
        )
    }
}

/// The one stat that gets claimed out loud, said in a sentence rather than left in a column.
private struct DriveNote: View {
    let rows: [TallyRow]

    var body: some View {
        let best = rows.map(\.drives).max() ?? 0
        let names = rows.filter { $0.drives == best && best > 0 }.map(\.player.name)
        if !names.isEmpty {
            HStack(spacing: 10) {
                Image(systemName: "figure.golf").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.turf)
                Text("Off the tee: \(Format.list(names)), \(Format.plural(best, "drive")) kept.")
                    .sans(13).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardFlat(fill: .turfSoft)
        }
    }
}
