import Foundation

/// One line of the tally: a player, and what the team kept of theirs.
public struct TallyRow: Hashable, Identifiable, Sendable {
    public let player: GolfPlayer
    /// Every shot of theirs the team played from. The number the leaderboard is sorted by.
    public let kept: Int
    /// Tee shots kept — "off the tee", the stat everyone actually claims.
    public let drives: Int
    /// Shots that went in the hole. A tap-in is nobody's, so it is not here.
    public let holed: Int
    /// Everything in between: the approach that set it up, the lag that made it a tap-in.
    public let between: Int
    /// 1-based, and shared on a tie — two people with six kept are both second.
    public let place: Int

    public var id: String { player.id }
}

/**
 The reading of a card: who had the most shots kept, and where they were kept.

 Sorted by shots kept, because that is the question; drives and holed shots break the *order* of a
 tie so the list is stable, but not the *place*, because "off the tee" is a brag rather than a
 tiebreaker and nobody agreed otherwise on the first tee.
 */
public enum ScrambleTally {
    public static func rows(_ card: ScrambleCard) -> [TallyRow] {
        var kept: [String: Int] = [:]
        var drives: [String: Int] = [:]
        var holed: [String: Int] = [:]
        var between: [String: Int] = [:]
        for entry in card.holes {
            let shots = entry.strokes.filter { $0.kind == .shot }
            for (index, stroke) in shots.enumerated() {
                guard let id = stroke.playerId else { continue }
                kept[id, default: 0] += 1
                let isDrive = index == 0
                let isHoled = entry.finished && stroke.id == entry.strokes.last?.id
                if isDrive { drives[id, default: 0] += 1 }
                if isHoled { holed[id, default: 0] += 1 }
                if !isDrive, !isHoled { between[id, default: 0] += 1 }
            }
        }
        let sorted = card.players.sorted { a, b in
            let ka = kept[a.id, default: 0], kb = kept[b.id, default: 0]
            if ka != kb { return ka > kb }
            let da = drives[a.id, default: 0], db = drives[b.id, default: 0]
            if da != db { return da > db }
            let ha = holed[a.id, default: 0], hb = holed[b.id, default: 0]
            if ha != hb { return ha > hb }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
        var rows: [TallyRow] = []
        for (index, player) in sorted.enumerated() {
            let k = kept[player.id, default: 0]
            // Same number kept as the row above: same place. Otherwise the place is the row's
            // position, which skips past a tie the way a leaderboard does (1, 2, 2, 4).
            let place = index > 0 && rows[index - 1].kept == k ? rows[index - 1].place : index + 1
            rows.append(TallyRow(
                player: player,
                kept: k,
                drives: drives[player.id, default: 0],
                holed: holed[player.id, default: 0],
                between: between[player.id, default: 0],
                place: place
            ))
        }
        return rows
    }

    /**
     One or two letters per player, for the scorecard's shots column, where four names in a row
     will not fit. A first letter each until two people share one; then those two get two.
     */
    public static func initials(_ players: [GolfPlayer]) -> [String: String] {
        func prefix(_ name: String, _ n: Int) -> String {
            String(name.trimmingCharacters(in: .whitespaces).prefix(n)).uppercased()
        }
        var out: [String: String] = [:]
        for player in players {
            let one = prefix(player.name, 1)
            let clash = players.contains { $0.id != player.id && prefix($0.name, 1) == one }
            out[player.id] = prefix(player.name, clash ? 2 : 1)
        }
        return out
    }

    /**
     The card, as a message somebody can paste into the group chat.

     The point of the whole feature is the argument on the drive home, and that argument happens in
     a thread rather than in an app the other three have not installed. So the summary is plain
     text, shaped for a phone keyboard: the score, then the tally with where each person's shots
     were kept, and nothing else. No links, because there is nothing yet to link to.
     */
    public static func summary(_ card: ScrambleCard) -> String {
        var lines: [String] = []
        let title = card.course.isEmpty ? card.name : "\(card.name) · \(card.course)"
        lines.append(title)

        let progress = card.isComplete ? "final" : card.throughHole == 0 ? "not started" : "through \(card.throughHole)"
        if card.throughHole > 0 {
            lines.append("\(card.strokesTaken) strokes, \(toParText(card.toPar)) · \(progress)")
        } else {
            lines.append(progress)
        }

        let rows = rows(card)
        if rows.contains(where: { $0.kept > 0 }) {
            lines.append("")
            lines.append("Shots kept")
            for row in rows {
                var detail: [String] = []
                if row.drives > 0 { detail.append("\(row.drives) off the tee") }
                if row.holed > 0 { detail.append("\(row.holed) holed") }
                let tail = detail.isEmpty ? "" : " (\(detail.joined(separator: ", ")))"
                lines.append("\(row.place). \(row.player.name) — \(row.kept)\(tail)")
            }
        }

        lines.append("")
        lines.append("Kept with Tally")
        return lines.joined(separator: "\n")
    }

    /// "E", "−2", "+3": the number a golfer reads, with a real minus sign.
    public static func toParText(_ n: Int) -> String {
        if n == 0 { return "E" }
        return n < 0 ? "−\(-n)" : "+\(n)"
    }

    /// The word for a finished hole's score. Anything past a double bogey is just the number.
    public static func label(score: Int, par: Int) -> String {
        switch score - par {
        case ..<(-2): return score == 1 ? "ace" : "albatross"
        case -2: return score == 1 ? "ace" : "eagle"
        case -1: return "birdie"
        case 0: return "par"
        case 1: return "bogey"
        case 2: return "double"
        default: return "+\(score - par)"
        }
    }
}
