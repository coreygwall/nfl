import SwiftUI
import TallyKit

/**
 A golf card's frame: the app's home first, then the card's own tabs.

 This is the second shell the root view can draw, and the rule that lets there be two is in
 `docs/navigation.md`: *the first tab is everywhere you can stand, the rest are the contest's.* A
 pool is a season and needs its page, Picks, Board; a scramble card is an afternoon and needs the
 tee you are standing on, the tally, and the card. Home and Account are the two tabs both have —
 the first because it is the app's, the last because it is the person's. Nothing here reaches into
 the pool's screens, and nothing there reaches in here; `HubView` and `AccountView` are the shared
 pieces, and they are shared on purpose.
 */
struct GolfShellView: View {
    @Environment(GolfModel.self) private var golf
    @Environment(HubModel.self) private var hub
    let cardId: String

    var body: some View {
        @Bindable var golf = golf
        TabView(selection: $golf.tab) {
            Tab("Home", systemImage: "house.fill", value: GolfTab.home) {
                GolfScreen(cardId: cardId, hub: true) { HubView() }
            }
            .badge(hub.needsYou > 0 ? Text("\(hub.needsYou)") : nil)
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

/// One tab's page: the paper, the header naming the card, the scrolling content, and the card's
/// menu in the bar.
struct GolfScreen<Content: View>: View {
    @Environment(GolfModel.self) private var golf
    let cardId: String
    /// The app's home is headed "Tally" and wears none of this card's controls.
    var hub = false
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        if hub {
                            ScreenHeader(mark: "TallyMark", title: "Tally")
                        } else {
                            ScreenHeader(mark: "GolfMark", title: golf.card(cardId)?.name ?? "Golf")
                        }
                        content
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 6)
                    .padding(.bottom, 120)
                }
            }
            .toolbar {
                if !hub {
                    ToolbarItem(placement: .topBarTrailing) { CardMenu(cardId: cardId) }
                }
            }
            .toolbarTitleDisplayMode(.inline)
        }
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
            Button { golf.sharing = golf.card(cardId) } label: {
                Label("Share the card", systemImage: "square.and.arrow.up")
            }
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
