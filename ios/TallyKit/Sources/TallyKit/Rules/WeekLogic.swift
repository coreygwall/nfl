import Foundation

/// The parts of `shared/week.ts` a client needs: whether a game is locked, and what a week is.
public enum WeekLogic {
    public static let weeks = 18
    /// How long after kickoff a game is presented as "live" if no result was entered.
    public static let gameLive: TimeInterval = 4 * 60 * 60

    public static func isLocked(_ game: Game, now: Date) -> Bool {
        game.locked || game.kickoffAt <= now
    }

    public static func status(_ game: Game, now: Date) -> GameStatus {
        if game.winner != nil { return .final }
        return isLocked(game, now: now) ? .live : .upcoming
    }

    /// Earliest week that still has an unstarted game. Falls back to the last week.
    public static func pickWeek(_ summaries: [WeekSummary], now: Date) -> Int {
        for s in summaries.sorted(by: { $0.week < $1.week }) where s.lockedCount < s.gameCount || s.lastKickoff > now {
            return s.week
        }
        return summaries.map(\.week).max() ?? weeks
    }

    public static func nextKickoff(_ games: [Game], now: Date) -> Date? {
        games.map(\.kickoffAt).filter { $0 > now }.min()
    }

    public static func validWeek(_ week: Int) -> Bool { week >= 1 && week <= weeks }
}
