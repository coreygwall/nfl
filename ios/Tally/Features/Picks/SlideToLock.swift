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
                Capsule().strokeBorder(Color.ink, lineWidth: 2)
                Text(pending ? busy : title)
                    .font(TallyFont.display(17, weight: .bold))
                    .foregroundStyle(Color.onFill)
                    .frame(maxWidth: .infinity)
                    .opacity(1 - Double(progress) * 1.4)
                Circle()
                    .fill(Color.onFill)
                    .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
                    .overlay(Image(systemName: progress > 0.95 ? symbols.closed : symbols.open).font(.system(size: 18, weight: .bold)).foregroundStyle(Color.ink))
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
