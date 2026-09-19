import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import TallyKit
import UIKit

/**
 The way the other three get on the card.

 A scramble is four people and one phone, which has been the quiet limit on this whole feature: the
 person holding the app keeps the card and everybody else asks them what the score is. Publishing
 turns the card into a page anybody can open, and this is where that link is handed over — as a
 link to send, and as a **QR code to hold up**, which is the one that actually works on a first tee
 where nobody wants to type anything and the group text has not been started yet.

 Three decisions worth stating:

 - **It publishes on appear, not on a button.** Somebody who opened this sheet has already decided
   to share; making them tap *Publish* first would be asking the same question twice. Until it
   lands there is a spinner rather than a dead link.
 - **The QR is always drawn in the light palette.** A QR code is read by a camera looking for dark
   modules on a light ground, and an inverted one is a code that half the phones in the group
   cannot scan. `.environment(\.colorScheme, .light)` is the same trick the poster uses, so this
   needs no colour of its own and the parity test stays satisfied.
 - **The link is shown in full.** It is 24 characters of nonsense and nobody will read it out, but
   seeing the address is how a person decides whether to send it — and a truncated URL beside a
   *Copy* button is the shape of a phishing prompt.
 */
struct ShareLinkSheet: View {
    @Environment(GolfModel.self) private var golf
    @Environment(AppModel.self) private var model
    let cardId: String

    @State private var token: String?
    @State private var failed = false
    @State private var showQR = true

    private var card: ScrambleCard? { golf.card(cardId) }
    private var url: URL? { token.flatMap { GolfShare.url(token: $0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let url {
                published(url)
            } else if failed {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Couldn't make a link.").display(17)
                    Text("The card is safe on this phone. Try again when you have signal.")
                        .sans(13).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Try again") { Task { await publish() } }
                        .buttonStyle(.tally(.primary, size: .small))
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .dangerSoft, border: .danger)
            } else {
                Spinner(label: "Making a link…")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 28)
            }
        }
        .task { await publish() }
    }

    @ViewBuilder
    private func published(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: "Anybody with this link")
            Text("They can see the round and keep it with you — strokes, side games, the lot. No app, no sign-in.")
                .sans(13).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }

        if showQR {
            // Centred and big: this is held up across a tee box, not looked at.
            QRCard(url: url)
                .frame(maxWidth: .infinity)
        }

        Text(url.absoluteString)
            .sans(12)
            .foregroundStyle(Color.ink2)
            .textSelection(.enabled)
            .lineLimit(2)
            .truncationMode(.middle)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardFlat(fill: .paper2)

        HStack(spacing: 10) {
            ShareLink(item: url) {
                Label("Send the link", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.tally(.primary, fullWidth: true))
            Button {
                Haptics.tap()
                UIPasteboard.general.url = url
                model.toast("Link copied.", kind: .success)
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
            .buttonStyle(.tally(.plain))
        }

        Button(showQR ? "Hide the QR code" : "Show a QR code") {
            Haptics.tap()
            withAnimation(Motion.fade) { showQR.toggle() }
        }
        .buttonStyle(.tally(.ghost, size: .small))

        Text("The link is the only way in — the page isn't listed anywhere and search engines are told to leave it alone. Anyone you send it to can edit the card, so send it to the people you're playing with.")
            .sans(12).foregroundStyle(Color.ink3)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func publish() async {
        guard token == nil else { return }
        failed = false
        if let existing = card?.shareToken {
            token = existing
            // Still publish: it is how a card that was shared on an older build, or on a phone
            // that has since been restored, proves the row is really there.
            await golf.publish(cardId: cardId)
            return
        }
        if let minted = await golf.publish(cardId: cardId) {
            token = minted
        } else {
            failed = true
        }
    }
}

/**
 The link as a square somebody can point a camera at.

 Rendered once per URL and cached in the view's state, because `CIContext` work is not free and
 this redraws whenever the sheet does. Drawn at a fixed point size with interpolation switched off:
 a QR code scaled with smoothing is a QR code with soft module edges, which is exactly what a
 scanner is trying to threshold.
 */
private struct QRCard: View {
    let url: URL
    @State private var image: UIImage?

    private static let context = CIContext()

    var body: some View {
        VStack(spacing: 8) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 210, height: 210)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).fill(Color.surface))
                    .overlay(
                        RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous)
                            .strokeBorder(Color.ink, lineWidth: 2)
                    )
                    .accessibilityLabel("QR code for this card's link")
            } else {
                RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous)
                    .fill(Color.paper2)
                    .frame(width: 234, height: 234)
                    .overlay(Spinner(label: ""))
            }
            Text("Point a camera at it").sans(12).foregroundStyle(Color.ink3)
        }
        // Always light, whatever the phone is doing: a camera is looking for dark modules on a
        // light ground, and an inverted code is one a good half of scanners will refuse.
        .environment(\.colorScheme, .light)
        .task(id: url) { image = QRCard.render(url) }
    }

    private static func render(_ url: URL) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        // Medium correction: a phone screen is a clean, flat, well-lit surface, so the extra
        // redundancy of a higher level would only make the modules smaller for no benefit.
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
