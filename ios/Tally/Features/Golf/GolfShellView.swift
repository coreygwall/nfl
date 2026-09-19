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
        /**
         Take whatever everybody else has played, while this card is on screen.

         Only a shared card does anything here — `refresh` returns immediately for one that has
         never left the phone. It is slow on purpose: a push already answers with the merge, so
         this is only for the case a push cannot cover, which is *this* phone sitting in a cart
         holder while three other people tap. It stops when the shell does, because a timer that
         outlives the screen it belongs to is a timer nobody remembers writing.
         */
        .task(id: cardId) {
            while !Task.isCancelled {
                await golf.refresh(cardId: cardId)
                try? await Task.sleep(for: .seconds(15))
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
                            // Only ever drawn when there is something to say. A permanent "synced"
                            // badge is decoration, and decoration is what makes a warning invisible.
                            if golf.unsynced.contains(cardId) {
                                SyncWarning()
                            }
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

/**
 The card is shared, and the last attempt to say so did not land.

 Worth a line rather than a silent retry: a group that has the link open in three browsers is
 entitled to know that the phone keeping the card has drifted out of signal. The round itself is
 never at risk — every tap is on disk before it is a request — so the wording is about *them*
 rather than about the data.
 */
private struct SyncWarning: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color.ink2)
            Text("Saved here, but the shared card hasn't caught up. It'll send itself when you're back in signal.")
                .sans(12).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: .paper2)
        .padding(.bottom, 10)
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
