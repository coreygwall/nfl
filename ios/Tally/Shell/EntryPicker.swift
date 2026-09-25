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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var standings = false

    var body: some View {
        if model.entries.count > 1 {
            VStack(alignment: .leading, spacing: 6) {
                Text(standings ? "Highlight entry" : "Picking for")
                    .sans(12, weight: .bold).foregroundStyle(Color.ink2)
                ScrollViewReader { proxy in
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
                                        .frame(minHeight: 44)
                                        .background(Capsule().fill(active ? Color.ink : Color.surface))
                                        .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                                }
                                .buttonStyle(.plain)
                                .id(p.id)
                                .accessibilityLabel(standings ? "Highlight \(p.name)" : "Pick as \(p.name)")
                                .accessibilityAddTraits(active ? .isSelected : [])
                            }
                        }
                        // Room for the border, which a scroll view would otherwise shave off.
                        .padding(2)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(standings ? "Highlighted entry" : "Picking for")
                    .onAppear { proxy.scrollTo(model.player?.id, anchor: .center) }
                    .onChange(of: model.player?.id) { _, id in
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                            proxy.scrollTo(id, anchor: .center)
                        }
                    }
                }
            }
        }
    }
}
