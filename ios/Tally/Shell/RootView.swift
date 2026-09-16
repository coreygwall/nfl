import SwiftUI
import TallyKit

/// Welcome until this device has a name; the pool after that. Toasts float over both.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var model = model
        ZStack(alignment: .top) {
            Color.paper.ignoresSafeArea()
            if model.player == nil || model.showWelcome {
                WelcomeView()
                    .transition(.opacity)
            } else {
                PoolShellView()
                    .transition(.opacity)
            }
            ToastStack()
        }
        .noZoom()
        .animation(.easeInOut(duration: 0.2), value: model.player == nil || model.showWelcome)
        .onChange(of: scenePhase) { _, phase in
            // Back from the background: the week may have moved on, a game may have kicked off.
            if phase == .active {
                Task { await model.refreshBootstrap() }
                // And whether anything was said while the phone was in a pocket.
                Task { await model.refreshMessages(quiet: true) }
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
