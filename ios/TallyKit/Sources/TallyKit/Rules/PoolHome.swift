import Foundation

/// What the pool home is allowed to feature, ported from `src/lib/poolHome.ts`.
public enum PoolHome {
    /**
     The most recent week whose result is actually settled.

     "Latest" is not "last one that started": a week with fifteen of sixteen games final is still
     being played, and putting its top three under a `Final` chip would be wrong for however many
     hours that last game takes. So a week counts only once every game it has is final — and a week
     with no games at all never counts, or an empty future week would outrank a finished one.
     */
    public static func latestCompletedWeek(_ weeks: [WeekSummary]) -> Int? {
        weeks.filter { $0.gameCount > 0 && $0.finalCount == $0.gameCount }.map(\.week).max()
    }
}
