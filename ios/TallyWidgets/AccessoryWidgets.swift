import SwiftUI
import TallyKit
import WidgetKit

/**
 The lock screen accessories.

 This is where a glance actually happens on a Sunday — the phone comes out of a pocket, the screen
 lights up, and there is about a second before it either answered the question or it did not.

 They are drawn for the rendering mode the lock screen imposes rather than against it: accessory
 widgets are composited as a desaturated mask, so colour carries nothing here and every one of
 these is built from shape, weight and number. The palette is still used where the system renders
 full colour (the Smart Stack on some devices), but nothing depends on it.
 */

// MARK: Circular

/// Points banked, drawn as how much of the week is in the bag. A gauge rather than a number alone
/// because the fraction is the thing: eight points means something different in a week you have
/// finished than in one where three games are still to come.
struct PointsAccessory: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.playtally.widget.accessory.points", intent: SelectEntry.self, provider: TallyProvider()) { entry in
            PointsGauge(entry: entry)
                .containerBackground(Color.clear, for: .widget)
        }
        .configurationDisplayName("Points")
        .description("This week's points, at a glance.")
        .supportedFamilies([.accessoryCircular])
    }
}

private struct PointsGauge: View {
    let entry: TallyTimelineEntry

    private var week: WidgetEntry? { entry.entry }
    /// The most a week can be worth: 5 + 4 + 3 + 2 + 1.
    private var maximum: Double { Double(Scoring.maxWeekPoints) }

    var body: some View {
        if let week {
            Gauge(value: Double(week.points), in: 0...maximum) {
                Text("PTS")
            } currentValueLabel: {
                Text("\(week.points)")
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
            .accessibilityLabel("\(Plural.points(week.points)) this week")
        } else {
            Image(systemName: "football.fill")
                .font(.system(size: 18, weight: .bold))
                .widgetAccentable()
                .accessibilityLabel("Open Tally to sign in")
        }
    }
}

// MARK: Rectangular

/// The fullest of the three: where you stand, what you have, and the five as pips — which is as
/// much of the row as survives being drawn a centimetre tall in a single colour.
struct WeekAccessory: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.playtally.widget.accessory.week", intent: SelectEntry.self, provider: TallyProvider()) { entry in
            WeekAccessoryView(entry: entry)
                .containerBackground(Color.clear, for: .widget)
        }
        .configurationDisplayName("Your week")
        .description("Points, position and your five picks.")
        .supportedFamilies([.accessoryRectangular])
    }
}

private struct WeekAccessoryView: View {
    let entry: TallyTimelineEntry

    var body: some View {
        if let week = entry.entry, let snapshot = entry.snapshot {
            VStack(alignment: .leading, spacing: 2) {
                Text(headline(week, week: snapshot.week))
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .widgetAccentable()
                Text(detail(week))
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                AccessoryPips(slots: week.slots)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("Open Tally")
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .widgetAccentable()
        }
    }

    private func headline(_ entry: WidgetEntry, week: Int) -> String {
        guard let place = entry.place, let field = entry.field, field > 1 else {
            return "Week \(week) · \(entry.points) pts"
        }
        return "Week \(week) · \(Ordinal.of(place)) of \(field)"
    }

    private func detail(_ entry: WidgetEntry) -> String {
        let left = entry.outstanding
        if entry.liveCount > 0 { return "\(entry.points) pts · \(left.points) still to play for" }
        if left.games == 0 { return "\(Plural.points(entry.points)) · all five in" }
        if let kickoff = entry.nextKickoff { return "\(entry.points) pts · back at \(Clock.short(kickoff))" }
        return "\(entry.points) pts · \(Plural.games(left.games)) left"
    }
}

/**
 The five, as five marks.

 A filled pip is settled, an outlined one is not, and a struck-through one lost. Shape rather than
 colour, because the lock screen paints all of this one colour anyway — which is also, usefully,
 exactly how it reads to somebody who cannot tell the green from the red.
 */
private struct AccessoryPips: View {
    let slots: [WeekActivity.Slot]

    var body: some View {
        HStack(spacing: 3) {
            ForEach(slots.sorted { $0.rank < $1.rank }, id: \.rank) { slot in
                pip(for: slot.state)
            }
            Spacer(minLength: 0)
        }
        .widgetAccentable()
        .accessibilityLabel(spoken)
    }

    @ViewBuilder private func pip(for state: WeekActivity.State) -> some View {
        switch state {
        case .won:
            Image(systemName: "circle.fill").font(.system(size: 7))
        case .live:
            Image(systemName: "circle.dotted").font(.system(size: 8, weight: .black))
        case .lost:
            Image(systemName: "xmark").font(.system(size: 7, weight: .black))
        case .tied:
            Image(systemName: "minus").font(.system(size: 7, weight: .black))
        case .waiting:
            Image(systemName: "circle").font(.system(size: 7, weight: .semibold))
        }
    }

    private var spoken: String {
        let won = slots.filter { $0.state == .won }.count
        let settled = slots.filter { $0.state != .waiting && $0.state != .live }.count
        return "\(won) of \(settled) right"
    }
}

// MARK: Inline

/// One line beside the clock. There is room for about six words, so it is the two numbers and
/// nothing else.
struct InlineAccessory: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.playtally.widget.accessory.inline", intent: SelectEntry.self, provider: TallyProvider()) { entry in
            InlineView(entry: entry)
                .containerBackground(Color.clear, for: .widget)
        }
        .configurationDisplayName("Points and place")
        .description("One line: what you have and where you are.")
        .supportedFamilies([.accessoryInline])
    }
}

private struct InlineView: View {
    let entry: TallyTimelineEntry

    var body: some View {
        if let week = entry.entry {
            if let place = week.place, let field = week.field, field > 1 {
                Text("\(week.points) pts · \(Ordinal.of(place)) of \(field)")
            } else {
                Text("\(Plural.points(week.points)) this week")
            }
        } else {
            Text("Tally — open to sign in")
        }
    }
}
