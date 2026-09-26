import SwiftUI

/// Slide the lock across to save. One gesture, no accidental taps, and it feels like locking.
///
/// The words and the knob's symbol are parameters because the golf card borrows the gesture to
/// finish a hole: the same deliberate act, said as "Swipe to finish the hole" under a flag rather
/// than a lock. The pick flow's defaults are unchanged.
struct SlideToLock: View {
    let pending: Bool
    let disabled: Bool
    var title = "Slide to lock in"
    var busy = "Saving…"
    /// The knob before and after the bolt goes home.
    var symbols: (open: String, closed: String) = ("lock.open.fill", "lock.fill")
    let onSubmit: () -> Void

    @State private var offset: CGFloat = 0
    @State private var fired = false
    /// Which quarter of the travel the knob has reached, so the ticks come at thresholds rather
    /// than on every pixel of the drag.
    @State private var notch = 0
    private let height: CGFloat = 56
    private let knob: CGFloat = 48

    var body: some View {
        GeometryReader { geo in
            let travel = max(geo.size.width - knob - 8, 1)
            let progress = min(max(offset / travel, 0), 1)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.turf)
                // The ground the bolt has covered, so how far there is still to go is visible
                // rather than guessed from where the thumb is.
                Capsule()
                    .fill(Color.onFill.opacity(0.16))
                    .frame(width: knob + 8 + offset)
                Capsule().strokeBorder(Color.ink, lineWidth: 2)
                GleamLabel(text: pending ? busy : title, gleaming: !pending && !disabled && offset == 0)
                    .frame(maxWidth: .infinity)
                    .opacity(1 - Double(progress) * 1.4)
                Circle()
                    .fill(Color.onFill)
                    .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
                    .overlay(
                        // The shackle closes as the bolt goes home, rather than one picture
                        // swapping for another.
                        Image(systemName: progress > 0.95 ? symbols.closed : symbols.open)
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Color.ink)
                            .contentTransition(.symbolEffect(.replace))
                            .animation(Motion.snap, value: progress > 0.95)
                    )
                    .frame(width: knob, height: knob)
                    .offset(x: 4 + offset)
                    .gesture(
                        DragGesture(minimumDistance: 1)
                            .onChanged { value in
                                guard !disabled, !pending, !fired else { return }
                                let next = min(max(value.translation.width, 0), travel)
                                offset = next
                                // Off the new offset, not off `progress` — that one was worked out
                                // when the view was last drawn, so it is a frame behind the thumb.
                                let reach = min(max(next / travel, 0), 1)
                                let quarter = Int(reach * 4)
                                if quarter != notch {
                                    notch = quarter
                                    if quarter > 0 { Haptics.slide(progress: reach) }
                                }
                            }
                            .onEnded { _ in
                                guard !disabled, !pending, !fired else { return }
                                if offset >= travel * 0.92 {
                                    fired = true
                                    // The bolt going home. The celebration waits until the picks
                                    // have actually saved — see `submit()`.
                                    Haptics.pick()
                                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) { offset = travel }
                                    onSubmit()
                                    Task {
                                        try? await Task.sleep(for: .seconds(1.2))
                                        withAnimation { offset = 0 }
                                        fired = false
                                        notch = 0
                                    }
                                } else {
                                    notch = 0
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { offset = 0 }
                                }
                            }
                    )
            }
        }
        .frame(height: height)
        .opacity(disabled ? 0.45 : 1)
        .accessibilityRepresentation {
            Button(pending ? busy : title, action: onSubmit).disabled(disabled || pending)
        }
    }
}

/**
 The resting label, with a light passing across it now and then.

 Slide-to-unlock taught a generation of thumbs what a sweep of light across a track means, so the
 control borrows it: the words sit a little dim and a brighter band crosses them left to right,
 which is the direction to go. It stops the moment the knob moves or the save is in flight, and
 never runs with Reduce Motion on — the words are then simply at full strength.
 */
private struct GleamLabel: View {
    let text: String
    let gleaming: Bool
    @State private var sweep = false

    private var live: Bool { gleaming && !Motion.reduced }

    var body: some View {
        let label = Text(text).font(TallyFont.display(17, weight: .bold))
        label
            .foregroundStyle(Color.onFill.opacity(live ? 0.72 : 1))
            .overlay {
                if live {
                    GeometryReader { geo in
                        LinearGradient(
                            colors: [Color.onFill.opacity(0), Color.onFill, Color.onFill.opacity(0)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geo.size.width * 0.45)
                        .offset(x: sweep ? geo.size.width : -geo.size.width * 0.45)
                    }
                    .mask { label }
                    .onAppear {
                        withAnimation(.linear(duration: 1.5).delay(0.9).repeatForever(autoreverses: false)) { sweep = true }
                    }
                    .onDisappear { sweep = false }
                }
            }
    }
}
