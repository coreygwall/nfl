import SwiftUI
import TallyKit
import WidgetKit

/**
 The three home-screen widgets.

 They answer three different questions, which is why they are three widgets and not one with a
 segmented control: *how are my five doing*, *who is winning this week*, and *where does the season
 stand*. A person picks the one they actually check.

 All three draw on `paper` with `ink` — the same card the app is made of — so a Tally widget looks
 like Tally on a home screen full of other people's gradients, in either theme.
 */

// MARK: This week's picks

struct PicksWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.playtally.widget.picks", intent: SelectEntry.self, provider: TallyProvider()) { entry in
            PicksView(entry: entry)
                .containerBackground(TallyPalette.paper, for: .widget)
        }
        .configurationDisplayName("This week's picks")
        .description("Your five, how they are doing, and where you stand.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct PicksView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TallyTimelineEntry

    var body: some View {
        if let week = entry.entry, let snapshot = entry.snapshot {
            VStack(alignment: .leading, spacing: family == .systemSmall ? 7 : 9) {
                WidgetHeader(
                    title: "Week \(snapshot.week)",
                    subtitle: snapshot.entries.count > 1 ? week.name : nil,
                    trailing: { Standing(place: week.place, field: week.field) }
                )
                if family == .systemSmall {
                    SmallSlots(slots: week.slots)
                } else {
                    SlotRow(state: contentState(week), size: 38)
                }
                Spacer(minLength: 0)
                Footer(week: week, stale: entry.isStale)
            }
        } else {
            EmptyWidget()
        }
    }

    /// The slot row speaks `ContentState`, because it is the same row the lock screen draws.
    private func contentState(_ week: WidgetEntry) -> WeekActivityAttributes.ContentState {
        WeekActivityAttributes.ContentState(
            slots: week.slots,
            points: week.points,
            possible: week.possible,
            place: week.place,
            field: week.field
        )
    }
}

/// A small widget cannot fit five 38pt tiles and a score. It gets the five at the size that fits,
/// which still reads because the shape of the row is the information.
private struct SmallSlots: View {
    let slots: [WeekActivity.Slot]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(slots.sorted { $0.rank < $1.rank }, id: \.rank) { slot in
                SlotView(slot: slot, size: 26)
            }
            Spacer(minLength: 0)
        }
    }
}

/// Points, and the one line that says whether to keep watching.
private struct Footer: View {
    let week: WidgetEntry
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(week.points)")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
                Text(week.points == 1 ? "pt" : "pts")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(TallyPalette.ink3)
                if week.possible > 0 {
                    Text("+\(week.possible)")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(TallyPalette.turf)
                }
            }
            Text(line)
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(TallyPalette.ink3)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
    }

    private var line: String {
        if stale { return "Open Tally to refresh." }
        let left = week.outstanding
        if week.liveCount > 0 {
            return "\(week.liveCount == 1 ? "1 game on" : "\(week.liveCount) games on") · \(left.points) to play for"
        }
        if left.games == 0 { return "All five in." }
        if let kickoff = week.nextKickoff { return "Back at \(Clock.short(kickoff)) · \(left.points) to play for" }
        return "\(Plural.games(left.games)) left, worth \(left.points)"
    }
}

// MARK: The boards

struct WeekBoardWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.playtally.widget.weekboard", intent: SelectEntry.self, provider: TallyProvider()) { entry in
            BoardView(entry: entry, scope: .week)
                .containerBackground(TallyPalette.paper, for: .widget)
        }
        .configurationDisplayName("This week's board")
        .description("Where you are this week, and who is ahead.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SeasonBoardWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.playtally.widget.seasonboard", intent: SelectEntry.self, provider: TallyProvider()) { entry in
            BoardView(entry: entry, scope: .season)
                .containerBackground(TallyPalette.paper, for: .widget)
        }
        .configurationDisplayName("Season standings")
        .description("Where you are for the season, and who is ahead.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private enum BoardScope { case week, season }

/**
 A board, small.

 Your own row first and always — that is the number the widget exists for — then the top three
 underneath. Being in the top three does not hide your row: it highlights it in place, so the
 widget's shape never changes depending on how you are doing.
 */
private struct BoardView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TallyTimelineEntry
    let scope: BoardScope

    private var week: WidgetEntry? { entry.entry }

    var body: some View {
        if let week, let snapshot = entry.snapshot {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(
                    title: scope == .week ? "Week \(snapshot.week)" : "Season",
                    subtitle: snapshot.entries.count > 1 ? week.name : nil,
                    trailing: { EmptyView() }
                )
                if scope == .season && !week.seasonStarted {
                    NotStartedYet(startsAt: snapshot.seasonStartsAt)
                } else {
                    mine(week)
                    if family != .systemSmall { leaders(week) }
                }
                Spacer(minLength: 0)
            }
        } else {
            EmptyWidget()
        }
    }

    private var rows: [WidgetStanding] { (scope == .week ? week?.weekTop : week?.seasonTop) ?? [] }

    @ViewBuilder private func mine(_ week: WidgetEntry) -> some View {
        let place = scope == .week ? week.place : week.seasonPlace
        let points = scope == .week ? week.points : (week.seasonPoints ?? 0)
        let field = scope == .week ? week.field : week.seasonField
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(place.map(Ordinal.of) ?? "—")
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(TallyPalette.ink)
            if let field {
                Text("of \(field)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(TallyPalette.ink3)
            }
            Spacer(minLength: 4)
            Text("\(points)")
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(TallyPalette.ink)
            Text(points == 1 ? "pt" : "pts")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(TallyPalette.ink3)
        }
    }

    @ViewBuilder private func leaders(_ week: WidgetEntry) -> some View {
        if rows.isEmpty {
            Text("Nobody on the board yet.")
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(TallyPalette.ink3)
        } else {
            VStack(spacing: 3) {
                ForEach(rows) { row in
                    LeaderRow(row: row)
                }
            }
        }
    }
}

private struct LeaderRow: View {
    let row: WidgetStanding

    var body: some View {
        HStack(spacing: 6) {
            Text("\(row.place)")
                .font(.system(size: 11, weight: .black, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(row.place == 1 ? TallyPalette.onAccent : TallyPalette.ink2)
                .frame(width: 16, height: 16)
                .background(Circle().fill(row.place == 1 ? TallyPalette.flag : TallyPalette.paper2))
            Text(row.name)
                .font(.system(size: 12, weight: row.isMe ? .heavy : .medium, design: .rounded))
                .foregroundStyle(TallyPalette.ink)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text("\(row.points)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(TallyPalette.ink2)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(row.isMe ? TallyPalette.flagSoft : Color.clear)
        )
    }
}

/// Week 1 crowns its own winner and those points do not carry, which is the single most confusing
/// thing about the scoring — so the widget says it rather than showing a table of zeroes.
private struct NotStartedYet: View {
    let startsAt: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Starts Week \(startsAt)")
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(TallyPalette.ink)
            Text("Week \(startsAt - 1) crowns its own winner. Season points begin after it.")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(TallyPalette.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: Shared furniture

private struct WidgetHeader<Trailing: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder let trailing: Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(title)
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .foregroundStyle(TallyPalette.ink)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(TallyPalette.ink2)
                    .lineLimit(1)
                    .layoutPriority(-1)
            }
            Spacer(minLength: 4)
            trailing
        }
    }
}

private struct Standing: View {
    let place: Int?
    let field: Int?

    var body: some View {
        if let place, let field, field > 1 {
            Text(Ordinal.of(place))
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(TallyPalette.ink2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(TallyPalette.paper2))
                .accessibilityLabel("\(Ordinal.of(place)) of \(field)")
        }
    }
}

/// Nothing has ever been written. A widget added before signing in should say what to do, not sit
/// there looking broken.
struct EmptyWidget: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Four strokes and a slash: the mark, drawn rather than fetched. The app's asset
            // catalog belongs to the app target, and an extension that reached for it would build
            // and then show nothing.
            TallyMark()
                .frame(width: 26, height: 18)
            Text("Open Tally")
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(TallyPalette.ink)
            Text("Sign in and your week shows up here.")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(TallyPalette.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// The tally mark itself: four uprights and the fifth struck through them. It is the app's whole
/// idea — five picks, counted — and it is a few lines rather than an asset the extension cannot see.
struct TallyMark: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            Path { path in
                for i in 0..<4 {
                    let x = w * (0.12 + 0.22 * Double(i))
                    path.move(to: CGPoint(x: x, y: h * 0.1))
                    path.addLine(to: CGPoint(x: x, y: h * 0.9))
                }
                path.move(to: CGPoint(x: w * 0.02, y: h * 0.82))
                path.addLine(to: CGPoint(x: w * 0.88, y: h * 0.18))
            }
            .stroke(TallyPalette.ink, style: StrokeStyle(lineWidth: max(1.5, h * 0.11), lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}
