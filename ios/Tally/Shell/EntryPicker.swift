import SwiftUI
import TallyKit

/**
 Who you are picking as, in the two places it changes anything.

 This used to be a chip in every navigation bar, next to the megaphone, which made the megaphone
 look like part of it and put a "who am I" control on screens where the answer did nothing — Home
 already shows every entry, and Account manages them. It is now a row of names above the picks and
 above the board: tap a name and the picks underneath are theirs, the highlighted row on the board
 is theirs. Drawn only when there is more than one name, because a person with one entry has
 nothing to choose and would only be told their own name.

 **Two shapes, by how many names there are.** Up to `chipLimit`, a row of chips: every name is one
 tap and the active one is obvious. Past that it is one control — the current name and a menu —
 because a scrolling row of twelve chips hides most of them off the right edge, and at that count
 nobody is scanning for a name anyway; they are looking for *theirs*.
 */
struct EntryPicker: View {
    @Environment(AppModel.self) private var model

    /// Chips up to here, a menu past it. The web draws the same line (`CHIP_LIMIT`).
    static let chipLimit = 3

    var body: some View {
        if model.entries.count > Self.chipLimit {
            menu
        } else if model.entries.count > 1 {
            chips
        }
    }

    private var menu: some View {
        HStack(spacing: 8) {
            Text("PICKING AS")
                .font(TallyFont.display(11)).tracking(1.2)
                .foregroundStyle(Color.ink3)
            Menu {
                ForEach(model.entries) { p in
                    Button {
                        guard p.id != model.player?.id else { return }
                        Haptics.tap()
                        model.switchTo(p.id)
                    } label: {
                        if p.id == model.player?.id {
                            Label(p.name, systemImage: "checkmark")
                        } else {
                            Text(p.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(model.player?.name ?? "—")
                        .font(TallyFont.display(13, weight: .bold))
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(Color.paper)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(Color.ink))
                .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            }
            .accessibilityLabel("Picking as \(model.player?.name ?? "nobody"). Change")
            Text("\(model.entries.count) entries")
                .sans(12).foregroundStyle(Color.ink3)
            Spacer(minLength: 0)
        }
        .padding(2)
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(model.entries) { p in
                    let active = p.id == model.player?.id
                    Button {
                        guard !active else { return }
                        Haptics.tap()
                        model.switchTo(p.id)
                    } label: {
                        Text(p.name)
                            .font(TallyFont.display(13, weight: .bold))
                            .foregroundStyle(active ? Color.paper : Color.ink)
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(active ? Color.ink : Color.surface))
                            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Pick as \(p.name)")
                    .accessibilityAddTraits(active ? .isSelected : [])
                }
            }
            // Room for the border, which a scroll view would otherwise shave off.
            .padding(2)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Picking as")
    }
}
