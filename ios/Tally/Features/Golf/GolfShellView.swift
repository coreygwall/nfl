import SwiftUI
import TallyKit

/**
 A golf card's frame: the same chip as the pool's, and the card's own tabs under it.

 This is the second shell the root view can draw, and the rule that lets there be two is in
 `docs/navigation.md`: *the chip is global, the tabs are the contest's.* A pool is a season and
 needs Home, Picks, Board; a scramble card is an afternoon and needs the tee you are standing on,
 the tally, and the card. Account is the one tab both have, because it is the person's rather than
 the contest's. Nothing here reaches into the pool's screens, and nothing there reaches in here —
 the chip's menu (`PoolMenu`) is the only shared piece, and it is shared on purpose.
 */
struct GolfShellView: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String

    var body: some View {
        @Bindable var golf = golf
        TabView(selection: $golf.tab) {
            Tab("Round", systemImage: "figure.golf", value: GolfTab.round) {
                GolfScreen(cardId: cardId) { RoundView(cardId: cardId) }
            }
            Tab("Tally", systemImage: "trophy.fill", value: GolfTab.tally) {
                GolfScreen(cardId: cardId) { TallyView(cardId: cardId) }
            }
            Tab("Scorecard", systemImage: "tablecells", value: GolfTab.scorecard) {
                GolfScreen(cardId: cardId) { ScorecardView(cardId: cardId) }
            }
            Tab("Account", systemImage: "person.crop.circle.fill", value: GolfTab.account) {
                GolfScreen(cardId: cardId) { AccountView(inPool: false) }
            }
        }
    }
}

/// One tab's page: the paper, the scrolling content, the chip and the card's menu in the bar.
struct GolfScreen<Content: View>: View {
    let cardId: String
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        content
                            .padding(.horizontal, 16)
                            .padding(.top, 6)
                            .padding(.bottom, 120)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { CardChip(cardId: cardId) }
                ToolbarItem(placement: .topBarTrailing) { CardMenu(cardId: cardId) }
            }
            .toolbarTitleDisplayMode(.inline)
        }
    }
}

/// The card you are in, top-left of every tab, opening the same menu the pool chip opens.
struct CardChip: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String

    var body: some View {
        let name = golf.card(cardId)?.name ?? "Golf"
        PoolMenu {
            HStack(spacing: 6) {
                Image("TallyMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 22, height: 22)
                Text(name)
                    .font(TallyFont.display(15, weight: .bold))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .black))
                    .foregroundStyle(Color.ink3)
            }
            .frame(maxWidth: 150)
        }
        .accessibilityLabel("\(name). Switch pool or card")
    }
}

/// What can be done to the card itself: change it, start another, or throw it away.
struct CardMenu: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    let cardId: String
    @State private var confirmDelete = false

    var body: some View {
        Menu {
            Button { golf.editing = golf.card(cardId) } label: {
                Label("Names, pars and the card", systemImage: "pencil")
            }
            Button { golf.showNewCard = true } label: {
                Label("New golf card", systemImage: "plus.circle")
            }
            Divider()
            Button(role: .destructive) { confirmDelete = true } label: {
                Label("Delete this card", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.ink)
        }
        .accessibilityLabel("This card")
        .confirmationDialog("Delete this card?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete the card", role: .destructive) {
                golf.delete(cardId)
                model.leaveCard()
            }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("Every hole on it goes with it. There is no undo.")
        }
    }
}
