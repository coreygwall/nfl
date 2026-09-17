import SwiftUI
import TallyKit

/**
 Tally for iOS. The app is a native front for the same Worker the website talks to: same pool,
 same picks, same board, same account — a passkey made in Safari signs in here and vice versa.

 The shape is built for what comes next. `TallyKit` knows about pools (many, on a host), pool
 types (High Five today; Survivor and the rest are content entries waiting for a pick screen)
 and sports (the NFL supplies the teams; a second sport is a second `Sport`). Screens read all of
 that through `AppModel`, which owns exactly one pool at a time.
 */
@main
struct TallyApp: App {
    @State private var model: AppModel
    /// The golf cards. Separate from `AppModel` because a card has no session, no bootstrap and no
    /// week — see `GolfModel`. It is here rather than inside the app model so the pool's object
    /// never has to know the other family exists.
    @State private var golf: GolfModel
    /// Every pool on the phone at once, for the home tab. Separate for the same reason: the app
    /// model is one pool, and this is all of them.
    @State private var hub: HubModel
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    init() {
        FontRegistrar.registerBundledFonts()
        _model = State(initialValue: AppModel())
        _golf = State(initialValue: GolfModel())
        _hub = State(initialValue: HubModel())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(golf)
                .environment(hub)
                .tint(.ink)
                // The whole app, in one place. Every colour in Theme.swift resolves against the
                // trait collection, so this one modifier re-lights every screen.
                .preferredColorScheme(model.theme.scheme)
                // A golf card's lock screen carries its own kind of link — `AppModel.open` is
                // built entirely around pool links (`PoolRef.parse`) and would force `.pool`
                // context on anything, so a round's URL is caught here, before that, by the one
                // place that holds both models.
                .onOpenURL { url in
                    if let cardId = RoundActivityAttributes.cardId(in: url) {
                        golf.tab = .round
                        model.switchToCard(cardId)
                    } else {
                        model.open(url)
                    }
                }
                // A notification tapped while the app was shut arrives before any view exists, so
                // the path waits on the service and is picked up here instead of being lost.
                .onChange(of: model.push.pendingPath) { _, _ in model.consumeNotificationTap() }
                .task { model.consumeNotificationTap() }
        }
    }
}
