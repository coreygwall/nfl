import Foundation

/// High Five's numbers, from `shared/scoring.ts`.
public enum Scoring {
    public static let maxPicks = 5
    public static let allRanks: [Int] = Array(1...maxPicks)

    public static func points(forRank rank: Int) -> Int { maxPicks + 1 - rank }
    public static let maxWeekPoints = allRanks.map(points(forRank:)).reduce(0, +)

    /// What a saved pick is worth right now, given what the game has decided.
    public static func score(_ pick: Pick, game: Game?, now: Date) -> (outcome: PickOutcome, points: Int) {
        guard let game else { return (.pending, 0) }
        guard let winner = game.winner else {
            return (WeekLogic.isLocked(game, now: now) ? .live : .pending, 0)
        }
        if winner == "TIE" { return (.tie, 0) }
        if winner == pick.team { return (.win, points(forRank: pick.rank)) }
        return (.loss, 0)
    }

    public static func ordinal(_ n: Int) -> String {
        let v = n % 100
        let suffix: String
        if (11...13).contains(v) { suffix = "th" } else {
            switch n % 10 {
            case 1: suffix = "st"
            case 2: suffix = "nd"
            case 3: suffix = "rd"
            default: suffix = "th"
            }
        }
        return "\(n)\(suffix)"
    }
}

/// A pick's state as the review screen paints it: the board's four outcomes plus "live".
public enum PickOutcome: String, Sendable {
    case win, loss, tie, live, pending
}
