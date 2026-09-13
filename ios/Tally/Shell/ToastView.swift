import SwiftUI

/// Short, at the top, on glass. Same three tones as the web's toast.
struct ToastStack: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 8) {
            ForEach(model.toasts) { toast in
                HStack(spacing: 10) {
                    Image(systemName: icon(toast.kind))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(color(toast.kind))
                    Text(toast.text).sans(14, weight: .semibold).foregroundStyle(Color.ink)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .glassCapsule()
                .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: model.toasts)
        .allowsHitTesting(false)
    }

    private func icon(_ kind: Toast.Kind) -> String {
        switch kind {
        case .info: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .error: return "exclamationmark.triangle.fill"
        }
    }

    private func color(_ kind: Toast.Kind) -> Color {
        switch kind {
        case .info: return .sky
        case .success: return .turf
        case .error: return .danger
        }
    }
}
