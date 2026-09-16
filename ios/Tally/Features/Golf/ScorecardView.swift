import SwiftUI
import TallyKit

/**
 The card, hole by hole — the paper one, plus the column the paper one has no room for.

 Par, the team's score, and who the shots belonged to, as initials. Out and In are totalled the way
 a scorecard totals them, and a nine-hole card simply has no back. Tapping a row goes and stands on
 that hole, which is how a hole entered wrong gets fixed: this is the list, the Round tab is the
 edit.
 */
struct ScorecardView: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String

    private var card: ScrambleCard? { golf.card(cardId) }

    var body: some View {
        if let card {
            let initials = ScrambleTally.initials(card.players)
            VStack(alignment: .leading, spacing: 14) {
                header(card)
                VStack(spacing: 0) {
                    ScorecardHeaderRow()
                    ForEach(Array(card.holeNumbers), id: \.self) { hole in
                        DashedDivider().padding(.horizontal, 10)
                        ScorecardRow(card: card, hole: hole, initials: initials) {
                            Haptics.tap()
                            golf.go(card: card.id, to: hole)
                            golf.tab = .round
                        }
                        if hole == 9, card.holeCount > 9 {
                            TotalRow(label: "OUT", par: total(card, 1...9, par: true), score: total(card, 1...9, par: false))
                        }
                        if hole == card.holeCount, card.holeCount > 9 {
                            TotalRow(label: "IN", par: total(card, 10...card.holeCount, par: true), score: total(card, 10...card.holeCount, par: false))
                        }
                    }
                    TotalRow(
                        label: "TOTAL",
                        par: card.totalPar,
                        score: card.strokesTaken,
                        trailing: ScrambleTally.toParText(card.toPar),
                        emphasis: true
                    )
                }
                .padding(.vertical, 8)
                .cardFlat()
                Text("Initials are whose shots the team kept. A dash is a stroke nobody earned — a tap-in, or a penalty.")
                    .sans(12).foregroundStyle(Color.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            EmptyState(title: "This card is gone", body: "Pick another from the menu, or start a new one.")
        }
    }

    private func header(_ card: ScrambleCard) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(card.name).display(24)
            Text(subtitle(card)).sans(13).foregroundStyle(Color.ink2)
        }
    }

    private func subtitle(_ card: ScrambleCard) -> String {
        let where_ = card.course.isEmpty ? "" : "\(card.course) · "
        return "\(where_)\(card.holeCount) holes, par \(card.totalPar) · \(Format.list(card.players.map(\.name)))"
    }

    /// Par totals over every hole in the range; score totals over the finished ones only, which is
    /// what "out 38" means when the tenth has not been played.
    private func total(_ card: ScrambleCard, _ range: ClosedRange<Int>, par: Bool) -> Int {
        range.reduce(0) { running, hole in
            if par { return running + card.par(hole) }
            guard let entry = card.entry(hole), entry.finished else { return running }
            return running + entry.score
        }
    }
}

private struct ScorecardHeaderRow: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("HOLE").frame(width: 42, alignment: .leading)
            Text("PAR").frame(width: 34, alignment: .trailing)
            Text("SCORE").frame(width: 46, alignment: .trailing)
            Text("KEPT BY").frame(maxWidth: .infinity, alignment: .trailing)
        }
        .font(TallyFont.sans(10, weight: .bold))
        .tracking(0.8)
        .foregroundStyle(Color.ink3)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }
}

private struct ScorecardRow: View {
    let card: ScrambleCard
    let hole: Int
    let initials: [String: String]
    let onOpen: () -> Void

    private var entry: HoleEntry? { card.entry(hole) }
    private var standing: Bool { card.currentHole == hole }

    var body: some View {
        let entry = entry
        let played = entry?.finished ?? false
        Button(action: onOpen) {
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Text("\(hole)").font(TallyFont.display(15)).monospacedDigit()
                    if standing {
                        Circle().fill(Color.turf).frame(width: 6, height: 6)
                    }
                }
                .frame(width: 42, alignment: .leading)
                Text("\(card.par(hole))")
                    .font(TallyFont.sans(14)).monospacedDigit().foregroundStyle(Color.ink2)
                    .frame(width: 34, alignment: .trailing)
                Group {
                    if played, let entry {
                        Text("\(entry.score)")
                            .font(TallyFont.display(17)).monospacedDigit()
                            .foregroundStyle(Color.ink)
                    } else {
                        Text("—").font(TallyFont.sans(14)).foregroundStyle(Color.ink3)
                    }
                }
                .frame(width: 46, alignment: .trailing)
                Text(keptBy(entry))
                    .font(TallyFont.sans(12, weight: .bold))
                    .foregroundStyle(Color.ink2)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(scoreTint(entry, played: played))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(entry, played: played))
    }

    private func keptBy(_ entry: HoleEntry?) -> String {
        guard let entry, !entry.strokes.isEmpty else { return "" }
        return entry.strokes.map { stroke in
            stroke.kind == .shot ? (initials[stroke.playerId ?? ""] ?? "?") : "–"
        }.joined(separator: " ")
    }

    /// A birdie or better gets a wash of turf, a bogey or worse a wash of paper. Par stays plain,
    /// because most holes are pars and a card that tints every row tells you nothing.
    private func scoreTint(_ entry: HoleEntry?, played: Bool) -> Color {
        guard played, let entry else { return .clear }
        let diff = entry.score - card.par(hole)
        if diff < 0 { return Color.turfSoft }
        if diff > 0 { return Color.paper2 }
        return .clear
    }

    private func label(_ entry: HoleEntry?, played: Bool) -> String {
        guard played, let entry else { return "Hole \(hole), par \(card.par(hole)), not played. Go to it." }
        let word = ScrambleTally.label(score: entry.score, par: card.par(hole))
        return "Hole \(hole), par \(card.par(hole)), \(entry.score) — \(word). Go to it."
    }
}

private struct TotalRow: View {
    let label: String
    let par: Int
    let score: Int
    var trailing: String? = nil
    var emphasis = false

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(TallyFont.display(emphasis ? 14 : 12))
                .tracking(0.8)
                .frame(width: 42, alignment: .leading)
            Text("\(par)")
                .font(TallyFont.sans(14, weight: .bold)).monospacedDigit().foregroundStyle(Color.ink2)
                .frame(width: 34, alignment: .trailing)
            Text(score == 0 ? "—" : "\(score)")
                .font(TallyFont.display(emphasis ? 19 : 17)).monospacedDigit()
                .frame(width: 46, alignment: .trailing)
            Text(trailing ?? "")
                .font(TallyFont.display(14))
                .foregroundStyle(Color.ink2)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.paper2)
        .overlay(alignment: .top) { DashedDivider().padding(.horizontal, 10) }
    }
}
