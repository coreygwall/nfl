import SwiftUI
import TallyKit

/**
 The week as a table: every entry down the side, the five places across, the points at the end.

 The card list answers "how is everybody doing" one row at a time, with the picks a tap away. This
 answers the other question — *who took whom* — for the whole pool at once, which is what people
 ask on a Sunday afternoon with two games left: is anyone else on the Chiefs at 5? A column per
 place rather than per game because the place is the fact that makes a pick worth comparing.

 It hides exactly what the list hides. A pick whose game has not started is a lock for anyone
 outside the asking account, and the Worker decided that before the row got here — this only draws
 what it was sent. The account's own entries are all shown whole and marked *yours*, because a
 phone that picks for the family is one reader.

 Text rather than logos in the cells. At six columns on a phone a logo is twenty points, and at
 twenty points the Giants and the Jets are the same blue smudge; three letters are not.
 */
struct BoardGrid: View {
    @Environment(AppModel.self) private var model
    let rows: [WeekRow]
    let started: Bool

    private let cell: CGFloat = 40

    var body: some View {
        VStack(spacing: 0) {
            header
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 { Divider().overlay(Color.line) }
                line(row)
            }
        }
        // `TallyCard` paints its stroke *under* the content, so a row's fill — the flag behind
        // your own entry — covered the border and squared the corners off. Clip the rows to a
        // shape two points inside the card's, concentric with the stroke, and let the card draw
        // its border in the ring that leaves.
        .clipShape(RoundedRectangle(cornerRadius: TallyRadius.card - 2, style: .continuous))
        .padding(2)
        .cardFlat()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Who picked whom, by place")
    }

    private var header: some View {
        HStack(spacing: 2) {
            Spacer(minLength: 0)
            ForEach(Scoring.allRanks, id: \.self) { rank in
                Text("\(Scoring.points(forRank: rank))")
                    .font(TallyFont.display(13))
                    .frame(width: cell)
                    .accessibilityLabel("Worth \(Scoring.points(forRank: rank))")
            }
            Text("PTS")
                .font(TallyFont.sans(10, weight: .bold)).tracking(1)
                .foregroundStyle(Color.ink3)
                .frame(width: 44, alignment: .trailing)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.line).frame(height: 2) }
    }

    private func line(_ row: WeekRow) -> some View {
        let isMe = row.playerId == model.player?.id
        let yours = row.isMine && !isMe
        return HStack(spacing: 2) {
            HStack(spacing: 6) {
                PlaceBadge(place: row.place, small: true, muted: !started)
                Text(row.name)
                    .font(TallyFont.display(14))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if isMe { Chip(text: "you", size: 10) }
                if yours { Chip(text: "yours", size: 10) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(row.pickSlots) { slot in
                GridCell(slot: slot).frame(width: cell)
            }
            Text("\(row.points)")
                .font(TallyFont.display(18))
                .monospacedDigit()
                .frame(width: 44, alignment: .trailing)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(isMe ? Color.flagSoft : Color.clear)
        .accessibilityElement(children: .combine)
    }
}

/**
 One place in one row. The same colour vocabulary as `PickChip` — turf for a win, red for a loss,
 plain while it is still playing — so a person who has learned one has learned the other. A lock is
 a pick that exists and is not yet anybody's business; a dash is a place nobody took.
 */
private struct GridCell: View {
    @Environment(AppModel.self) private var model
    let slot: PickSlot

    var body: some View {
        switch slot {
        case .taken(let pick):
            let team = model.sport.teamOrPlaceholder(pick.team)
            let tone = tone(pick)
            Text(team.display)
                .font(TallyFont.display(12))
                .foregroundStyle(tone.text)
                .strikethrough(pick.outcome == .loss, color: tone.text)
                .frame(width: 38, height: 28)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(tone.fill))
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(tone.border, lineWidth: 2))
                .accessibilityLabel("\(team.nickname), \(said(pick))")
        case .hidden(let rank):
            Image(systemName: "lock.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color.ink2)
                .frame(width: 38, height: 28)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.surface))
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color.ink.opacity(0.25), lineWidth: 2))
                .accessibilityLabel("Hidden pick worth \(Scoring.points(forRank: rank))")
        case .empty(let rank):
            Text("–")
                .sans(12, weight: .bold)
                .foregroundStyle(Color.ink3)
                .frame(width: 38, height: 28)
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color.line, style: StrokeStyle(lineWidth: 2, dash: [4, 3])))
                .accessibilityLabel("No pick worth \(Scoring.points(forRank: rank))")
        }
    }

    private struct Tone { let border: Color; let fill: Color; let text: Color }

    private func tone(_ pick: ScoredPick) -> Tone {
        switch pick.outcome {
        case .win: return Tone(border: .turf, fill: .turfSoft, text: .ink)
        case .loss: return Tone(border: Color.danger.opacity(0.55), fill: .dangerSoft, text: .danger)
        case .tie: return Tone(border: .line, fill: .paper2, text: .ink3)
        case .pending: return Tone(border: Color.ink.opacity(0.25), fill: .surface, text: .ink)
        }
    }

    private func said(_ pick: ScoredPick) -> String {
        switch pick.outcome {
        case .win: return "won \(pick.points) points"
        case .loss: return "got nothing"
        case .tie: return "tied, so no points"
        case .pending: return "still playing, worth \(Scoring.points(forRank: pick.rank)) points"
        }
    }
}

/// List or grid, on the week board. Two glyphs rather than a third segmented control: the
/// line already holds two, and this is a way of looking rather than a different board.
struct BoardLayoutToggle: View {
    @Binding var grid: Bool

    var body: some View {
        HStack(spacing: 2) {
            glyph("list.bullet", label: "List", active: !grid) { grid = false }
            glyph("tablecells", label: "Grid", active: grid) { grid = true }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.paper2))
    }

    private func glyph(_ symbol: String, label: String, active: Bool, act: @escaping () -> Void) -> some View {
        Button {
            guard !active else { return }
            Haptics.tap()
            withAnimation(Motion.fade) { act() }
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(active ? Color.paper : Color.ink2)
                .frame(width: 34, height: 28)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(active ? Color.ink : Color.clear))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}
