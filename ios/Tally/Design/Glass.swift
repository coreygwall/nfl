import SwiftUI

/**
 Liquid Glass, where the system would use it: the floating pick tray, the toast, the week
 picker. Everything else keeps Tally's own paper-and-ink cards — glass is the chrome the content
 sits under, not the content. The helpers keep the iOS 26 calls in one file and fall back to a
 material on anything older, so lowering the deployment target is a one-line change.
 */
extension View {
    @ViewBuilder
    func glassCapsule(interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(interactive ? .regular.interactive() : .regular, in: Capsule())
        } else {
            self.background(.ultraThinMaterial, in: Capsule())
        }
    }

    @ViewBuilder
    func glassCard(cornerRadius: CGFloat = 24) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        } else {
            self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }

    /// A tinted, pressable glass pill — the "Rank them" call to action on the tray.
    @ViewBuilder
    func glassAccent(_ tint: Color) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.tint(tint).interactive(), in: Capsule())
        } else {
            self.background(tint, in: Capsule())
        }
    }
}
