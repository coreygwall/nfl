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

/// The line under the row, which is where the five phases actually differ — see
/// `ContentState.statusLine` for what each one says and why.
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

    /// The words are the model's, shared with the picks tab, so the two never disagree.
    private var text: String { state.statusLine(stale: stale, clock: Clock.short) }

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
