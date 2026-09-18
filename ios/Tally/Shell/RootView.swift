import SwiftUI
import TallyKit

/**
 Welcome until this device has a name; after that, the shell of whatever the app is standing in.

 Two shells, chosen here and nowhere else: the pool's tabs, or a golf card's. The home tab that
 both put first is the one control that moves between them (`docs/navigation.md`), and
 `AppModel.context` is what it moves. The pool shell does not know the other exists, and the golf
 shell is only ever drawn behind the Labs switch, for a card that is still on the phone. Toasts
 float over all of it.
 */
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    @Environment(HubModel.self) private var hub
    @Environment(\.scenePhase) private var scenePhase

    /// The card the app is standing in, if the switch is on and the card still exists.
    private var activeCard: ScrambleCard? {
        guard model.golfCards, let id = model.context.cardId else { return nil }
        return golf.card(id)
    }

    var body: some View {
        @Bindable var model = model
        @Bindable var golf = golf
        ZStack(alignment: .top) {
            Color.paper.ignoresSafeArea()
            if model.player == nil || model.showWelcome {
                WelcomeView()
                    .transition(.opacity)
            } else if let card = activeCard {
                GolfShellView(cardId: card.id)
                    .transition(.opacity)
            } else {
                PoolShellView()
                    .transition(.opacity)
            }
            ToastStack()
        }
        .noZoom()
        .animation(.easeInOut(duration: 0.2), value: model.player == nil || model.showWelcome)
        .animation(.easeInOut(duration: 0.2), value: model.context)
        .onChange(of: scenePhase) { _, phase in
            // Back from the background: the week may have moved on, a game may have kicked off.
            if phase == .active {
                Task { await model.refreshBootstrap() }
                // And whether anything was said while the phone was in a pocket.
                Task { await model.refreshMessages(quiet: true) }
                // And what every other pool wants, which is what puts the badge on the home tab
                // before anyone has opened it.
                Task { await hub.refresh(model: model, force: true) }
            }
            // On the way out is the right moment to leave the home screen current: the app has
            // just been used, so everything is fresh, and the widgets are what the next glance
            // lands on. Doing it on every bootstrap poll instead would be three requests every
            // five minutes for a number nobody is looking at yet.
            if phase == .background { model.publishWidgetSnapshot() }
        }
        .sheet(isPresented: $model.showCommissioner) {
            CommissionerView()
        }
        .sheet(isPresented: $model.showLeagueOffice) {
            LeagueOfficeView()
        }
        .sheet(isPresented: $model.showPools) {
            PoolsView()
        }
        .sheet(isPresented: $model.showJoin) {
            JoinPoolSheet()
        }
        .sheet(isPresented: $model.showNotificationSettings) {
            NotificationSettingsSheet()
        }
        // The card sheets live here rather than in the golf shell because "New golf card" is on
        // the home tab, which both shells draw.
        .sheet(isPresented: $golf.showNewCard) {
            CardSetupSheet(editing: nil)
        }
        .sheet(item: $golf.editing) { card in
            CardSetupSheet(editing: card)
        }
        .sheet(item: $golf.sharing) { card in
            ShareCardSheet(card: card)
        }
    }
}

/// The dotted paper the whole site sits on.
struct PaperBackground: View {
    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 18
            var x: CGFloat = 9
            while x < size.width {
                var y: CGFloat = 9
                while y < size.height {
                    context.fill(Path(ellipseIn: CGRect(x: x - 0.75, y: y - 0.75, width: 1.5, height: 1.5)), with: .color(Color.ink.opacity(0.06)))
                    y += step
                }
                x += step
            }
        }
        .background(Color.paper)
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}
