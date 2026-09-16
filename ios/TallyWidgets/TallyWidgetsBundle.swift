import SwiftUI
import WidgetKit

/**
 The widget extension: one Live Activity, three home-screen widgets, three lock-screen accessories.

 It draws teams as their abbreviation on their own colour rather than as logos. That is not a
 compromise: at the size a lock screen gives five picks, each one is about thirty points across,
 and three bold letters read from arm's length where a squashed logo does not. It also means the
 extension needs nothing from the app's asset catalog — only `TallyKit`, which both targets link,
 and which is where the palette lives so that both of them re-light together.
 */
@main
struct TallyWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WeekLiveActivity()
        PicksWidget()
        WeekBoardWidget()
        SeasonBoardWidget()
        PointsAccessory()
        WeekAccessory()
        InlineAccessory()
    }
}
