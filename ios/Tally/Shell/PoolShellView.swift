import SwiftUI
import TallyKit

/**
 The pool's frame: five tabs on Liquid Glass, the first of them the app's rather than the pool's.

 Home is every pool and card on the phone (`HubView`), and it is the switcher — it used to be a
 menu behind a chip in the navigation bar, which could list names and nothing else. Pool is
 this pool's own page. The header at the top of the other tabs (`ScreenHeader`) says which pool
 you are in and opens nothing, because where you are and where else you could be are different
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
                PoolScreen(week: nil, onWeek: { _ in }, account: true) {
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

/// One tab's page: the paper, the header naming where you are, the scrolling content, and the
/// pool's buttons in the bar.
struct PoolScreen<Content: View>: View {
    @Environment(AppModel.self) private var model
    let week: Int?
    let onWeek: (Int) -> Void
    /// The app's home is headed "Tally" and wears none of the pool's controls: the megaphone is
    /// this pool's feed, and a page about every pool cannot honestly carry one pool's megaphone.
    var hub = false
    var account = false
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        if !model.online { OfflineBanner() }
                        VStack(spacing: 0) {
                            if account {
                                // Account supplies its own title; pool branding and controls belong to pool tabs.
                            } else if hub {
                                ScreenHeader(mark: "TallyMark", title: "Tally")
                            } else {
                                ScreenHeader(mark: "FootballMark", title: model.poolName) {
                                    // The megaphone, then the rules, then the week — on every one
                                    // of the pool's tabs, for the reason they always were: "what
                                    // is the 5 for" arrives in the middle of picking, and an
                                    // answer that costs you your place in the flow is one people
                                    // do without. Never on the app's own home, because the rules
                                    // and the feed are one pool's and that page is about all of
                                    // them.
                                    HStack(spacing: 2) {
                                        if model.announcementsAvailable { MegaphoneButton() }
                                        RulesButton()
                                        if let week {
                                            WeekMenu(week: week, max: model.maxWeek, onChange: onWeek)
                                                .padding(.leading, 4)
                                        }
                                    }
                                }
                            }
                            content
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 120)
                    }
                }
            }
            // Nothing is left up there. The pool's controls sit on the name's line now, and an
            // empty inline bar is forty-odd points of glass saying nothing on every tab.
            .toolbar(.hidden, for: .navigationBar)
        }
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
