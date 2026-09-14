import SwiftUI
import UIKit

/**
 How things move.

 Every spring in the app used to be written out at the call site, which meant a dozen slightly
 different ideas of what "quick" means. These are the four the app actually needs, named for what
 they are for rather than for their numbers.

 They are also the one place Reduce Motion is honoured. Each returns an optional `Animation`, and
 `nil` is what SwiftUI takes to mean "do not animate this" — so a phone with the setting on gets
 the same app with the movement taken out, rather than a special reduced-motion code path that
 nobody remembers to update.
 */
enum Motion {
    static var reduced: Bool { UIAccessibility.isReduceMotionEnabled }

    /// A thing answering a touch: a press, a chip filling, a badge appearing.
    static var snap: Animation? { reduced ? nil : .spring(response: 0.28, dampingFraction: 0.7) }

    /// Something moving to a new place and staying there: a reorder, a sheet, a row opening.
    static var settle: Animation? { reduced ? nil : .spring(response: 0.36, dampingFraction: 0.82) }

    /// Overshoots on purpose. For a sticker landing and a stamp coming down — the two places the
    /// app is allowed to be pleased with itself.
    static var slap: Animation? { reduced ? nil : .spring(response: 0.3, dampingFraction: 0.55) }

    /// No personality, just a fade. Copy changing, a state swapping underneath you.
    static var fade: Animation? { reduced ? nil : .easeOut(duration: 0.18) }

    /// Rows arriving one after another. Flat when motion is reduced, so nothing arrives late.
    static func deal(_ index: Int, step: Double = 0.045, cap: Int = 8) -> Animation? {
        guard !reduced else { return nil }
        return .spring(response: 0.42, dampingFraction: 0.84).delay(Double(min(index, cap)) * step)
    }
}

/**
 Rows dealing onto the table.

 The board is a list of cards, and a list of cards appearing all at once reads as a redraw where
 the same list arriving in order reads as a result. The offset is small and the delay is capped —
 past the eighth row nobody is waiting to see it, and a long cascade just feels slow.
 */
struct Dealt: ViewModifier {
    let index: Int
    @State private var landed = false

    func body(content: Content) -> some View {
        content
            .opacity(landed ? 1 : 0)
            .offset(y: landed ? 0 : 10)
            .scaleEffect(landed ? 1 : 0.98, anchor: .top)
            .onAppear {
                withAnimation(Motion.deal(index)) { landed = true }
            }
    }
}

extension View {
    /// Deal this in as the `index`-th card.
    func dealt(_ index: Int) -> some View { modifier(Dealt(index: index)) }

    /// Fade and lift slightly as the view scrolls towards the edges of the screen. Does nothing on
    /// anything older than iOS 17, and nothing at all with Reduce Motion on.
    func scrollSettle() -> some View { modifier(ScrollSettle()) }
}

private struct ScrollSettle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *), !Motion.reduced {
            content.scrollTransition(.interactive) { view, phase in
                view
                    .opacity(phase.isIdentity ? 1 : 0.55)
                    .scaleEffect(phase.isIdentity ? 1 : 0.96)
            }
        } else {
            content
        }
    }
}

/**
 Press feedback for the things that are not buttons.

 Board rows, entry rows, pool cards — all of them are tappable and none of them acknowledged a
 touch, because `.buttonStyle(.plain)` means exactly that. This gives them the smallest honest
 answer: a shrink, and the hard shadow pulling in as though the card were pressed into the page.
 */
struct CardPressStyle: ButtonStyle {
    var scale: CGFloat = 0.985

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !Motion.reduced ? scale : 1)
            .brightness(configuration.isPressed ? -0.015 : 0)
            .animation(Motion.fade, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == CardPressStyle {
    /// For a card or row that is really a button. Quieter than `.tally`, which is for buttons that
    /// look like buttons.
    static var cardPress: CardPressStyle { CardPressStyle() }
}
