import SwiftUI
import TallyKit

/**
 The five picks, drawn once for every surface that shows them.

 The lock screen and the home screen are looking at the same five things, so they say them the same
 way — one vocabulary of states, one set of colours, one idea of what a slot is worth. This started
 inside the Live Activity; the picks widget needed exactly it, and a second copy would have been
 two designs drifting apart from the first week.

 **Every slot differs in three ways at once** — fill, outline and glyph — because these are glanced
 at in bright sun, in greyscale on an always-on display, and by people who do not separate red from
 green. Colour alone was never carrying it. Team colours are the team's rather than ours, so they
 do not change between themes; a filled slot takes white lettering and a hairline, without which a
 navy or a black primary vanishes into the dark ground.
 */

/// The five, most confident first.
struct SlotRow: View {
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
struct SlotView: View {
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
struct Glyph: View {
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
struct Pips: View {
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

enum Ordinal {
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

enum Plural {
    static func games(_ n: Int) -> String { n == 1 ? "1 game" : "\(n) games" }
    static func points(_ n: Int) -> String { n == 1 ? "1 point" : "\(n) points" }
}

enum Clock {
    /// "4:05" or "8:15 PM" in the reader's own zone — a kickoff time is a wall-clock fact and the
    /// person looking at it is somewhere.
    static func short(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}
