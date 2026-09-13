import SwiftUI
import TallyKit

/**
 The pool's frame: three tabs on Liquid Glass, and on every tab the same header the web has —
 the Tally lockup on the left, the week picker and the name chip on the right. The tab bar
 tucks away as you scroll a long slate, which is the system's behaviour and exactly what the
 site's bottom nav did by hand.
 */
struct PoolShellView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("Picks", systemImage: "football.fill", value: AppTab.picks) {
                PoolScreen(week: model.activePickWeek, onWeek: { model.pickWeek = $0 }) {
                    PickFlowView(week: model.activePickWeek)
                        .id("\(model.player?.id ?? "-"):\(model.activePickWeek)")
                }
                .safeAreaInset(edge: .bottom) {
                    if let tray = model.tray {
                        PickTrayView(state: tray)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: model.tray == nil)
            }
            Tab("Board", systemImage: "trophy.fill", value: AppTab.board) {
                PoolScreen(week: model.boardScope == .week ? model.activeBoardWeek : nil, onWeek: { model.boardWeek = $0 }) {
                    BoardView()
                }
            }
            Tab("Rules", systemImage: "questionmark.circle.fill", value: AppTab.rules) {
                PoolScreen(week: nil, onWeek: { _ in }) {
                    RulesView()
                }
            }
            Tab("Account", systemImage: "person.crop.circle.fill", value: AppTab.account) {
                PoolScreen(week: nil, onWeek: { _ in }) {
                    AccountView()
                }
            }
        }
        .sheet(isPresented: $model.showEntrySwitcher) {
            EntrySwitcherSheet()
        }
    }
}

/// One tab's page: the paper, the scrolling content, and the shared header in the toolbar.
struct PoolScreen<Content: View>: View {
    @Environment(AppModel.self) private var model
    let week: Int?
    let onWeek: (Int) -> Void
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        if !model.online { OfflineBanner() }
                        Lockup(poolName: model.poolName)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.top, 10)
                        content
                            .padding(.horizontal, 16)
                            .padding(.top, 14)
                            .padding(.bottom, 120)
                    }
                }
            }
            .toolbar {
                if let week {
                    ToolbarItem(placement: .topBarTrailing) {
                        WeekMenu(week: week, max: model.maxWeek, onChange: onWeek)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        model.showEntrySwitcher = true
                    } label: {
                        HStack(spacing: 4) {
                            Text(model.player?.name ?? "Sign in").lineLimit(1).truncationMode(.tail)
                            Image(systemName: "chevron.up.chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.ink2)
                        }
                        .font(TallyFont.display(14, weight: .bold))
                        .frame(maxWidth: 120)
                    }
                    .accessibilityLabel("Switch entry")
                }
            }
            .toolbarTitleDisplayMode(.inline)
        }
    }
}

/// "Tally" over the pool's name in small caps — the same lockup as the site header.
struct Lockup: View {
    let poolName: String

    var body: some View {
        HStack(spacing: 8) {
            Image("TallyMark")
                .resizable()
                .scaledToFit()
                .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("Tally").font(TallyFont.display(21)).foregroundStyle(Color.ink)
                Text(poolName.uppercased()).font(TallyFont.sans(9, weight: .bold)).tracking(1.4).foregroundStyle(Color.ink2).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tally — \(poolName)")
    }
}

/// The week stepper from the header: a menu of every week, the arrows implied by the list.
struct WeekMenu: View {
    let week: Int
    let max: Int
    let onChange: (Int) -> Void

    var body: some View {
        Menu {
            Picker("Week", selection: Binding(get: { week }, set: onChange)) {
                ForEach(1...max, id: \.self) { w in
                    Text("Week \(w)").tag(w)
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text("Week \(week)").font(TallyFont.display(14))
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.ink2)
            }
        }
        .accessibilityLabel("Choose week")
    }
}

struct OfflineBanner: View {
    var body: some View {
        Text("You're offline. You can browse, but picks won't save until you're back.")
            .sans(12, weight: .bold)
            .foregroundStyle(Color.paper)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .padding(.horizontal, 16)
            .background(Color.ink)
    }
}
