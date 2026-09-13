import ActivityKit
import SwiftUI
import TallyKit
import WidgetKit

/**
 The week, on a lock screen and in the Dynamic Island.

 The row reads 5 down to 1, left to right — the surest pick first, the way they were ranked — and
 each slot carries what it is worth. A slot fills in rather than appearing, so the shape of the row
 says how far through the week you are at a glance, which is the same idea as the board.
 */
struct WeekLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WeekActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(Tone.paper)
                .activitySystemActionForegroundColor(Tone.ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Week \(context.attributes.week)")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Points(state: context.state, compact: true)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    SlotRow(state: context.state, size: 34)
                }
            } compactLeading: {
                Text("\(context.state.points)")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            } compactTrailing: {
                Pips(state: context.state)
            } minimal: {
                Text("\(context.state.points)")
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }
            .widgetURL(URL(string: "https://playtally.app/p/high-five/board/week/\(context.attributes.week)"))
        }
    }
}

// MARK: The lock screen

private struct LockScreenView: View {
    let attributes: WeekActivityAttributes
    let state: WeekActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Week \(attributes.week)")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                Text(attributes.entryName)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Points(state: state, compact: false)
            }
            SlotRow(state: state, size: 40)
            if let line = footnote {
                Text(line)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    /// One line, and only when it says something a glance at the row does not.
    private var footnote: String? {
        if state.isFinished {
            guard let place = state.place, let field = state.field else { return "That is the week." }
            return place == 1 ? "You won the week." : "\(ordinal(place)) of \(field)."
        }
        if state.possible == 0 { return nil }
        let live = state.slots.filter { $0.state == .live }.count
        let waiting = state.slots.filter { $0.state == .waiting }.count
        let left = live + waiting
        let games = left == 1 ? "1 game" : "\(left) games"
        return "\(games) left, worth \(state.possible)."
    }

    private func ordinal(_ n: Int) -> String {
        let teens = n % 100
        if teens >= 11 && teens <= 13 { return "\(n)th" }
        return "\(n)\(["th", "st", "nd", "rd"][safe: n % 10] ?? "th")"
    }
}

// MARK: Pieces

/// Banked, and what is still out there. The second number is the reason to keep watching.
private struct Points: View {
    let state: WeekActivityAttributes.ContentState
    let compact: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(state.points)")
                .font(.system(size: compact ? 17 : 22, weight: .heavy, design: .rounded))
                .monospacedDigit()
            if state.possible > 0 {
                Text("+\(state.possible)")
                    .font(.system(size: compact ? 11 : 13, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Tone.turf)
            }
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

private struct SlotView: View {
    let slot: WeekActivity.Slot
    let size: CGFloat

    private var team: Team? { slot.team.flatMap { NFL.shared.team($0) } }

    private var fill: Color {
        switch slot.state {
        case .won, .live: team.map { Color(hex: $0.primary) } ?? Tone.line
        case .lost, .tied: Tone.line.opacity(0.35)
        case .waiting: team.map { Color(hex: $0.primary).opacity(0.75) } ?? .clear
        }
    }

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).fill(fill)
                if slot.team == nil {
                    // The rank is public before kickoff even when the team is not, so the slot
                    // holds its place with a lock rather than shuffling the row at kickoff.
                    RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                        .strokeBorder(Tone.line, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                    Image(systemName: "lock.fill")
                        .font(.system(size: size * 0.3, weight: .bold))
                        .foregroundStyle(.secondary)
                } else {
                    Text(team?.display ?? "")
                        .font(.system(size: size * 0.32, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .padding(.horizontal, 2)
                }
                if slot.state == .live {
                    RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                        .strokeBorder(Tone.turf, lineWidth: 2)
                }
            }
            .frame(width: size, height: size)
            .opacity(slot.state == .lost || slot.state == .tied ? 0.45 : 1)
            .overlay(alignment: .topTrailing) {
                if slot.state == .won {
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.22, weight: .black))
                        .foregroundStyle(.white)
                        .padding(size * 0.1)
                        .background(Circle().fill(Tone.turf))
                        .offset(x: size * 0.14, y: -size * 0.14)
                }
            }
            // What the slot is worth, which is what makes the row readable at all: the leftmost
            // one is the five-pointer whether or not its game has started.
            Text(slot.state == .lost || slot.state == .tied ? "0" : "\(slot.stake)")
                .font(.system(size: size * 0.26, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(slot.state == .won ? Tone.turf : .secondary)
        }
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
    }

    private func colour(for state: WeekActivity.State) -> Color {
        switch state {
        case .won: Tone.turf
        case .live: Tone.flag
        case .lost, .tied: Tone.line
        case .waiting: Tone.line.opacity(0.4)
        }
    }
}

// MARK: Colour

/**
 A handful of colours rather than the app's whole design system, which lives in the app target and
 is not worth moving for six values. The names and hexes match `ios/Tally/Design/Theme.swift`.
 */
private enum Tone {
    static let ink = Color(hex: "#14120F")
    static let paper = Color(hex: "#F6F1E8")
    static let turf = Color(hex: "#0B7A3B")
    static let flag = Color(hex: "#FFD23F")
    static let line = Color(hex: "#D9D0C0")
}

private extension Color {
    init(hex: String) {
        let raw = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        let value = UInt64(raw, radix: 16) ?? 0
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
