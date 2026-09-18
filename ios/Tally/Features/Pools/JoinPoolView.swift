import SwiftUI
import TallyKit

/**
 The two ways into somebody else's pool: the code they said, or the link they sent.

 One form behind two doors — the button under the home tab's carousel, and the "Join a pool"
 section of `PoolsView` — because the alternative is the thing that already happened once on the
 web, where the same invitation was explained in two slightly different sets of words.

 The code comes first because it is the one that works across a table. A link only arrives
 somewhere you can tap it, and when it does, tapping it never reaches this screen at all: iOS
 hands it to `AppModel.open(_:)` through the associated domain. The field is here for the link
 that arrived somewhere it could not be tapped — read out, screenshotted, pasted into a note.
 */
struct JoinPoolForm: View {
    @Environment(AppModel.self) private var model
    /// Called once a pool has been joined, so a sheet can close itself.
    var onJoined: () -> Void = {}

    @State private var code = ""
    @State private var link = ""
    @State private var error: String?
    @State private var working = false
    @FocusState private var focused: Bool

    /// Shape only. Whether a pool answers to it is the server's to say, and saying "no such pool"
    /// before asking anybody would be a guess.
    private var codeReady: Bool { PoolCode.isShaped(code) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Have a code?")
                Text("Six characters, three letters then three numbers. Whoever runs the pool has it.")
                    .sans(14).foregroundStyle(Color.ink2)
                TextField("KDP-472", text: $code)
                    .tallyField(font: TallyFont.display(24))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                    .onChange(of: code) { _, typed in
                        // Formatted as it is typed, so the dash appears where it is spoken and
                        // nobody has to decide whether to type one.
                        let shaped = PoolCode.formatWhileTyping(typed)
                        if shaped != typed { code = shaped }
                        error = nil
                    }
                    .onSubmit { Task { await join() } }
                Button(working ? "Looking…" : "Join this pool") { Task { await join() } }
                    .buttonStyle(.tally(.primary, size: .small))
                    .disabled(!codeReady || working)
            }

            DashedDivider()

            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Sent a link instead?")
                TextField("https://playtally.app/p/…", text: $link)
                    .tallyField(font: TallyFont.sans(15))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Button("Open pool") { openLink() }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(link.isEmpty)
            }

            if let error {
                Text(error)
                    .sans(14, weight: .semibold)
                    .foregroundStyle(Color.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func join() async {
        guard codeReady, !working else { return }
        working = true
        focused = false
        defer { working = false }
        if let message = await model.joinByCode(code) {
            error = message
            Haptics.warning()
        } else {
            code = ""
            onJoined()
        }
    }

    private func openLink() {
        guard let url = URL(string: link.trimmingCharacters(in: .whitespaces)), PoolRef.parse(url) != nil else {
            error = "That doesn't look like a pool link."
            Haptics.warning()
            return
        }
        model.open(url)
        onJoined()
    }
}

/// The form on its own sheet, for the button under the home tab's carousel.
struct JoinPoolSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.paper.ignoresSafeArea()
                ScrollView {
                    JoinPoolForm(onJoined: { dismiss() })
                        .padding(16)
                }
            }
            .noZoom()
            .navigationTitle("Join a pool")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}
