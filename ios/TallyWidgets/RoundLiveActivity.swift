import ActivityKit
import SwiftUI
import TallyKit
import WidgetKit

/**
 A scramble in progress, on a lock screen and in the Dynamic Island.

 A round is four hours long and the phone is in a pocket for most of it, so this is where the round
 actually lives: the hole, the team's score, and who is winning the argument about whose shots keep
 getting picked. It draws from `RoundActivityAttributes`, which the app updates directly — there is
 no feed behind a scramble, so unlike the week's activity this one needs no push key of any kind.

 Names rather than glyphs, because a name is the whole point here and four of them at lock-screen
 size read fine. Everything takes its colour from `TallyPalette`, which both targets link, so the
 round re-lights with the rest of the app instead of shipping a private set of light-theme hexes
 the way the week's Live Activity once did.
 */
struct RoundLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RoundActivityAttributes.self) { context in
            RoundLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(TallyPalette.paper)
                .activitySystemActionForegroundColor(TallyPalette.ink)
                // Without this, tapping the lock screen just foregrounds the app wherever it
                // last was — the pool, most of the time, since that is the default context. The
                // whole point of a lock screen for a four-hour round is to get back to the hole.
                .widgetURL(RoundActivityAttributes.deepLink(cardId: context.attributes.cardId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(context.state.done ? "Final" : "Hole \(context.state.hole)")
                            .font(.system(size: 13, weight: .heavy, design: .rounded))
                            .foregroundStyle(TallyPalette.ink)
                        Text(context.attributes.cardName)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(TallyPalette.ink2)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ToPar(state: context.state, size: 20)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        KeptRow(lines: context.state.lines)
                        Text(context.state.leadLine() ?? context.state.statusLine())
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundStyle(TallyPalette.ink2)
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                Text("\(context.state.hole)")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
            } compactTrailing: {
                Text(ScrambleTally.toParText(context.state.toPar))
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
            } minimal: {
                Text(ScrambleTally.toParText(context.state.toPar))
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TallyPalette.ink)
            }
            .widgetURL(RoundActivityAttributes.deepLink(cardId: context.attributes.cardId))
        }
    }
}

// MARK: The lock screen

private struct RoundLockScreen: View {
    let attributes: RoundActivityAttributes
    let state: RoundActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(attributes.cardName)
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(TallyPalette.ink)
                        .lineLimit(1)
                    Text(state.statusLine())
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(TallyPalette.ink2)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                ToPar(state: state, size: 26)
            }
            KeptRow(lines: state.lines)
            if let lead = state.leadLine() {
                Text(lead)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(TallyPalette.ink2)
                    .lineLimit(1)
            }
        }
        .padding(14)
    }
}

/// The team's score, which is the one number that is about everybody at once.
private struct ToPar: View {
    let state: RoundActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(ScrambleTally.toParText(state.toPar))
                .font(.system(size: size, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(TallyPalette.ink)
            Text(state.through == 0 ? "to par" : "thru \(state.through)")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(TallyPalette.ink3)
        }
    }
}

/**
 The tally itself: a name and a count each, the leader on the turf.

 This is the row somebody actually unlocks their phone to check, so it is the row that gets the
 width. Four fits; a bigger group is trimmed before it ever reaches here.
 */
private struct KeptRow: View {
    let lines: [RoundActivityAttributes.ContentState.Line]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(lines, id: \.name) { line in
                let leading = line.place == 1 && line.kept > 0
                VStack(spacing: 1) {
                    Text(line.name)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text("\(line.kept)")
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                }
                .foregroundStyle(leading ? TallyPalette.onFill : TallyPalette.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(leading ? TallyPalette.turf : TallyPalette.paper2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(TallyPalette.ink, lineWidth: 1.5)
                )
            }
        }
    }
}
