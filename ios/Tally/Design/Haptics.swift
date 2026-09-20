import CoreHaptics
import UIKit

/**
 What the app feels like.

 Most of these are a single system tap, and for those `UIFeedbackGenerator` is exactly right — it
 respects the person's settings, costs nothing, and works on every device. The celebrations are
 different: winning a week should not feel like saving a form, and the system vocabulary has no
 word for it. Those are written out as Core Haptics patterns — a shaped sequence of taps with
 rising intensity — and fall back to a timed run of impacts on hardware without the engine, which
 is close enough that nobody notices and nothing is silent.

 Everything here is best-effort by design. A haptic that fails is not an error worth a line of
 code: the person is holding a phone that chose not to buzz.
 */
enum Haptics {
    // MARK: The small ones

    /// A selection tick: picking a rank up, dropping it somewhere new, switching a tab.
    static func tap() { impact(.light) }

    /// Choosing a team. Heavier than a tick, because it is a decision.
    static func pick() { impact(.medium) }

    /// Taking one back. Softer than choosing, so undoing does not feel like doing.
    static func unpick() { impact(.soft, intensity: 0.6) }

    /// A tick as the lock knob passes a quarter of the way. Light, and gets firmer as it goes.
    static func slide(progress: CGFloat) { impact(.rigid, intensity: 0.35 + progress * 0.45) }

    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func failure() { UINotificationFeedbackGenerator().notificationOccurred(.error) }

    // MARK: The ones that mean something

    /// Five picks are in and saved. Three rising taps — a door closing, in a good way.
    static func lockedIn() {
        play(
            [Beat(at: 0, intensity: 0.6, sharpness: 0.4),
             Beat(at: 0.08, intensity: 0.8, sharpness: 0.6),
             Beat(at: 0.18, intensity: 1.0, sharpness: 0.9)],
            fallback: [(0, .medium), (0.08, .medium), (0.18, .heavy)]
        )
    }

    /// A pick came in. Two quick bright taps: the sound of being right.
    static func won() {
        play(
            [Beat(at: 0, intensity: 0.7, sharpness: 0.8),
             Beat(at: 0.09, intensity: 1.0, sharpness: 1.0)],
            fallback: [(0, .light), (0.09, .medium)]
        )
    }

    /// A pick went down. One dull thud, and no second beat — there is nothing to add.
    static func lost() {
        play([Beat(at: 0, intensity: 0.55, sharpness: 0.1)], fallback: [(0, .soft)])
    }

    /// Won the week. The long one: a roll that builds, then two hits to land it.
    static func wonTheWeek() {
        var beats: [Beat] = []
        for i in 0..<6 {
            let step = Float(i)
            beats.append(Beat(at: Double(i) * 0.055, intensity: 0.35 + step * 0.1, sharpness: 0.3 + step * 0.1))
        }
        beats.append(Beat(at: 0.42, intensity: 1.0, sharpness: 1.0))
        beats.append(Beat(at: 0.56, intensity: 1.0, sharpness: 0.75))
        play(beats, fallback: [(0, .light), (0.11, .light), (0.22, .medium), (0.33, .medium), (0.45, .heavy), (0.6, .heavy)])
    }

    /// Finished the week somewhere other than first. Still worth marking; not worth a fanfare.
    static func weekSettled() {
        play(
            [Beat(at: 0, intensity: 0.5, sharpness: 0.5), Beat(at: 0.12, intensity: 0.7, sharpness: 0.4)],
            fallback: [(0, .light), (0.12, .medium)]
        )
    }

    /**
     A hole just closed, and the buzz says which kind.

     One gesture ends a hole, so the phone is the only thing that can tell you how it went without
     looking at it — which in a cart, mid-conversation, holding a putter, is most of the time. The
     four steps map onto the four things that actually happen: something rare, something good,
     the expected thing, and the bad news.

     An eagle borrows the week winner's roll rather than getting a fifth pattern of its own. That
     is deliberate: the best thing that can happen in either contest should feel the same, and a
     vocabulary of four things people can tell apart is worth more than one of five they cannot.
     */
    static func holed(toPar: Int) {
        switch toPar {
        case ..<(-1): wonTheWeek()
        case -1: won()
        case 0: lockedIn()
        default: lost()
        }
    }

    /// Top of the season table. A climb: four taps, each one firmer than the last.
    static func tookTheLead() {
        play(
            [Beat(at: 0, intensity: 0.45, sharpness: 0.5),
             Beat(at: 0.1, intensity: 0.65, sharpness: 0.6),
             Beat(at: 0.2, intensity: 0.85, sharpness: 0.8),
             Beat(at: 0.32, intensity: 1.0, sharpness: 1.0)],
            fallback: [(0, .light), (0.1, .medium), (0.2, .medium), (0.32, .heavy)]
        )
    }

    // MARK: Machinery

    /// One tap in a pattern. `at` is seconds from the start.
    private struct Beat {
        let at: TimeInterval
        let intensity: Float
        let sharpness: Float
    }

    private static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle, intensity: CGFloat = 1) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred(intensity: intensity)
    }

    /**
     Play a pattern, or the nearest thing the hardware can manage.

     The fallback is not a lesser path taken rarely — it is what runs on an iPad, in the simulator,
     and on an iPhone with haptics turned down — so it is written to have the same shape as the
     pattern above it rather than collapsing to a single buzz.
     */
    private static func play(_ beats: [Beat], fallback: [(TimeInterval, UIImpactFeedbackGenerator.FeedbackStyle)]) {
        if let engine = Engine.shared.engine {
            do {
                let events = beats.map { beat in
                    CHHapticEvent(
                        eventType: .hapticTransient,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: beat.intensity),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: beat.sharpness),
                        ],
                        relativeTime: beat.at
                    )
                }
                let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameters: []))
                try player.start(atTime: CHHapticTimeImmediate)
                return
            } catch {
                // Fall through. An engine that refuses one pattern is not worth reporting, and the
                // timed impacts below are a perfectly good second choice.
            }
        }
        for (delay, style) in fallback {
            if delay == 0 {
                impact(style)
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { impact(style) }
            }
        }
    }

    /**
     The Core Haptics engine, started once and kept.

     It stops on its own — backgrounding, an audio interruption, the system reclaiming it — so the
     handlers put it back rather than leaving the app quietly without haptics for the rest of the
     session. `nil` throughout means the hardware cannot do this, and every caller falls back.
     */
    private final class Engine {
        static let shared = Engine()
        private(set) var engine: CHHapticEngine?

        private init() {
            guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
            engine = try? CHHapticEngine()
            engine?.isAutoShutdownEnabled = true
            engine?.stoppedHandler = { [weak self] _ in
                try? self?.engine?.start()
            }
            engine?.resetHandler = { [weak self] in
                try? self?.engine?.start()
            }
            try? engine?.start()
        }
    }
}
