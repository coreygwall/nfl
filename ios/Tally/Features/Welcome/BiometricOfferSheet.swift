import SwiftUI
import TallyKit

/// A plain-language, one-time offer immediately after a successful signup.
struct BiometricOfferSheet: View {
    @Environment(AppModel.self) private var model
    let player: Identity
    let onDone: () -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            FlagMark(size: 48, corner: 14) {
                Image(systemName: "checkmark").font(.system(size: 22, weight: .black))
            }
            Text("You're all set").display(26)
            (Text("We'll remember ") + Text(player.name).bold() + Text(" on this phone, so you won't be asked again here."))
                .sans(14).foregroundStyle(Color.ink2)
            // The one tap here is what makes every other surface free afterwards: this app on a
            // new phone, and playtally.app in a browser, both open on a look with nothing typed.
            // So it leads, and getting straight to picking waits quietly underneath.
            Text("\(Biometry.label) does the rest").display(16).padding(.top, 10)
            Text("Turn it on and your account opens on a new phone, a laptop, or playtally.app with nothing to type and no code to find. You can always do this later from your account.")
                .sans(14).foregroundStyle(Color.ink2)
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            Button {
                Task { await turnOn() }
            } label: {
                Label(busy ? "Waiting for you…" : "Turn on \(Biometry.label)", systemImage: Biometry.symbolName)
            }
            .buttonStyle(.tally(.turf, fullWidth: true))
            .disabled(busy)
            .padding(.top, 4)
            Button("Not now — start picking →", action: onDone)
                .buttonStyle(.tally(.ghost, size: .small, fullWidth: true))
                .disabled(busy)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.surface)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(busy)
    }

    private func turnOn() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await PasskeyFlows.addPasskey(service: model.service, passkeys: model.passkeys)
            model.toast("\(Biometry.label) is ready on your account.", kind: .success)
            onDone()
        } catch {
            let e = PasskeyService.translate(error)
            if e != .cancelled { self.error = e.localizedDescription }
        }
    }
}
