import SwiftUI
import TallyKit
import UIKit

/**
 Render the card to a PNG somebody can send.

 `ImageRenderer` draws a SwiftUI view off-screen at whatever scale is asked for. Three things are
 pinned here rather than left to chance: the **light palette**, so the card looks the same to
 everybody whatever the sender's phone was doing; **scale 3**, which makes 1080 × 1350 from the
 poster's design size and stays crisp on any screen it lands on; and a **file on disk**, because
 sharing a file URL behaves better in Messages and Mail than handing over an image value.

 The file is named after the card and lives in the temporary directory, so a second share of the
 same round overwrites rather than accumulating, and the system clears it when it needs the space.
 */
@MainActor
enum ShareCardRenderer {
    static func png(for card: ScrambleCard) -> URL? {
        let renderer = ImageRenderer(
            content: ShareCardView(card: card).environment(\.colorScheme, .light)
        )
        renderer.scale = 3
        guard let image = renderer.uiImage, let data = image.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tally-round-\(card.id).png")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}

/**
 The card, shown before it is sent.

 Sharing blind is the wrong shape for something that is meant to be a trophy: people want to see
 what is going out, and seeing it is half the pleasure. So the poster is drawn live at the top of
 the sheet and the share button sends the rendered copy of exactly that.

 The message carries **no text**. The picture is the message, and a paragraph underneath it only
 makes the thread longer. When there is a link worth adding — a recap for the people who played,
 the App Store for everyone else — it goes on the card and in this share, not into a body of prose.

 If rendering fails, which `ImageRenderer` is allowed to do, the sheet says so and offers the words
 instead. A share button that does nothing is worse than one that sends less.
 */
struct ShareCardSheet: View {
    @Environment(\.dismiss) private var dismiss
    let card: ScrambleCard

    private enum Mode: Hashable { case link, poster }
    /**
     Two different acts, one button.

     The link gets the other three onto the card *during* the round; the poster goes in the group
     chat *after* it. They are both "share", which is why they live behind one control rather than
     two menu items — and the link leads, because a round that is still being played is the common
     case and the poster of a half-finished round is nobody's trophy. A finished round opens on the
     poster, because by then the argument is over and the picture is the point.
     */
    @State private var mode: Mode

    init(card: ScrambleCard) {
        self.card = card
        _mode = State(initialValue: card.isComplete ? .poster : .link)
    }

    @State private var rendered: URL?
    @State private var failed = false

    private var title: String {
        card.course.isEmpty ? card.name : "\(card.name) · \(card.course)"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.paper.ignoresSafeArea()
                VStack(spacing: 18) {
                    TallySegmented(
                        value: $mode,
                        options: [(Mode.link, "Play together"), (Mode.poster, "Poster")]
                    )
                    if mode == .link {
                        ScrollView {
                            ShareLinkSheet(cardId: card.id).padding(.bottom, 24)
                        }
                    } else {
                        posterBody
                    }
                }
                .padding(16)
            }
            .noZoom()
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .task { await render() }
        }
    }

    /// The round as a picture, and the one button that sends it.
    @ViewBuilder
    private var posterBody: some View {
        poster
        if failed {
            VStack(spacing: 8) {
                Text("The card wouldn't draw.")
                    .sans(13, weight: .semibold)
                    .foregroundStyle(Color.ink2)
                ShareLink(item: ScrambleTally.summary(card)) {
                    Label("Send it as text instead", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.tally(.plain, size: .small))
            }
        } else if let rendered {
            ShareLink(item: rendered, subject: Text(title)) {
                Label("Share the card", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.tally(.primary, fullWidth: true))
        } else {
            Spinner(label: "Drawing the card…")
        }
        Spacer(minLength: 0)
    }

    /// Draw it once, when the sheet appears. It takes a few milliseconds, which is why there is a
    /// spinner rather than a progress bar, and why nothing is rendered until somebody asks to share.
    private func render() async {
        guard rendered == nil, !failed else { return }
        if let url = ShareCardRenderer.png(for: card) { rendered = url } else { failed = true }
    }

    /// The poster itself, scaled to whatever room the sheet gives it. Always light, because that
    /// is what will be sent, and a preview that does not match the file is a small lie.
    private var poster: some View {
        GeometryReader { geo in
            let scale = min(
                geo.size.width / ShareCardView.size.width,
                geo.size.height / ShareCardView.size.height
            )
            ShareCardView(card: card)
                .environment(\.colorScheme, .light)
                .clipShape(RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous)
                        .strokeBorder(Color.ink, lineWidth: 2)
                )
                .shadow(color: Color.shadow, radius: 0, x: 4, y: 4)
                .scaleEffect(scale)
                .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}
