import SwiftUI
import TallyKit

/**
 The leaderboard the round is actually about: whose shots the team kept.

 Sorted by shots kept, because that is the question everybody asks in the cart. Under each name is
 where those shots were kept — off the tee, in the hole, and everything in between — because "six
 kept" and "six kept, five of them drives" are different afternoons. A tie shares a place: two
 people on six are both second, and nothing here quietly breaks that with a tiebreaker nobody
 agreed to on the first tee.
 */
struct TallyView: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String

    private var card: ScrambleCard? { golf.card(cardId) }

    var body: some View {
        if let card {
            let rows = ScrambleTally.rows(card)
            VStack(alignment: .leading, spacing: 14) {
                RoundSummary(card: card)
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
                if card.throughHole > 0 { DriveNote(rows: rows) }
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
