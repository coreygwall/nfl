import SwiftUI
import TallyKit

/**
 Pull to refresh, written in the app's own hand.

 The system's spinner says what every app says. This writes the mark instead: pull the page down
 and the four uprights go in one after another, a tick in the hand as each is finished, and the
 fifth stroke — the one through the other four — is what says "let go now", with a firmer tap and
 a little swell. Let go and the finished mark lifts into a pill of glass at the top and keeps
 writing itself until the pool has answered, then goes. Five strokes to a tally, five picks to a
 week: it is the one piece of loading chrome that could only belong to this app.

 It is built from the scroll view's own geometry rather than `.refreshable`, because that one
 draws the system's spinner and nothing can replace it. How far past the top the content has been
 pulled is the pen; the scroll phase leaving `.interacting` is the letting go. VoiceOver cannot
 pull, so the scroll view also carries a named "Refresh" action, which is what the system control
 would have given it.
 */
struct TallyRefresh: ViewModifier {
    let action: () async -> Void

    /// How far past the top a pull has to go for the fifth stroke to land.
    static let reach: CGFloat = 96

    @State private var pull: CGFloat = 0
    @State private var phase: ScrollPhase = .idle
    @State private var refreshing = false
    /// Strokes finished by the pull so far, so each one ticks once on the way down.
    @State private var written = 0

    private var progress: Double { Double(min(pull / Self.reach, 1)) }

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: CGFloat.self) { geo in
                max(0, -(geo.contentOffset.y + geo.contentInsets.top))
            } action: { _, new in
                pull = new
                let strokes = TallyRefresh.strokes(at: Double(min(new / Self.reach, 1)))
                // Ticks only for a finger writing, not for the page springing back.
                if phase == .interacting, !refreshing, strokes > written {
                    if strokes == 5 { Haptics.pick() } else { Haptics.slide(progress: CGFloat(strokes) / 5) }
                }
                written = strokes
            }
            .onScrollPhaseChange { old, new in
                phase = new
                if old == .interacting, new != .interacting, pull >= Self.reach {
                    start()
                }
            }
            .overlay(alignment: .top) {
                if refreshing {
                    TallyMark(size: 34)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .glassCapsule()
                        .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                        .padding(.top, 6)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                } else if pull > 2 {
                    PullMark(progress: progress)
                        .frame(height: pull)
                        .allowsHitTesting(false)
                }
            }
            .animation(Motion.slap, value: refreshing)
            .accessibilityAction(named: "Refresh") { start() }
    }

    private func start() {
        guard !refreshing else { return }
        refreshing = true
        Task {
            let began = Date()
            await action()
            // Long enough to write the mark once. A refresh that answers in 200ms would otherwise
            // flash a pill nobody can read, which looks like a glitch rather than a result.
            let spent = Date().timeIntervalSince(began)
            if spent < 1.1 { try? await Task.sleep(for: .seconds(1.1 - spent)) }
            refreshing = false
        }
    }

    /// How many of the five strokes `TallyGlyph` has finished at a given progress: stroke `i`
    /// starts at `0.14 × i` and takes `0.44`, so they finish at 0.44, 0.58, 0.72, 0.86 and 1.
    static func strokes(at progress: Double) -> Int {
        (0..<5).filter { progress >= 0.44 + 0.14 * Double($0) - 0.0001 }.count
    }
}

/// The mark as far as the pull has written it, swelling when the fifth stroke goes through.
private struct PullMark: View {
    let progress: Double

    var body: some View {
        let armed = progress >= 1
        Canvas { context, size in
            TallyGlyph.draw(into: context, size: size, progress: progress, ink: .ink, ground: .paper)
        }
        .frame(width: 46, height: 46 * TallyGlyph.aspect)
        .scaleEffect(armed ? 1.12 : 0.8 + 0.2 * progress)
        .opacity(min(1, progress * 2.5))
        .animation(Motion.slap, value: armed)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Pull to refresh, with the tally mark as the indicator. Put it on the `ScrollView`.
    func tallyRefresh(_ action: @escaping () async -> Void) -> some View {
        modifier(TallyRefresh(action: action))
    }
}
