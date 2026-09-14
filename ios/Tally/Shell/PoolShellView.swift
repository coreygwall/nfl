import SwiftUI
import TallyKit

/**
 The pool's frame: four tabs on Liquid Glass, and a header that no longer repeats itself.

 The full lockup — the mark over "Tally" over the pool's name — used to sit at the top of every
 tab's scroll content, which meant scrolling the board pushed the brand off screen and coming back
 to Picks put it up again, in the middle of the page, for no reason. It is a cover, and a cover
 belongs on the front: Home wears it, and every other tab carries the mark and the pool's name as a
 compact control in the navigation bar, where it is always visible, always says which pool you are
 in, and opens the switcher. The brand is more present than it was, not less — it just stopped
 being a block of content.
 */
struct PoolShellView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) {
                PoolScreen(week: nil, onWeek: { _ in }, wearsLockup: true) {
                    HomeView()
                }
            }
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
            Tab("Account", systemImage: "person.crop.circle.fill", value: AppTab.account) {
                PoolScreen(week: nil, onWeek: { _ in }) {
                    AccountView()
                }
            }
        }
        .sheet(isPresented: $model.showEntrySwitcher) {
            EntrySwitcherSheet()
        }
        .sheet(isPresented: $model.showRules) {
            RulesSheet()
        }
    }
}

/// One tab's page: the paper, the scrolling content, and the shared header in the toolbar.
struct PoolScreen<Content: View>: View {
    @Environment(AppModel.self) private var model
    let week: Int?
    let onWeek: (Int) -> Void
    /// Home only. Everywhere else the brand is the mark in the navigation bar.
    var wearsLockup = false
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        if !model.online { OfflineBanner() }
                        if wearsLockup {
                            Button { model.showPools = true } label: {
                                Lockup(poolName: model.poolName, switchable: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.cardPress)
                            .accessibilityLabel("\(model.poolName). Switch pool")
                            .padding(.horizontal, 16)
                            .padding(.top, 10)
                        }
                        content
                            .padding(.horizontal, 16)
                            .padding(.top, wearsLockup ? 14 : 6)
                            .padding(.bottom, 120)
                    }
                }
            }
            .toolbar {
                if !wearsLockup {
                    ToolbarItem(placement: .topBarLeading) { PoolChip() }
                }
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

/**
 The pool you are in, small enough to live in a navigation bar on every screen.

 It is the switcher as well as the label, which is the point: the one control that says *where am
 I* is the same one that changes it, and it is the left-hand counterpart to the entry chip on the
 right — where am I, and who am I.
 */
struct PoolChip: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Button { model.showPools = true } label: {
            HStack(spacing: 6) {
                Image("TallyMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 22, height: 22)
                Text(model.poolName)
                    .font(TallyFont.display(15, weight: .bold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .black))
                    .foregroundStyle(Color.ink3)
            }
            .frame(maxWidth: 150)
        }
        .accessibilityLabel("\(model.poolName). Switch pool")
    }
}

/// "Tally" over the pool's name in small caps — the same lockup as the site header.
struct Lockup: View {
    let poolName: String
    /// Draws the chevron that says this is a control. False wherever it is only a wordmark.
    var switchable = false

    var body: some View {
        HStack(spacing: 8) {
            Image("TallyMark")
                .resizable()
                .scaledToFit()
                .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("Tally").font(TallyFont.display(21)).foregroundStyle(Color.ink)
                HStack(spacing: 3) {
                    Text(poolName.uppercased()).font(TallyFont.sans(9, weight: .bold)).tracking(1.4).foregroundStyle(Color.ink2).lineLimit(1)
                    if switchable {
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 7, weight: .black))
                            .foregroundStyle(Color.ink3)
                    }
                }
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
