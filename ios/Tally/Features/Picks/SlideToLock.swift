import SwiftUI

/// Slide the lock across to save. One gesture, no accidental taps, and it feels like locking.
struct SlideToLock: View {
    let pending: Bool
    let disabled: Bool
    let onSubmit: () -> Void

    @State private var offset: CGFloat = 0
    @State private var fired = false
    private let height: CGFloat = 56
    private let knob: CGFloat = 48

    var body: some View {
        GeometryReader { geo in
            let travel = max(geo.size.width - knob - 8, 1)
            let progress = min(max(offset / travel, 0), 1)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.turf)
                Capsule().strokeBorder(Color.ink, lineWidth: 2)
                Text(pending ? "Saving…" : "Slide to lock in")
                    .font(TallyFont.display(17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .opacity(1 - Double(progress) * 1.4)
                Circle()
                    .fill(Color.white)
                    .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
                    .overlay(Image(systemName: progress > 0.95 ? "lock.fill" : "lock.open.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(Color.ink))
                    .frame(width: knob, height: knob)
                    .offset(x: 4 + offset)
                    .gesture(
                        DragGesture(minimumDistance: 1)
                            .onChanged { value in
                                guard !disabled, !pending, !fired else { return }
                                offset = min(max(value.translation.width, 0), travel)
                            }
                            .onEnded { _ in
                                guard !disabled, !pending, !fired else { return }
                                if offset >= travel * 0.92 {
                                    fired = true
                                    Haptics.success()
                                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) { offset = travel }
                                    onSubmit()
                                    Task {
                                        try? await Task.sleep(for: .seconds(1.2))
                                        withAnimation { offset = 0 }
                                        fired = false
                                    }
                                } else {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { offset = 0 }
                                }
                            }
                    )
            }
        }
        .frame(height: height)
        .opacity(disabled ? 0.45 : 1)
        .accessibilityRepresentation {
            Button(pending ? "Saving…" : "Lock it in", action: onSubmit).disabled(disabled || pending)
        }
    }
}
