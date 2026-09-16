import SwiftUI
import TallyKit

/**
 The pool's frame: four tabs on Liquid Glass, and one control that says which pool you are in.

 Three things used to claim that job — the lockup on Home, the pool cards under it, and a chip on
 the other tabs — and none of them looked like a switcher, so a phone with two pools felt like an
 app with four single-pool tabs and a mystery. Now there is one: the pool chip, top-left on every
 tab, and it is a native menu. Tap it and the pools are listed with a tick against the one you are
 standing in; tap another and the whole app moves there, on the tab you were already on. Home wears
 the fuller lockup in that same spot because it is the cover; everywhere else it is the compact
 chip. Either way it is the same menu in the same place.

 The right-hand side of the bar is the megaphone, and on Picks and Board the week. Who you are
 picking as is no longer up here: it is a row of names above the picks and above the board (see
 `EntryPicker`), which are the two places the answer changes anything.
 */
struct PoolShellView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) {
                PoolScreen(week: nil, onWeek: { _ in }, home: true) {
                    HomeView()
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
    /// Home wears the full lockup in the bar; everywhere else it is the compact chip.
    var home = false
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
                ToolbarItem(placement: .topBarLeading) { PoolChip(full: home) }
                if model.announcementsAvailable {
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

/**
 The pool you are in, in the navigation bar of every tab, and the menu that changes it.

 Where am I and how do I go somewhere else are the same control on purpose: the one thing on
 screen that names the pool is the one thing you tap to leave it. A native menu rather than a
 sheet because a switch should look like a switch — a short list with a tick — and because it
 costs one tap to see and one to change, over whatever you were doing. Joining, starting and the
 catalogue of what Tally plays are a different job and live on their own sheet, behind the last
 item.
 */
struct PoolChip: View {
    @Environment(AppModel.self) private var model
    /// The full lockup — the mark, "Tally", and the pool in small caps — rather than the chip.
    var full = false

    var body: some View {
        PoolMenu {
            HStack(spacing: full ? 8 : 6) {
                Image("TallyMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: full ? 28 : 22, height: full ? 28 : 22)
                if full {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Tally").font(TallyFont.display(17)).foregroundStyle(Color.ink)
                        HStack(spacing: 3) {
                            Text(model.poolName.uppercased())
                                .font(TallyFont.sans(8, weight: .bold)).tracking(1.2)
                                .foregroundStyle(Color.ink2).lineLimit(1)
                            chevron
                        }
                    }
                } else {
                    Text(model.poolName)
                        .font(TallyFont.display(15, weight: .bold))
                        .foregroundStyle(Color.ink)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    chevron
                }
            }
            .frame(maxWidth: full ? 190 : 150)
        }
        .accessibilityLabel("\(model.poolName). Switch pool")
    }

    private var chevron: some View {
        Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: full ? 7 : 9, weight: .black))
            .foregroundStyle(Color.ink3)
    }
}

/**
 The menu itself, around whatever label opens it — the pool chip, or a golf card's.

 One list of everywhere the app can stand, ticked where it is standing. Pools first; then, only
 once the Labs switch is on, the golf cards under their own heading and a way to start one. From
 inside a card no pool is ticked and the card is, which is the whole reason the pool picker's
 selection is optional. Nothing else about the pool half changed.
 */
struct PoolMenu<Label: View>: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    @ViewBuilder let label: Label

    /// Ticked only while standing in the pool. Choosing one — even the pool already held — is a
    /// way out of a card, which `switchPool` knows.
    private var poolSelection: Binding<PoolRef?> {
        Binding(get: { model.context == .pool ? model.pool : nil }, set: { ref in
            guard let ref else { return }
            Haptics.tap()
            model.switchPool(ref)
        })
    }

    private var cardSelection: Binding<String?> {
        Binding(get: { model.context.cardId }, set: { id in
            guard let id else { return }
            Haptics.tap()
            // Card to card keeps the tab, like pool to pool. Pool to card lands on the tee.
            if model.context == .pool { golf.tab = .round }
            model.switchToCard(id)
        })
    }

    /// A picker inside a menu is how iOS draws "one of these, ticked" — the same shape as the
    /// mailbox list in Mail or the folder list in Notes.
    private var pools: some View {
        Picker("Pool", selection: poolSelection) {
            ForEach(model.catalog.pools) { pool in
                Text(pool.name).tag(Optional(pool.ref))
            }
        }
        .pickerStyle(.inline)
    }

    var body: some View {
        Menu {
            if model.golfCards {
                Section("Pools") { pools }
                Section("Golf") {
                    Picker("Card", selection: cardSelection) {
                        ForEach(golf.cards) { card in
                            Text(card.name).tag(Optional(card.id))
                        }
                    }
                    .pickerStyle(.inline)
                    Button { golf.showNewCard = true } label: {
                        SwiftUI.Label("New golf card", systemImage: "plus.circle")
                    }
                }
            } else {
                pools
            }
            Divider()
            Button { model.showPools = true } label: {
                SwiftUI.Label("Join or start a pool", systemImage: "plus.circle")
            }
            if model.catalog.pools.count > 1 {
                Menu {
                    ForEach(model.catalog.pools) { pool in
                        Button(role: .destructive) { model.removePool(pool.id) } label: { Text(pool.name) }
                    }
                } label: {
                    SwiftUI.Label("Remove from this phone", systemImage: "minus.circle")
                }
            }
        } label: {
            label
        }
        .menuOrder(.fixed)
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
