import SwiftUI
import TallyKit

/**
 The pool's frame: five tabs on Liquid Glass, the first of them the app's rather than the pool's.

 Home is every pool and card on the phone (`HubView`), and it is the switcher — it used to be a
 menu behind the chip in the navigation bar, which could list names and nothing else. Pool is
 this pool's own page. The chip top-left of the other tabs still says which pool you are in; it
 just no longer opens anything, because where you are and where else you could be are different
 questions now, and the second one has a tab.

 The right-hand side of the bar is the megaphone, and on Picks and Board the week. Who you are
 picking as is not up here: it is a row of names above the picks and above the board (see
 `EntryPicker`), which are the two places the answer changes anything.
 */
struct PoolShellView: View {
    @Environment(AppModel.self) private var model
    @Environment(HubModel.self) private var hub

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) {
                PoolScreen(week: nil, onWeek: { _ in }, hub: true) {
                    HubView()
                }
            }
            .badge(hub.needsYou > 0 ? Text("\(hub.needsYou)") : nil)
            Tab("Pool", systemImage: "newspaper.fill", value: AppTab.pool) {
                PoolScreen(week: nil, onWeek: { _ in }) {
                    // Keyed on the pool so a switch while this tab is up starts the page over.
                    // Its boards are per-pool state, and a page that kept them would draw the
                    // last pool's picks and standings under the next pool's name until the new
                    // requests landed — indistinguishable when both are on the same week.
                    HomeView()
                        .id("\(model.pool.host)/\(model.pool.slug)")
                }
            }
            Tab("Picks", systemImage: "football.fill", value: AppTab.picks) {
                PoolScreen(week: model.activePickWeek, onWeek: { model.pickWeek = $0 }) {
                    VStack(alignment: .leading, spacing: 14) {
                        EntryPicker()
                        PickFlowView(week: model.activePickWeek)
                            .id("\(model.player?.id ?? "-"):\(model.activePickWeek)")
                    }
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
                    VStack(alignment: .leading, spacing: 14) {
                        EntryPicker()
                        BoardView()
                    }
                }
            }
            Tab("Account", systemImage: "person.crop.circle.fill", value: AppTab.account) {
                PoolScreen(week: nil, onWeek: { _ in }) {
                    AccountView()
                }
            }
        }
        .sheet(isPresented: $model.showRules) {
            RulesSheet()
        }
        .sheet(isPresented: $model.showAnnouncementsSheet) {
            AnnouncementPeekSheet()
        }
        .sheet(isPresented: $model.showAnnouncementsFeed) {
            AnnouncementsFeedSheet()
        }
        // The badge belongs to the frame, not to any one tab: it has to be right on Picks and
        // Board too, so the feed is fetched once here rather than by whichever screen needs it.
        // Keyed on who is signed in as well as which pool, because whether you may like a post or
        // post one at all is an answer about the account, and it arrives with the feed.
        .task(id: "\(model.pool.host)/\(model.pool.slug)#\(model.player?.id ?? "-")") {
            await model.refreshMessages()
        }
    }
}

/// One tab's page: the paper, the scrolling content, and the shared header in the toolbar.
struct PoolScreen<Content: View>: View {
    @Environment(AppModel.self) private var model
    let week: Int?
    let onWeek: (Int) -> Void
    /// The app's home wears the Tally lockup and none of the pool's controls: the megaphone is
    /// this pool's feed, and a page about every pool cannot honestly carry one pool's megaphone.
    var hub = false
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        if !model.online { OfflineBanner() }
                        content
                            .padding(.horizontal, 16)
                            .padding(.top, 6)
                            .padding(.bottom, 120)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if hub { TallyLockup() } else { PoolChip() }
                }
                if !hub && model.announcementsAvailable {
                    ToolbarItem(placement: .topBarTrailing) { MegaphoneButton() }
                }
                if let week {
                    ToolbarItem(placement: .topBarTrailing) {
                        WeekMenu(week: week, max: model.maxWeek, onChange: onWeek)
                    }
                }
            }
            .toolbarTitleDisplayMode(.inline)
        }
    }
}

/// The mark and the name, for the one tab that is about the whole app rather than one pool.
struct TallyLockup: View {
    var body: some View {
        HStack(spacing: 8) {
            Image("TallyMark")
                .resizable()
                .scaledToFit()
                .frame(width: 28, height: 28)
            Text("Tally").font(TallyFont.display(17)).foregroundStyle(Color.ink)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tally")
    }
}

/**
 The pool you are in, in the navigation bar of every one of its tabs.

 A label, and only a label. It was a menu — the switcher — until the home tab took that job, and a
 chip that still opened a list of pools would be a second switcher two taps from the first. What
 it says is the one thing the other tabs cannot say for themselves: which pool this board, these
 picks, belong to.
 */
struct PoolChip: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 6) {
            Image("TallyMark")
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
            Text(model.poolName)
                .font(TallyFont.display(15, weight: .bold))
                .foregroundStyle(Color.ink)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .frame(maxWidth: 170)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("In \(model.poolName)")
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
