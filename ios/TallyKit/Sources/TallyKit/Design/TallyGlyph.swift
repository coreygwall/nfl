import SwiftUI

/**
 The mark: four uprights and the fifth stroke through them, drawn by a hand rather than a ruler.

 Each upright leans a hair and lands at its own height, and the fifth is a heavy pull with a hook
 at the end and a cut of the ground colour down its middle — the stroke that completes the set,
 read as one stroke with a scar rather than a highlight. It is the app icon, the lockup and the
 loader, and it lives here rather than in the app because the widget extension cannot see an app
 asset — `Image("TallyMark")` builds there and draws nothing — so a lock screen that wants the
 mark draws it, from this. The football and the golf ball are the families' badges; this is the
 app's, because the app is the count and a football is one of the things it counts.

 The geometry is `public/icon.svg`'s, in a 100×68 box, and `TallyMark` in
 `src/components/TallyLoader.tsx` draws the same paths. Two sets of weights, not one: in the dark
 the strokes are 8% lighter and the cut 40% wider, because a light stroke on a dark ground swells
 where a dark stroke on a light one shrinks, and drawn at the light weights the dark cut nearly
 closes. `scripts/build-ios-assets.ts` carries the same two sets for the icon.
 */
public enum TallyGlyph {
    /// Height over width.
    public static let aspect: CGFloat = 68 / 100

    /// One stroke: where the pen lands, then cubic segments (two control points and an end).
    private struct Stroke {
        let start: CGPoint
        let segments: [(CGPoint, CGPoint, CGPoint)]
        let width: CGFloat
    }

    private static func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }

    // The icon's paths, shifted by (−18, −29) into the 100×68 box.
    private static let uprights: [Stroke] = [
        Stroke(start: p(20, 9), segments: [(p(19, 26), p(21.5, 44), p(22, 63))], width: 8.2),
        Stroke(start: p(37, 14), segments: [(p(38.5, 29), p(36, 43), p(37.5, 57))], width: 7.4),
        Stroke(start: p(53.5, 7), segments: [(p(52, 26), p(55, 43), p(53, 61))], width: 9),
        Stroke(start: p(71, 12), segments: [(p(72.5, 27), p(70, 42), p(71.5, 60))], width: 7.8),
    ]
    private static let hook = Stroke(
        start: p(8, 63),
        segments: [(p(26, 49), p(46, 33), p(66, 19)), (p(74, 13.5), p(80, 8), p(85, 5)), (p(86.5, 4.5), p(87, 6), p(86, 7.5))],
        width: 14
    )
    private static let cut: CGFloat = 4
    /// The dark weights: strokes × this, and the cut this wide.
    private static let darkThinning: CGFloat = 0.92
    private static let darkCut: CGFloat = 5.6
    private static let darkHook: CGFloat = 13.2

    /**
     Draws the mark into a canvas.

     `progress` is how much of it has been written, 0 to 1: each stroke starts a beat after the
     one before, timed so the fifth finishes exactly at 1, which is what lets the app's loader
     write the mark rather than switch it on. At 1 it is the whole mark, which is all a widget
     ever wants. `ground` is what the cut through the fifth stroke shows: the paper the mark sits
     on, or the tile's yellow. The weights follow the canvas's colour scheme.
     */
    public static func draw(
        into context: GraphicsContext,
        size: CGSize,
        progress: Double = 1,
        ink: Color = TallyPalette.ink,
        ground: Color = TallyPalette.paper
    ) {
        let w = size.width / 100
        let h = size.height / 68
        let dark = context.environment.colorScheme == .dark
        let k = dark ? darkThinning : 1

        func path(_ stroke: Stroke) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: stroke.start.x * w, y: stroke.start.y * h))
            for (c1, c2, end) in stroke.segments {
                path.addCurve(
                    to: CGPoint(x: end.x * w, y: end.y * h),
                    control1: CGPoint(x: c1.x * w, y: c1.y * h),
                    control2: CGPoint(x: c2.x * w, y: c2.y * h)
                )
            }
            return path
        }
        func drawn(_ index: Int) -> CGFloat {
            CGFloat(min(max((progress - Double(index) * 0.14) / 0.44, 0), 1))
        }
        func stroke(_ path: Path, _ index: Int, colour: Color, width: CGFloat) {
            let amount = drawn(index)
            guard amount > 0 else { return }
            let part = amount < 1 ? path.trimmedPath(from: 0, to: amount) : path
            context.stroke(part, with: .color(colour), style: StrokeStyle(lineWidth: width * w, lineCap: .round, lineJoin: .round))
        }

        for (index, upright) in uprights.enumerated() {
            stroke(path(upright), index, colour: ink, width: upright.width * k)
        }
        let fifth = path(hook)
        stroke(fifth, 4, colour: ink, width: dark ? darkHook : hook.width)
        stroke(fifth, 4, colour: ground, width: dark ? darkCut : cut)
    }
}

/// The finished mark as a view: for the widgets, and for anywhere that wants the glyph without
/// the loader's animation. On a lock screen accessory, which is drawn as a mask, pass the same
/// colour for `ground` as the surface behind it so the cut still reads.
public struct TallyGlyphView: View {
    public var width: CGFloat
    public var ink: Color
    public var ground: Color

    public init(width: CGFloat = 100, ink: Color = TallyPalette.ink, ground: Color = TallyPalette.paper) {
        self.width = width
        self.ink = ink
        self.ground = ground
    }

    public var body: some View {
        Canvas { context, size in
            TallyGlyph.draw(into: context, size: size, ink: ink, ground: ground)
        }
        .frame(width: width, height: width * TallyGlyph.aspect)
        .accessibilityHidden(true)
    }
}
