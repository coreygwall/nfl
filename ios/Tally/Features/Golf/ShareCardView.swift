import SwiftUI
import TallyKit

/**
 The round as a poster.

 What leaves the phone is this, drawn and rendered to a PNG, rather than the paragraph it used to
 be. The reasoning is not decoration: a result is a paragraph, a *trophy* is a picture, and a
 picture is what gets re-shared, screenshotted and kept in a thread. It is also the only marketing
 this feature will ever do — three other people see a Tally card land in the group chat and ask
 what it is.

 Five decisions are baked in here rather than left to the call site:

 - **4:5 portrait**, which is the shape a thread and a story both give the most room to.
 - **Always the light palette.** `ShareCardRenderer` pins the colour scheme, so the card looks the
   same to everybody regardless of what the sender's phone was doing. Deterministic beats clever
   for something that leaves the device.
 - **A fixed point size**, because `ImageRenderer` needs an intrinsic size and because a layout
   that reflows is a layout that can surprise you at render time. Scale happens at render.
 - **No live data.** Everything is read once from the card handed in, so the same input always
   draws the same poster.
 - **The golf badge, not the football one.** `GolfMark` is the same yellow badge in the same ink as
   `TallyMark` with a ball on a tee inside it instead of a football: the badge is what says Tally,
   and the ball says which game this was. A poster wearing the football would be selling the wrong
   contest to the three people who just played this one.

 The footer carries the domain and nothing else. When there is something to link *to* — a recap for
 the people who played it, an App Store page for everyone else — that is where it goes.
 */
struct ShareCardView: View {
    let card: ScrambleCard

    /// The design size. Rendered at 3x for 1080 × 1350.
    static let size = CGSize(width: 360, height: 450)

    private var rows: [TallyRow] { ScrambleTally.rows(card) }
    private var highlights: ScrambleTally.Highlights { ScrambleTally.highlights(card) }

    private var subtitle: String {
        let date = Format.shortDay(card.createdAt)
        return card.course.isEmpty ? date : "\(card.course) · \(date)"
    }

    private var progress: String {
        if card.isComplete { return "FINAL" }
        if card.throughHole == 0 { return "NOT STARTED" }
        return "THROUGH \(card.throughHole)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            score
            Spacer(minLength: 10)
            tally
            Spacer(minLength: 10)
            brags
            footer
        }
        .padding(22)
        .frame(width: ShareCardView.size.width, height: ShareCardView.size.height, alignment: .topLeading)
        .background(Color.paper)
    }

    // MARK: Who and where

    private var header: some View {
        HStack(spacing: 8) {
            Image("GolfMark")
                .resizable()
                .scaledToFit()
                .frame(width: 26, height: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(card.name)
                    .font(TallyFont.display(19))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(subtitle.uppercased())
                    .font(TallyFont.sans(8, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(Color.ink3)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: The number

    private var score: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: -4) {
                Text(ScrambleTally.toParText(card.toPar))
                    .font(TallyFont.display(72))
                    .monospacedDigit()
                    .foregroundStyle(Color.ink)
                Text("\(card.strokesTaken) strokes · par \(card.totalPar)")
                    .font(TallyFont.sans(11, weight: .bold))
                    .foregroundStyle(Color.ink2)
            }
            Spacer(minLength: 0)
            Text(progress)
                .font(TallyFont.display(10))
                .tracking(1.2)
                .foregroundStyle(Color.onFill)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.turf))
                .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                .padding(.bottom, 6)
        }
        .padding(.top, 14)
    }

    // MARK: The argument

    private var tally: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SHOTS KEPT")
                .font(TallyFont.display(9))
                .tracking(1.2)
                .foregroundStyle(Color.ink3)
            // Six names is the most this shape holds without the rows going thin. A bigger group
            // still gets a correct card; it just shows the top of it.
            ForEach(rows.prefix(6)) { row in
                ShareTallyRow(row: row, leading: row.place == 1 && row.kept > 0)
            }
        }
    }

    private var brags: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let tee = highlights.offTheTee {
                BragLine(symbol: "figure.golf", label: "Off the tee", best: tee, unit: "drive")
            }
            if let holed = highlights.holed {
                BragLine(symbol: "flag.fill", label: "Holed", best: holed, unit: "shot")
            }
        }
    }

    private var footer: some View {
        HStack {
            Text("PLAYTALLY.APP")
                .font(TallyFont.display(9))
                .tracking(1.4)
                .foregroundStyle(Color.ink3)
            Spacer()
            Text("KEPT WITH TALLY")
                .font(TallyFont.display(9))
                .tracking(1.4)
                .foregroundStyle(Color.ink3)
        }
        .padding(.top, 12)
    }
}

// MARK: Rows

private struct ShareTallyRow: View {
    let row: TallyRow
    let leading: Bool

    private var detail: String {
        var parts: [String] = []
        if row.drives > 0 { parts.append("\(row.drives) tee") }
        if row.holed > 0 { parts.append("\(row.holed) holed") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 9) {
            Text("\(row.place)")
                .font(TallyFont.display(12))
                .monospacedDigit()
                .foregroundStyle(leading ? Color.onAccent : Color.ink2)
                .frame(width: 22, height: 22)
                .background(Circle().fill(leading ? Color.flag : Color.surface))
                .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
            Text(row.player.name)
                .font(TallyFont.display(16))
                .foregroundStyle(Color.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 4)
            if !detail.isEmpty {
                Text(detail)
                    .font(TallyFont.sans(9, weight: .bold))
                    .foregroundStyle(Color.ink3)
                    .lineLimit(1)
            }
            Text("\(row.kept)")
                .font(TallyFont.display(20))
                .monospacedDigit()
                .foregroundStyle(Color.ink)
                .frame(minWidth: 22, alignment: .trailing)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(leading ? Color.flagSoft : Color.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.cardBorder, lineWidth: 2)
        )
    }
}

private struct BragLine: View {
    let symbol: String
    let label: String
    let best: ScrambleTally.Highlights.Best
    /// "drive" or "shot", pluralised by the count.
    let unit: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color.turf)
                .frame(width: 14)
            Text("\(label.uppercased())")
                .font(TallyFont.display(9))
                .tracking(1)
                .foregroundStyle(Color.ink3)
            Text(best.who)
                .font(TallyFont.display(13))
                .foregroundStyle(Color.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 2)
            Text(Format.plural(best.count, unit))
                .font(TallyFont.sans(10, weight: .bold))
                .foregroundStyle(Color.ink2)
        }
    }
}

#if DEBUG
extension ShareCardView {
    /// A round that has actually been played, so the preview shows the card at its busiest rather
    /// than the empty state.
    static var sample: ScrambleCard {
        var card = ScrambleCard(
            name: "Saturday scramble",
            course: "Blue Hill",
            players: ["Corey", "Dan", "Pete", "Sam"].map { GolfPlayer(name: $0) },
            pars: CardSetupSheet.standardPars
        )
        let ids = card.players.map(\.id)
        for hole in 1...18 {
            card.record(.shot(by: ids[hole % ids.count]), on: hole)
            card.record(.shot(by: ids[(hole + 1) % ids.count]), on: hole)
            card.finish(hole: hole, tapIn: hole % 3 != 0)
        }
        return card
    }
}

#Preview {
    ShareCardView(card: ShareCardView.sample)
}
#endif
