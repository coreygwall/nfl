import SwiftUI
import WidgetKit

/**
 The widget extension. It exists for one thing today — the week's Live Activity — and is the
 natural home for a home-screen widget later.

 It draws teams as their abbreviation on their own colour rather than as logos. That is not a
 compromise: at the size a lock screen gives five picks, each one is about thirty points across,
 and three bold letters read from arm's length where a squashed logo does not. It also means the
 extension needs nothing from the app's asset catalog — only `TallyKit`, which both targets link.
 */
@main
struct TallyWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WeekLiveActivity()
    }
}
