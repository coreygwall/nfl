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

    init() {
        FontRegistrar.registerBundledFonts()
        _model = State(initialValue: AppModel())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(.ink)
                .onOpenURL { url in model.open(url) }
        }
    }
}
