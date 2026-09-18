import SwiftUI
import TallyKit

/**
 The loading animation.

 A spinning ring is what every app uses while it waits. This one writes the tally mark — four
 strokes and the fifth through them — because that is what the app is called, and because five is
 the number the whole pool is built on. It draws, holds, and goes, which is roughly what a week does too.

 With Reduce Motion on it is a finished mark sitting still, which still says "five" and still says
 "Tally", and says nothing at all about waiting.
 */
struct TallyLoader: View {
    var label: String? = "Loading…"
    var size: CGFloat = 64

    var body: some View {
        VStack(spacing: 12) {
            TallyMark(size: size)
            if let label {
                Text(label).sans(14, weight: .semibold).foregroundStyle(Color.ink3)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 56)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? "Loading")
    }
}

/// The mark on its own, for the places a whole loading screen would be too much.
struct TallyMark: View {
    var size: CGFloat = 64

    /// One full draw-hold-fade. Slow enough to read as writing rather than flickering.
    private let cycle: Double = 2.1

    var body: some View {
        Group {
            if Motion.reduced {
                Canvas { context, size in draw(into: context, size: size, progress: 1, fade: 1) }
            } else {
                TimelineView(.animation) { timeline in
                    // A clock rather than a chain of state changes: the loop is exact, it cannot
                    // drift, and it starts wherever the view happens to appear.
                    let t = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: cycle) / cycle
                    // One Canvas, one pass. This used to rebuild a GeometryReader, a ZStack and
                    // five trimmed Shapes on every frame, which put SwiftUI's diff and layout in
                    // the hot path of a spinner — the thing on screen precisely when the CPU is
                    // already busy. Drawing straight into a context costs a fraction of that.
                    Canvas { context, size in
                        draw(
                            into: context,
                            size: size,
                            progress: phase(t, from: 0.10, to: 0.55),
                            fade: phase(t, from: 0.06, to: 0.16) * (1 - phase(t, from: 0.80, to: 0.94))
                        )
                    }
                }
            }
        }
        .frame(width: size, height: size * TallyGlyph.aspect)
        .accessibilityHidden(true)
    }

    /// Where we are through one leg of the cycle, flat at either end.
    private func phase(_ t: Double, from: Double, to: Double) -> Double {
        min(max((t - from) / (to - from), 0), 1)
    }

    /// The strokes are `TallyGlyph`'s, in TallyKit, so the loader, the widgets and the icon are one
    /// mark; what is the loader's own is the fade and the stagger being driven by a clock.
    private func draw(into context: GraphicsContext, size: CGSize, progress: Double, fade: Double) {
        guard fade > 0 else { return }
        var context = context
        context.opacity = fade
        TallyGlyph.draw(into: context, size: size, progress: progress, ink: .ink, ground: .paper)
    }
}

/**
 The board, before the board arrives.

 The board is the screen people open most and it has a shape they already know: a place badge, a
 name, a number on the right. Drawing that shape while it loads says "your board is coming" where a
 spinner in the middle of an empty page says "something is happening somewhere". It also stops the
 page jumping when the real rows land, because the space is already the right size.
 */
struct BoardSkeleton: View {
    var rows = 5

    var body: some View {
        VStack(spacing: 8) {
            ForEach(0..<rows, id: \.self) { i in
                HStack(spacing: 12) {
                    Circle().fill(Color.paper2).frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 6) {
                        Capsule().fill(Color.paper2).frame(width: 90 + CGFloat((i * 23) % 60), height: 14)
                        Capsule().fill(Color.paper2.opacity(0.7)).frame(width: 120, height: 10)
                    }
                    Spacer()
                    Capsule().fill(Color.paper2).frame(width: 40, height: 26)
                }
                .padding(12)
                .cardFlat()
                // Rows further down are fainter: the eye reads it as a list trailing off rather
                // than as five identical grey bars, which is what a placeholder should look like.
                .opacity(1 - Double(i) * 0.13)
                .shimmer(delay: Double(i) * 0.09)
            }
        }
        .accessibilityHidden(true)
    }
}

/// While a week's games load — the shape of a matchup, so nothing reflows under a thumb.
struct GamesSkeleton: View {
    var rows = 4

    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<rows, id: \.self) { i in
                VStack(alignment: .leading, spacing: 12) {
                    Capsule().fill(Color.paper2).frame(width: 88, height: 10)
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.paper2).frame(height: 56)
                        Capsule().fill(Color.paper2.opacity(0.7)).frame(width: 16, height: 10)
                        RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.paper2).frame(height: 56)
                    }
                }
                .padding(12)
                .cardFlat()
                .opacity(1 - Double(i) * 0.15)
                .shimmer(delay: Double(i) * 0.09)
            }
        }
        .accessibilityHidden(true)
    }
}

/// A slow pulse across a placeholder. Off entirely with Reduce Motion — a still grey card is a
/// perfectly good placeholder, and a breathing page is exactly what that setting is asking to stop.
private struct Shimmer: ViewModifier {
    let delay: Double
    @State private var lit = false

    func body(content: Content) -> some View {
        content
            .opacity(Motion.reduced ? 1 : lit ? 1 : 0.55)
            .onAppear {
                guard !Motion.reduced else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true).delay(delay)) {
                    lit = true
                }
            }
    }
}

private extension View {
    func shimmer(delay: Double = 0) -> some View { modifier(Shimmer(delay: delay)) }
}

/// One line of text that has not arrived — for a card whose shape is already on screen.
struct SkeletonLine: View {
    var width: CGFloat = 140
    var height: CGFloat = 14

    var body: some View {
        Capsule()
            .fill(Color.paper2)
            .frame(width: width, height: height)
            .shimmer()
            .accessibilityHidden(true)
    }
}
