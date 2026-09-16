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
 */
struct EntryPicker: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if model.entries.count > 1 {
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
}
