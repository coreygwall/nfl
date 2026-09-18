import SwiftUI

/**
 The mark: four uprights and the slash across them, in a 56×40 box.

 It is the app icon, the lockup and the loader, and it lives here rather than in the app because
 the widget extension cannot see an app asset — `Image("TallyMark")` builds there and draws
 nothing — so a lock screen that wants the mark draws it, from this. The football and the golf
 ball are the families' badges; this is the app's, because the app is the count and a football is
 one of the things it counts.

 The proportions match `TallyMark` in `src/components/TallyLoader.tsx`: uprights at 7, 18, 29 and
 40 across, 7 to 33 down, the slash from the bottom-left corner to past the last upright.
 */
public enum TallyGlyph {
    /// Height over width.
    public static let aspect: CGFloat = 40 / 56

    /**
     Draws the mark into a canvas.

     `progress` is how much of it has been written, 0 to 1: each stroke starts a beat after the
     one before, timed so the slash finishes exactly at 1, which is what lets the app's loader
     write the mark rather than switch it on. At 1 it is the whole mark, which is all a widget
     ever wants.
     */
    public static func draw(
        into context: GraphicsContext,
        size: CGSize,
        progress: Double = 1,
        ink: Color = TallyPalette.ink,
        slash: Color = TallyPalette.flag
    ) {
        let w = size.width / 56
        let h = size.height / 40

        func stroke(_ index: Int, from: CGPoint, to: CGPoint, colour: Color, width: CGFloat) {
            let drawn = min(max((progress - Double(index) * 0.14) / 0.44, 0), 1)
            guard drawn > 0 else { return }
            var path = Path()
            path.move(to: from)
            path.addLine(to: CGPoint(x: from.x + (to.x - from.x) * drawn, y: from.y + (to.y - from.y) * drawn))
            context.stroke(path, with: .color(colour), style: StrokeStyle(lineWidth: width, lineCap: .round))
        }

        for (index, x) in [7.0, 18.0, 29.0, 40.0].enumerated() {
            stroke(index, from: CGPoint(x: x * w, y: 7 * h), to: CGPoint(x: x * w, y: 33 * h), colour: ink, width: 4 * w)
        }
        // The slash is the stroke that completes the set, which is the whole idea of a tally, so
        // it gets the accent where there is one to give.
        stroke(4, from: CGPoint(x: 2 * w, y: 33 * h), to: CGPoint(x: 48 * w, y: 7 * h), colour: slash, width: 4.5 * w)
    }
}

/// The finished mark as a view: for the widgets, and for anywhere that wants the glyph without
/// the loader's animation. On a lock screen accessory pass the same colour for both, since that
/// surface is a mask and the accent would carry nothing.
public struct TallyGlyphView: View {
    public var width: CGFloat
    public var ink: Color
    public var slash: Color

    public init(width: CGFloat = 56, ink: Color = TallyPalette.ink, slash: Color = TallyPalette.flag) {
        self.width = width
        self.ink = ink
        self.slash = slash
    }

    public var body: some View {
        Canvas { context, size in
            TallyGlyph.draw(into: context, size: size, ink: ink, slash: slash)
        }
        .frame(width: width, height: width * TallyGlyph.aspect)
        .accessibilityHidden(true)
    }
}
