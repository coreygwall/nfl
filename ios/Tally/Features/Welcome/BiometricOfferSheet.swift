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
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .black))
                .frame(width: 48, height: 48)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.flag))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.ink, lineWidth: 2))
            Text("You're all set").display(26)
            (Text("We'll remember ") + Text(player.name).bold() + Text(" on this phone, so you won't need to sign in again here."))
                .sans(14).foregroundStyle(Color.ink2)
            Button("Start picking →", action: onDone)
                .buttonStyle(.tally(.turf, fullWidth: true))
                .disabled(busy)
                .padding(.top, 8)
            DashedDivider().padding(.top, 8)
            Text("Want to use another device?").display(16)
            Text("Set up Face ID now to open your account on a new phone, tablet, or the website without a code. You can always turn it on later from your account.")
                .sans(14).foregroundStyle(Color.ink2)
            if let error { Text(error).sans(14, weight: .semibold).foregroundStyle(Color.danger) }
            Button {
                Task { await turnOn() }
            } label: {
                Label(busy ? "Waiting for you…" : "Set up Face ID", systemImage: "faceid")
            }
            .buttonStyle(.tally(.plain, size: .small, fullWidth: true))
            .disabled(busy)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
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
            model.toast("Face ID is ready on your account.", kind: .success)
            onDone()
        } catch {
            let e = PasskeyService.translate(error)
            if e != .cancelled { self.error = e.localizedDescription }
        }
    }
}
