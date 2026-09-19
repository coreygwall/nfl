import Foundation

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

    /// Which week the home screen previews, and whether its result is settled.
    public struct PreviewWeek: Hashable, Sendable {
        public let week: Int
        /// Every game has a result. Only then may it wear a `Final` chip.
        public let final: Bool

        public init(week: Int, final: Bool) {
            self.week = week
            self.final = final
        }
    }

    /**
     The week the home screen shows the top three of: the one being *played*, not the last one
     that finished. Mirrors `previewWeek` in `src/lib/poolHome.ts`.

     These are different for most of a season, and the difference is the whole point. On the Friday
     of Week 2 the last finished week is Week 1, so a home screen built on `latestCompletedWeek`
     spends four days leading with a week nobody is thinking about any more — while Thursday's
     game, which everybody watched, sits unmentioned. What people want is the week they are in as
     soon as it has anything to say.

     "Has anything to say" is one kicked-off game (`lockedCount > 0`), because that is the moment
     points exist. Before that the week is a schedule and the previous week is still the news,
     which is why this takes the newest *started* week rather than the current one.

     `final` stays a separate fact rather than being folded in: a week with fifteen of sixteen
     games settled is worth previewing and must not be called final — exactly the case
     `latestCompletedWeek` excludes and this one has to include.
     */
    public static func previewWeek(_ weeks: [WeekSummary]) -> PreviewWeek? {
        guard let latest = weeks.filter({ $0.gameCount > 0 && $0.lockedCount > 0 }).max(by: { $0.week < $1.week }) else {
            return nil
        }
        return PreviewWeek(week: latest.week, final: latest.finalCount == latest.gameCount)
    }
}
