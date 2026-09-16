import ActivityKit
import SwiftUI
import TallyKit
import WidgetKit

/**
 The week, on a lock screen and in the Dynamic Island.

 The row reads 5 down to 1, left to right — the surest pick first, the way they were ranked — and
 each slot carries what it is worth. A slot fills in rather than appearing, so the shape of the row
 says how far through the week you are at a glance, which is the same idea as the board.

 **Five states, not two.** What goes under the row comes from `state.phase`, and the two phases in
 the middle are the reason this is worth keeping on screen at all: `between` is half past three on
 a Sunday with the early games in and the late ones not on yet, and `watching` is the hour after
 your last pick has played, when your points are fixed and your place is not. An earlier build
 treated both as "nothing happening" and took the activity down.

 **Every slot differs in three ways at once** — fill, outline and glyph — so the row survives a
 greyscale lock screen, a colour-blind reader, and a team whose primary is nearly the colour of the
 dark ground. Colour alone was never carrying it.
 */
struct WeekLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WeekActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes, state: context.state, stale: context.isStale)
                .activityBackgroundTint(TallyPalette.paper)
                .activitySystemActionForegroundColor(TallyPalette.ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Week \(context.attributes.week)")
                            .font(.system(size: 13, weight: .heavy, design: .rounded))
                            .foregroundStyle(TallyPalette.ink)
                        if !context.attributes.entryName.isEmpty {
                            Text(context.attributes.entryName)
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                                .foregroundStyle(TallyPalette.ink2)
                                .lineLimit(1)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Score(state: context.state, compact: true)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        SlotRow(state: context.state, size: 34)
                        StatusLine(state: context.state, stale: context.isStale)
                    }
                }
            } compactLeading: {
                Text("\(context.state.points)")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
            } compactTrailing: {
                Pips(state: context.state)
            } minimal: {
                Text("\(context.state.points)")
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
            }
            .widgetURL(deepLink(context.attributes))
        }
    }

    private func deepLink(_ attributes: WeekActivityAttributes) -> URL? {
        URL(string: "https://playtally.app/p/high-five/board/week/\(attributes.week)")
    }
}

// MARK: The lock screen

private struct LockScreenView: View {
    let attributes: WeekActivityAttributes
    let state: WeekActivityAttributes.ContentState
    /// The system's word for "this data is past its stale date". A lock screen that quietly shows
    /// a stale score is worse than one that admits it: somebody will act on the number.
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            header
            SlotRow(state: state, size: 40)
            StatusLine(state: state, stale: stale)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Week \(attributes.week)")
                .font(.system(size: 15, weight: .heavy, design: .rounded))
                .foregroundStyle(TallyPalette.ink)
            // Only worth the width when it distinguishes something. One entry, one lock screen.
            if !attributes.entryName.isEmpty {
                Text(attributes.entryName)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(TallyPalette.ink2)
                    .lineLimit(1)
                    .layoutPriority(-1)
            }
            Spacer(minLength: 8)
            Standing(state: state)
            Score(state: state, compact: false)
        }
    }
}

// MARK: Pieces

/**
 Banked, and what is still out there.

 The pairing is the point, and which half leads changes with the phase: before anything settles a
 big `0` is an accurate number and a discouraging one, so the stake leads instead. Once points
 exist they lead, and the outstanding total rides behind them in green as the reason to keep
 watching. When nothing is outstanding there is one number and no clutter.
 */
private struct Score: View {
    let state: WeekActivityAttributes.ContentState
    let compact: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            if state.phase == .locked {
                Text("\(state.possible)")
                    .font(.system(size: compact ? 17 : 22, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink2)
                Text("to play")
                    .font(.system(size: compact ? 10 : 12, weight: .bold, design: .rounded))
                    .foregroundStyle(TallyPalette.ink3)
            } else {
                Text("\(state.points)")
                    .font(.system(size: compact ? 17 : 22, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
                if state.possible > 0 {
                    Text("+\(state.possible)")
                        .font(.system(size: compact ? 11 : 13, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(TallyPalette.turf)
                }
            }
        }
    }
}

/// Position, when there is one worth quoting. A win gets the flag behind it — it is the one number
/// on this screen anybody would screenshot.
private struct Standing: View {
    let state: WeekActivityAttributes.ContentState

    var body: some View {
        if let place = state.place, let field = state.field, field > 1 {
            let winner = place == 1 && state.phase == .final
            Text(Ordinal.of(place))
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(winner ? TallyPalette.onAccent : TallyPalette.ink2)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(
                    Capsule().fill(winner ? TallyPalette.flag : TallyPalette.paper2)
                )
                .accessibilityLabel("\(Ordinal.of(place)) of \(field)")
        }
    }
}

/**
 The line under the row, which is where the five phases actually differ.

 Each one answers the question that phase raises and nothing else: when does this start, what is
 still live, when is the next one, can my position still move, and how did it end.
 */
private struct StatusLine: View {
    let state: WeekActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        HStack(spacing: 5) {
            if let dot { Circle().fill(dot).frame(width: 6, height: 6) }
            Text(text)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(stale ? TallyPalette.ink3 : TallyPalette.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
        }
    }

    /// Staleness outranks everything: it is a statement about whether the rest can be believed.
    private var text: String {
        if stale { return "Scores may be behind." }
        let left = state.outstanding
        switch state.phase {
        case .locked:
            guard let kickoff = state.nextKickoff else { return "Picks are in." }
            return "Picks are in — first game \(Clock.short(kickoff))."
        case .live:
            let live = state.slots.filter { $0.state == .live }.count
            let onNow = live == 1 ? "1 game on now" : "\(live) games on now"
            return "\(onNow) · \(left.points) still to play for."
        case .between:
            guard let kickoff = state.nextKickoff else {
                return "\(Plural.games(left.games)) left, worth \(left.points)."
            }
            return "Back at \(Clock.short(kickoff)) · \(Plural.games(left.games)) left, worth \(left.points)."
        case .watching:
            // Their five are done and the week is not. Saying so is the only honest thing here:
            // the number above has stopped moving and the position beside it has not.
            return "All five in. Your place can still move."
        case .final:
            guard let place = state.place, let field = state.field, field > 1 else {
                return "That is the week — \(Plural.points(state.points))."
            }
            return place == 1
                ? "You won the week on \(Plural.points(state.points))."
                : "\(Ordinal.of(place)) of \(field) on \(Plural.points(state.points))."
        }
    }

    private var dot: Color? {
        if stale { return TallyPalette.ink3 }
        switch state.phase {
        case .live: return TallyPalette.turf
        case .between: return TallyPalette.flag
        case .final: return state.place == 1 ? TallyPalette.flag : nil
        case .locked, .watching: return nil
        }
    }
}

/// The five, most confident first.
private struct SlotRow: View {
    let state: WeekActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        HStack(spacing: 6) {
            ForEach(state.inDisplayOrder, id: \.rank) { slot in
                SlotView(slot: slot, size: size)
            }
            Spacer(minLength: 0)
        }
    }
}

/**
 One pick.

 The five states are told apart three times over — by fill, by outline and by a glyph — because a
 lock screen is glanced at in bright sun, in greyscale on an always-on display, and by people who
 do not separate red from green. Any one of those takes a colour-only design apart.

 A team's colours do not change between themes (they are the team's, not ours), so a filled slot
 always carries white lettering and gains a hairline in `line` — without it a navy or a black
 primary vanishes into the dark ground.
 */
private struct SlotView: View {
    let slot: WeekActivity.Slot
    let size: CGFloat

    private var team: Team? { slot.team.flatMap { NFL.shared.team($0) } }
    private var teamColour: Color? { team.map { Color(hex: $0.primary) } }
    private var radius: CGFloat { size * 0.28 }

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill)
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(stroke.colour, style: stroke.style)
                label
            }
            .frame(width: size, height: size)
            .overlay(alignment: .topTrailing) { badge }
            Text(stakeText)
                .font(.system(size: size * 0.26, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(stakeColour)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    // MARK: Paint

    private var fill: Color {
        switch slot.state {
        case .won, .live: teamColour ?? TallyPalette.paper2
        case .lost: TallyPalette.dangerSoft
        case .tied: TallyPalette.paper2
        // Not started is an *outline*, not a washed-out fill. A 75%-opacity team colour reads as
        // "something went wrong here" in the dark theme; an empty box reads as "not yet".
        case .waiting: TallyPalette.surface
        }
    }

    private var stroke: (colour: Color, style: StrokeStyle) {
        switch slot.state {
        case .won: (TallyPalette.turf, StrokeStyle(lineWidth: 2))
        case .live: (TallyPalette.flag, StrokeStyle(lineWidth: 2.5))
        case .lost: (TallyPalette.danger, StrokeStyle(lineWidth: 1.5))
        case .tied: (TallyPalette.line, StrokeStyle(lineWidth: 1.5))
        case .waiting:
            slot.team == nil
                // A pick nobody may see yet: dashed, because the rank is public and the team is not.
                ? (TallyPalette.line, StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                : (TallyPalette.line, StrokeStyle(lineWidth: 1.5))
        }
    }

    @ViewBuilder private var label: some View {
        if slot.team == nil {
            Image(systemName: "lock.fill")
                .font(.system(size: size * 0.3, weight: .bold))
                .foregroundStyle(TallyPalette.ink3)
        } else {
            Text(team?.display ?? "")
                .font(.system(size: size * 0.32, weight: .black, design: .rounded))
                .foregroundStyle(lettering)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .padding(.horizontal, 2)
        }
    }

    /// Whatever `fill` turned out to be has to be readable underneath this.
    private var lettering: Color {
        switch slot.state {
        case .won, .live: .white
        case .lost: TallyPalette.danger
        case .tied: TallyPalette.ink2
        case .waiting: TallyPalette.ink
        }
    }

    @ViewBuilder private var badge: some View {
        switch slot.state {
        case .won: Glyph(symbol: "checkmark", fill: TallyPalette.turf, size: size)
        case .lost: Glyph(symbol: "xmark", fill: TallyPalette.danger, size: size)
        case .tied: Glyph(symbol: "minus", fill: TallyPalette.line, size: size)
        case .live, .waiting: EmptyView()
        }
    }

    /// What it is worth, or what it turned out to be worth. The leftmost is the five-pointer
    /// whether or not its game has started, which is what makes the row readable at all.
    private var stakeText: String {
        switch slot.state {
        case .won: "+\(slot.stake)"
        case .lost, .tied: "0"
        case .live, .waiting: "\(slot.stake)"
        }
    }

    private var stakeColour: Color {
        switch slot.state {
        case .won: TallyPalette.turf
        case .lost: TallyPalette.danger
        case .tied: TallyPalette.ink3
        case .live: TallyPalette.ink
        case .waiting: TallyPalette.ink3
        }
    }

    private var spoken: String {
        let who = slot.team.map { team?.display ?? $0 } ?? "hidden pick"
        let worth = "worth \(slot.stake)"
        return switch slot.state {
        case .won: "\(who) won, \(slot.stake) points"
        case .lost: "\(who) lost, no points"
        case .tied: "\(who) tied, no points"
        case .live: "\(who) playing now, \(worth)"
        case .waiting: "\(who), not started, \(worth)"
        }
    }
}

/// The little circle in the corner of a settled slot.
private struct Glyph: View {
    let symbol: String
    let fill: Color
    let size: CGFloat

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.22, weight: .black))
            .foregroundStyle(.white)
            .padding(size * 0.1)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(TallyPalette.paper, lineWidth: 1))
            .offset(x: size * 0.14, y: -size * 0.14)
    }
}

/// Five dots for the compact Dynamic Island, where there is no room for anything else.
private struct Pips: View {
    let state: WeekActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 2) {
            ForEach(state.inDisplayOrder, id: \.rank) { slot in
                Circle()
                    .fill(colour(for: slot.state))
                    .frame(width: 5, height: 5)
            }
        }
        .accessibilityLabel(state.summary)
    }

    private func colour(for state: WeekActivity.State) -> Color {
        switch state {
        case .won: TallyPalette.turf
        case .live: TallyPalette.flag
        case .lost: TallyPalette.danger
        case .tied: TallyPalette.line
        case .waiting: TallyPalette.line.opacity(0.4)
        }
    }
}

// MARK: Words

private enum Ordinal {
    static func of(_ n: Int) -> String {
        let teens = n % 100
        if teens >= 11 && teens <= 13 { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }
}

private enum Plural {
    static func games(_ n: Int) -> String { n == 1 ? "1 game" : "\(n) games" }
    static func points(_ n: Int) -> String { n == 1 ? "1 point" : "\(n) points" }
}

private enum Clock {
    /// "4:05" or "8:15 PM" in the reader's own zone — a kickoff time is a wall-clock fact and the
    /// person looking at it is somewhere.
    static func short(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}
