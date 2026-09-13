import SwiftUI

/// A burst of paper from the bottom of the screen when picks are locked in. Two and a half
/// seconds, then gone; nothing under it is touched.
struct ConfettiView: View {
    let trigger: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Particle {
        let x: CGFloat
        let vx: CGFloat
        let vy: CGFloat
        let color: Color
        let size: CGFloat
        let spin: CGFloat
    }

    private let particles: [Particle]
    private let start = Date()

    init(trigger: Int) {
        self.trigger = trigger
        let palette: [Color] = [.turf, .flag, .ink, .white, .sky]
        var rng = SystemRandomNumberGenerator()
        particles = (0..<140).map { _ in
            Particle(
                x: CGFloat.random(in: 0.2...0.8, using: &rng),
                vx: CGFloat.random(in: -260...260, using: &rng),
                vy: CGFloat.random(in: -900 ... -420, using: &rng),
                color: palette[Int.random(in: 0..<5, using: &rng)],
                size: CGFloat.random(in: 6...11, using: &rng),
                spin: CGFloat.random(in: -6...6, using: &rng)
            )
        }
    }

    var body: some View {
        if reduceMotion {
            EmptyView()
        } else {
            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSince(start)
                Canvas { context, size in
                    guard t < 2.6 else { return }
                    for p in particles {
                        let x = p.x * size.width + p.vx * t
                        let y = size.height * 0.75 + p.vy * t + 700 * t * t
                        guard y < size.height + 20 else { continue }
                        var rect = context
                        rect.translateBy(x: x, y: y)
                        rect.rotate(by: .radians(p.spin * t))
                        rect.opacity = max(0, 1 - (t - 1.6) / 1.0)
                        rect.fill(Path(CGRect(x: -p.size / 2, y: -p.size / 3, width: p.size, height: p.size * 0.66)), with: .color(p.color))
                    }
                }
            }
            .ignoresSafeArea()
            .id(trigger)
        }
    }
}
