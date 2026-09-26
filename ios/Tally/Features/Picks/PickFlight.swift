import SwiftUI
import TallyKit

/**
 Frames that are read when something is tapped and never drawn from.

 A class rather than `@State` of a dictionary, on purpose: every sticker on the picks screen
 writes its frame here on every frame of a scroll, and a value that nothing draws from must not
 cost a redraw each time it moves. Writing into a reference is invisible to SwiftUI.
 */
final class FrameBox {
    var frames: [String: CGRect] = [:]
}

/**
 A picked team, tossed into the tray.

 Tapping a team used to fill a slot at the bottom of the screen by magic: the sticker lifted in
 the card and, a thumb's length away, a smaller copy faded in. Nobody new to the app connects the
 two, and the tray is the whole mechanism — five slots, fill them, rank them. So the sticker is
 thrown there: it leaves the card, arcs up and over, turns once, shrinks to the slot's size and
 drops in, and the slot takes it with the slap every other sticker lands with and a tick in the
 hand. After one pick the tray has explained itself.

 The picks screen and the tray cannot see one another's layout — the tray floats in the shell's
 safe-area inset, the cards are deep in a scroll view — so both report where they are in window
 coordinates and the flight is drawn over the whole shell (`PickFlightLayer`). While a sticker is
 in the air its slot stays empty (`landing`), or the copy would already be sitting there when the
 thrown one arrived. With Reduce Motion on nothing flies and the slot fills as it always did.
 */
@Observable
final class PickFlights {
    struct Flight: Identifiable, Equatable {
        let id = UUID()
        let gameId: String
        let team: String
        /// The sticker as it sat in the game card, in window coordinates.
        let from: CGRect
        /// The tray slot it is going to.
        let to: CGRect
    }

    private(set) var flights: [Flight] = []
    /// Picks whose sticker is still in the air.
    private(set) var landing: Set<String> = []

    /// The tray's slots, by index, in window coordinates. The tray writes these on every layout
    /// and nothing draws from them — a `let` of a class, so observation never sees the writes.
    let slots = FrameBox()

    func launch(gameId: String, team: String, from: CGRect, slot: Int) {
        guard !Motion.reduced, !from.isEmpty, let to = slots.frames["\(slot)"], !to.isEmpty else { return }
        landing.insert(gameId)
        flights.append(Flight(gameId: gameId, team: team, from: from, to: to))
    }

    func land(_ flight: Flight) {
        flights.removeAll { $0.id == flight.id }
        // Swapping sides mid-flight sends a second sticker to the same slot; the slot opens
        // when the last of them lands.
        guard !flights.contains(where: { $0.gameId == flight.gameId }) else { return }
        withAnimation(Motion.slap) { _ = landing.remove(flight.gameId) }
        Haptics.tap()
    }
}

/// Everything in the air, drawn over the whole shell and never in the way of a touch.
struct PickFlightLayer: View {
    @Environment(PickFlights.self) private var flights
    @Environment(AppModel.self) private var model
    /// Where this layer itself sits in the window, so window coordinates can be turned into its
    /// own without assuming the two share an origin.
    @State private var origin: CGPoint = .zero

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
            ForEach(flights.flights) { flight in
                FlyingSticker(
                    team: model.sport.teamOrPlaceholder(flight.team),
                    size: flight.from.width,
                    from: CGPoint(x: flight.from.midX - origin.x, y: flight.from.midY - origin.y),
                    to: CGPoint(x: flight.to.midX - origin.x, y: flight.to.midY - origin.y),
                    endScale: PickFlightLayer.slotSticker / max(flight.from.width, 1)
                ) {
                    flights.land(flight)
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { origin = $0 }
    }

    /// The sticker's size inside a tray slot (`PickTrayView`).
    static let slotSticker: CGFloat = 30
}

private struct FlyingSticker: View {
    let team: Team
    let size: CGFloat
    let from: CGPoint
    let to: CGPoint
    let endScale: CGFloat
    let onLand: () -> Void

    @State private var progress: CGFloat = 0

    var body: some View {
        TeamSticker(team: team, size: size, flat: true)
            .shadow(color: Color.shadow.opacity(0.28), radius: 8, y: 8)
            .modifier(Toss(progress: progress, from: from, to: to, endScale: endScale))
            .onAppear {
                // Quick off the card, slow into the slot: a throw, not a slide.
                withAnimation(.timingCurve(0.3, 0.1, 0.2, 1, duration: 0.52)) {
                    progress = 1
                } completion: {
                    onLand()
                }
            }
    }
}

/**
 The path of the throw.

 A position animation only knows where it starts and where it ends, so it would slide the sticker
 in a straight line. This is the whole arc as one animatable number: a quadratic curve through a
 point above the higher end, one full turn in the direction of travel, and a swell at the top as
 though it came towards you before dropping into the slot.
 */
private struct Toss: GeometryEffect {
    var progress: CGFloat
    let from: CGPoint
    let to: CGPoint
    let endScale: CGFloat

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        let t = progress
        let u = 1 - t
        let lift = max(70, abs(to.x - from.x) * 0.4)
        let control = CGPoint(x: (from.x + to.x) / 2, y: min(from.y, to.y) - lift)
        let x = u * u * from.x + 2 * u * t * control.x + t * t * to.x
        let y = u * u * from.y + 2 * u * t * control.y + t * t * to.y
        let scale = (1 + (endScale - 1) * t) * (1 + 0.22 * sin(.pi * t))
        let direction: CGFloat = to.x >= from.x ? 1 : -1
        let turn = direction * 2 * .pi * t
        let transform = CGAffineTransform(translationX: -size.width / 2, y: -size.height / 2)
            .concatenating(CGAffineTransform(rotationAngle: turn))
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: x, y: y))
        return ProjectionTransform(transform)
    }
}
