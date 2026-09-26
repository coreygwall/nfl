import SwiftUI
import TallyKit

/**
 The pool's own page: the pool you are standing in, and what it wants from you.

 It is the Pool tab, second in the bar, and it is about *this* pool only: what week it is, whose
 picks are missing, where you stand, who took last week, who leads the season. The other pools are
 not here — they were a strip of one-liners under the card once, which was the cross-pool fact
 worth having while there was no cross-pool screen. There is one now (`HubView`, the Home tab),
 and it says everything that strip did and more, so the strip would be a second, thinner copy.
 */
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var week: Loadable<WeekBoardResponse> = .idle
    @State private var season: Loadable<SeasonBoardResponse> = .idle
    /// The week the card previews — usually the one being picked, sometimes last week, so it
    /// gets its own request. See `PoolHome.previewWeek`.
    @State private var completed: Loadable<WeekBoardResponse> = .idle

    private var boot: BootstrapResponse? { model.boot.value }
    private var preview: PoolHome.PreviewWeek? { PoolHome.previewWeek(boot?.weeks ?? []) }
    /// Changes when the pool changes, when bootstrap finally says which week it is, *and* when
    /// the previewed week changes — either because a new week kicked off or because the one on
    /// show settled. Those last two are their own trigger rather than a consequence of the first:
    /// bootstrap re-polls every five minutes, and a week's last result routinely lands after the
    /// pick week has already rolled over — a Monday night game settling on Tuesday. Keyed on the
    /// pick week alone, that poll would advance this card's heading and links while the rows
    /// underneath stayed on the week before.
    private var loadKey: String {
        "\(model.pool.host)/\(model.pool.slug)#\(boot?.currentWeek ?? 0)#\(preview?.week ?? 0)#\(preview?.final == true)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            poolSection
            exploreSection
            joinSection
            moreSection
        }
        // One pass on arrival rather than a poll: nothing here changes between a tap and a glance,
        // and the board tab is where a live week belongs. What the key is made of, and why each
        // part of it has to be in there, is on `loadKey`.
        .task(id: "\(loadKey)#\(model.refreshTick)") { await load() }
    }

    // MARK: This pool

    private var poolSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if model.poolPager, model.catalog.pools.count > 1 { PoolPager() }
            SectionLabel(text: "This week")
            if let pool = model.catalog.current {
                ActivePoolCard(pool: pool, week: week.value, season: season.value, failed: week.error != nil)
            }
        }
    }

    // MARK: Explore the pool

    /**
     The pool should be worth opening before anyone has committed a pick.

     Home used to say what the pool wanted *from you* and stop there, which leaves a member who has
     already picked — or who never picks, and only follows — with a screen that has nothing on it.
     These two cards are the pool as a thing to read: who took the last finished week, and who is
     ahead over the season. Both are the top three and a way through to the full board, because a
     leaderboard is the kind of thing you check in five seconds or study for a minute, and Home
     should be the five-second version.
     */
    private var exploreSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Explore the pool")
                Spacer()
                Text("No picks required").sans(11).foregroundStyle(Color.ink3)
            }
            LatestWeekCard(preview: preview, board: completed, pastWeeks: pastWeeks)
            SeasonPreviewCard(season: season)
        }
    }

    /// Finished weeks other than the one already on show, newest first: the card features one and
    /// offers the rest, rather than listing the featured week twice.
    private var pastWeeks: [Int] {
        (boot?.weeks ?? [])
            .filter { $0.gameCount > 0 && $0.finalCount == $0.gameCount && $0.week != preview?.week }
            .map(\.week)
            .sorted(by: >)
    }

    // MARK: Join or start

    private var joinSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashedDivider()
            Button { model.showPools = true } label: {
                Label("Join or start a pool", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.tally(.plain, size: .small))
            Text("Paste a link a commissioner sent you, or see what else Tally plays.")
                .sans(12).foregroundStyle(Color.ink2)
        }
    }

    private var moreSection: some View {
        HStack(spacing: 4) {
            LinkButton(title: "How scoring works", color: .ink3) { model.showRules = true }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private func load() async {
        guard let boot else { return }
        if week.value == nil { week = .loading }
        if season.value == nil { season = .loading }
        let done = PoolHome.previewWeek(boot.weeks)?.week
        if done != nil, completed.value == nil { completed = .loading }
        async let w = model.service.weekBoard(boot.currentWeek)
        async let s = model.service.seasonBoard()
        do { week = .loaded(try await w) } catch { week = .failed(error.asAPIError) }
        do { season = .loaded(try await s) } catch { season = .failed(error.asAPIError) }

        // Most of the time the week on show *is* the one being picked — always, once it has
        // kicked off — and the board just fetched is already it.
        guard let done else { completed = .idle; return }
        if done == boot.currentWeek {
            completed = week
        } else {
            do { completed = .loaded(try await model.service.weekBoard(done)) } catch { completed = .failed(error.asAPIError) }
        }
    }
}

/**
 Labs: the pools as pages, at the top of the pool's own page.

 The mark and the name, a dot per pool, and a chevron each side that is live only when there is a
 pool that way. A flick on this row goes the same way; the gesture is contained to the row so it
 cannot fight the horizontal scrollers further down the page. The order is by name rather than
 the catalogue's, because the catalogue sorts by last opened — which would put whichever pool you
 just switched to at the front and shuffle left and right under your thumb.

 The page below reloads rather than slides. A pool is a session and a bootstrap, and the honest
 thing is the skeleton the page already draws while one lands, not a slide into a blank.
 */
private struct PoolPager: View {
    @Environment(AppModel.self) private var model
    @State private var drag: CGFloat = 0

    private var pools: [PoolMembership] {
        model.catalog.pools.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    private var index: Int { pools.firstIndex { $0.ref == model.pool } ?? 0 }
    private var previous: PoolMembership? { index > 0 ? pools[index - 1] : nil }
    private var next: PoolMembership? { index + 1 < pools.count ? pools[index + 1] : nil }

    var body: some View {
        HStack(spacing: 8) {
            arrow("chevron.left", to: previous)
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    Image("FootballMark")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                    Text(model.poolName).display(18).lineLimit(1)
                }
                HStack(spacing: 5) {
                    ForEach(pools) { pool in
                        Circle()
                            .fill(pool.ref == model.pool ? Color.ink : Color.line)
                            .frame(width: 6, height: 6)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .offset(x: drag)
            arrow("chevron.right", to: next)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .cardFlat()
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 20)
                .onChanged { drag = $0.translation.width / 3 }
                .onEnded { value in
                    let target = value.translation.width < -50 ? next : value.translation.width > 50 ? previous : nil
                    withAnimation(Motion.snap) { drag = 0 }
                    if let target { go(target) }
                }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Pool \(index + 1) of \(pools.count), \(model.poolName)")
    }

    private func arrow(_ symbol: String, to pool: PoolMembership?) -> some View {
        Button { if let pool { go(pool) } } label: {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(pool == nil ? Color.line : Color.ink)
                .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .disabled(pool == nil)
        .accessibilityLabel(pool.map { "Switch to \($0.name)" } ?? "No pool this way")
    }

    private func go(_ pool: PoolMembership) {
        Haptics.tap()
        model.switchPool(pool.ref)
    }
}

/**
 The pool this phone is currently inside, with everything Home exists to tell you: what week it is,
 which of your entries still owe picks, and where you are standing.
 */
private struct ActivePoolCard: View {
    @Environment(AppModel.self) private var model
    let pool: PoolMembership
    let week: WeekBoardResponse?
    let season: SeasonBoardResponse?
    /// The board request came back empty-handed, which must never read as "you are done".
    let failed: Bool

    private var boot: BootstrapResponse? { model.boot.value }
    private var entries: [Identity] { model.entries }

    /**
     The board for the week this card is *naming*, and nothing else.

     The heading comes from bootstrap and the picks come from the board, and they arrive on
     different schedules: when the five-minute bootstrap poll rolls the pick week over, the heading
     says Week 4 while the board in hand is still Week 3's. Answering "are your picks in" out of
     that board would tell someone who picked last week and not this one that they are done — the
     one sentence on this screen that can cost them their week, and the same sentence the failure
     branch below already refuses to guess at. So a board only answers for its own week; until the
     right one lands there is a skeleton, which is the honest thing to show.
     */
    private var boardForThisWeek: WeekBoardResponse? {
        guard let week, let boot, week.week == boot.currentWeek else { return nil }
        return week
    }

    /// The entries of mine that have not saved a full five yet, in the order they appear.
    private var owing: [Identity] {
        guard let board = boardForThisWeek else { return [] }
        let made = Dictionary(uniqueKeysWithValues: board.rows.map { ($0.playerId, $0.picksMade) })
        return entries.filter { (made[$0.id] ?? 0) < Scoring.maxPicks }
    }

    private var lockText: String? {
        guard let boot, let summary = boot.weeks.first(where: { $0.week == boot.currentWeek }) else { return nil }
        if summary.lockedCount >= summary.gameCount { return "every game has started" }
        if summary.lockedCount > 0 { return "\(summary.gameCount - summary.lockedCount) still open" }
        return "first game \(Format.kickoff(summary.firstKickoff))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            DashedDivider()
            weekLine
            if let standing { standingLine(standing) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(pool.name).display(20)
                // Most pools are named after the game they play; printing "High Five" under
                // "High Five" under a lockup that already says it is three of the same word.
                if pool.poolType != pool.name {
                    Text(pool.poolType).sans(11, weight: .bold).tracking(1).foregroundStyle(Color.ink2)
                }
            }
            Spacer()
        }
    }

    @ViewBuilder private var weekLine: some View {
        if let boot {
            VStack(alignment: .leading, spacing: 8) {
                Text("Week \(boot.currentWeek)\(lockText.map { " · \($0)" } ?? "")")
                    .sans(13, weight: .semibold).foregroundStyle(Color.ink2)
                if failed {
                    // Silence is the only safe thing to say. "Your picks are in" off a request
                    // that failed is the one sentence here that can cost someone their week.
                    Text("Couldn't check your picks.").sans(14, weight: .semibold).foregroundStyle(Color.ink2)
                } else if boardForThisWeek == nil {
                    SkeletonLine(width: 180)
                } else if owing.isEmpty {
                    Label(entries.count > 1 ? "All \(entries.count) sets of picks are in." : "Your picks are in.", systemImage: "checkmark.circle.fill")
                        .sans(14, weight: .semibold).foregroundStyle(Color.turf)
                    // Somebody who has already picked opens this to ask one question, and it is
                    // not "did I pick". It is "can I still change it", so the answer sits next to
                    // the way to do it rather than in the rules.
                    Button("Review or change your picks") { model.tab = .picks }
                        .buttonStyle(.tally(.plain, size: .small))
                    Text("Each pick stays editable until that game kicks off.")
                        .sans(12).foregroundStyle(Color.ink2)
                } else {
                    Text(owingText).display(19)
                    // What the task actually is. Somebody who plays once a week does not carry
                    // the rules around in their head, and the button alone does not say what it
                    // asks of them or how long it takes.
                    Text("Pick \(Scoring.maxPicks) winners and rank them — your surest call is worth \(Scoring.maxPicks) points, your shakiest 1.")
                        .sans(13).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Make \(owing.count == 1 && entries.count > 1 ? "\(owing[0].name)'s" : "your") picks") {
                        if let first = owing.first, first.id != model.player?.id { model.switchTo(first.id) }
                        model.tab = .picks
                    }
                    .buttonStyle(.tally(.primary, size: .regular, fullWidth: true))
                    Text("Takes a minute, and there's no deadline for the week — each game locks at its own kickoff.")
                        .sans(12).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        } else {
            // Bootstrap has not landed. Which pool this is comes from the catalog on the device, so
            // the card above the rule still stands — but everything below it is a claim about the
            // live week, and a card that just stops reads as broken rather than as loading.
            VStack(alignment: .leading, spacing: 8) {
                if model.boot.error != nil {
                    Text("Couldn't refresh this week.").sans(14, weight: .semibold).foregroundStyle(Color.ink2)
                    Button("Try again") { Task { await model.refreshBootstrap() } }
                        .buttonStyle(.tally(.plain, size: .small))
                } else {
                    SkeletonLine(width: 140)
                    SkeletonLine(width: 190)
                }
            }
        }
    }

    private var owingText: String {
        if entries.count == 1 { return "Your picks aren't in yet." }
        if owing.count == entries.count { return "None of your \(entries.count) entries have picked yet." }
        return "\(Format.list(owing.map(\.name))) still \(owing.count == 1 ? "needs" : "need") picks."
    }

    /// My own row on the season board, which is the number worth putting on a home screen — once
    /// there is a season to have a place in. Before the first counting week everyone is first with
    /// nothing, which is a boast about a race that has not started.
    private var standing: SeasonRow? {
        guard let season, !season.notStarted, let me = model.player?.id else { return nil }
        return season.rows.first { $0.playerId == me }
    }

    private func standingLine(_ row: SeasonRow) -> some View {
        Button {
            model.boardScope = .season
            model.tab = .board
        } label: {
            HStack(spacing: 8) {
                PlaceBadge(place: row.place, crowned: row.place == 1)
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(Format.ordinal(row.place)) of \(season?.rows.count ?? 0) for the season").sans(13, weight: .semibold)
                    Text("\(row.points) pts · best week \(row.bestWeek.map { "\($0.points)" } ?? "—")")
                        .sans(11).foregroundStyle(Color.ink2)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink3)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/**
 Where the week being played stands, or who took the last one if this one has not started.

 It used to show only the last week with *every* result in, out of a fear of putting a `Final`
 chip over a table that is going to move. The chip was the problem, not the week: from Thursday
 night until Sunday afternoon that rule leads with a week nobody is thinking about any more, while
 the game everybody just watched goes unmentioned. So `PoolHome.previewWeek` picks the newest week
 that has kicked off anything, and `final` stays a separate fact — the chip says "In progress"
 until every result is in, which is the honest version of the thing the old rule was protecting.
 */
private struct LatestWeekCard: View {
    @Environment(AppModel.self) private var model
    let preview: PoolHome.PreviewWeek?
    let board: Loadable<WeekBoardResponse>
    let pastWeeks: [Int]
    @State private var open: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            content
            if !pastWeeks.isEmpty { pastWeeksRow }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(preview?.final == true ? "Latest weekly winner" : "This week so far")
                    .sans(11, weight: .bold).tracking(0.8).foregroundStyle(Color.ink3)
                Text(preview.map { "Week \($0.week) \($0.final ? "results" : "standings")" } ?? "Weekly standings")
                    .display(19)
            }
            Spacer()
            if let preview {
                Chip(
                    text: preview.final ? "Final" : "In progress",
                    fill: preview.final ? .turfSoft : .flagSoft,
                    size: 10
                )
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let preview {
            if board.error != nil {
                Text("Couldn't load this week's standings.").sans(13).foregroundStyle(Color.ink2)
            // The response says which week it is, so it can only ever draw under that week's
            // heading. Re-keying the load above is what fetches the new week; this is what stops
            // the old rows showing under the new title in the seconds before it lands.
            } else if let loaded = board.value, loaded.week == preview.week {
                rows(loaded, week: preview.week)
                Button("See the full Week \(preview.week) leaderboard") { openBoard(week: preview.week) }
                    .buttonStyle(.tally(.plain, size: .small, fullWidth: true))
            } else {
                BoardSkeleton(rows: 3)
            }
        } else {
            // Nothing has kicked off yet, so there is no top three to show. Saying where the first
            // one will appear is more use than an empty card, and the board is still one tap away.
            Text("The first top three will appear here once Week 1 kicks off.")
                .sans(13).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Button("Week \(model.boot.value?.boardWeek ?? 1)") { openBoard(week: model.boot.value?.boardWeek ?? 1) }
                .buttonStyle(.tally(.plain, size: .small))
        }
    }

    @ViewBuilder private func rows(_ board: WeekBoardResponse, week: Int) -> some View {
        if board.rows.isEmpty {
            Text("Nobody picked in Week \(week).").sans(13).foregroundStyle(Color.ink2)
        } else {
            ForEach(Array(board.rows.prefix(3).enumerated()), id: \.element.id) { index, row in
                // The week is final, so every pick is revealed and first place is a result rather
                // than a lead — the same two things the board itself uses to crown a row.
                BoardRowCard(
                    place: row.place,
                    name: row.name,
                    isMe: row.playerId == model.player?.id,
                    points: row.points,
                    muted: false,
                    crowned: row.place == 1 && row.picksMade > 0,
                    subtitle: row.picksMade == 0 ? "No picks" : "\(row.correct) of \(row.picksMade) right",
                    open: open == row.playerId,
                    onToggle: { withAnimation(Motion.fade) { open = open == row.playerId ? nil : row.playerId } }
                ) {
                    PickSlotRow(slots: row.pickSlots)
                }
                .dealt(index)
            }
        }
    }

    private var pastWeeksRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            DashedDivider()
            Text("Past weeks").sans(13, weight: .bold)
            // Wrapping rather than a row: by December this is seventeen of them, and a horizontal
            // scroller hides the later weeks behind a gesture nobody knows is there.
            FlowRow(spacing: 6) {
                ForEach(pastWeeks, id: \.self) { week in
                    Button { openBoard(week: week) } label: {
                        Chip(text: "Week \(week)", fill: .paper2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func openBoard(week: Int) {
        model.boardScope = .week
        model.boardWeek = week
        model.tab = .board
    }
}

/// Where the season race stands — or, before it starts, the fact that it has not. Week 1 crowns its
/// own winner and those points do not carry, which is the single most confusing thing about the
/// scoring, so the card says it plainly rather than showing a table of zeroes.
private struct SeasonPreviewCard: View {
    @Environment(AppModel.self) private var model
    let season: Loadable<SeasonBoardResponse>
    @State private var open: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Season race")
                    .sans(11, weight: .bold).tracking(0.8).foregroundStyle(Color.ink3)
                Text("Season standings").display(19)
            }
            content
            Button(buttonTitle) {
                model.boardScope = .season
                model.tab = .board
            }
            .buttonStyle(.tally(.plain, size: .small, fullWidth: true))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    /// Before the season starts the button has to explain itself; after it starts, saying "starts
    /// Week 2" about a race already three weeks old would be nonsense.
    private var buttonTitle: String {
        guard season.value?.notStarted == false else {
            return "Season standings · starts Week \(season.value?.seasonStartsAt ?? model.seasonStartsAt)"
        }
        return "Full season standings"
    }

    @ViewBuilder private var content: some View {
        if season.error != nil {
            Text("Couldn't load the season standings.").sans(13).foregroundStyle(Color.ink2)
        } else if let season = season.value {
            if season.notStarted {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Starts Week \(season.seasonStartsAt)").display(16)
                    Text("Week \(season.seasonStartsAt - 1) crowns its own winner. Season points begin next week.")
                        .sans(13).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .flagSoft)
            } else if season.rows.isEmpty {
                Text("Nobody is on the season board yet.").sans(13).foregroundStyle(Color.ink2)
            } else {
                ForEach(Array(season.rows.prefix(3).enumerated()), id: \.element.id) { index, row in
                    BoardRowCard(
                        place: row.place,
                        name: row.name,
                        isMe: row.playerId == model.player?.id,
                        points: row.points,
                        muted: false,
                        subtitle: subtitle(row),
                        open: open == row.playerId,
                        onToggle: { withAnimation(Motion.fade) { open = open == row.playerId ? nil : row.playerId } }
                    ) {
                        WeekBars(row: row, fromWeek: season.seasonStartsAt, throughWeek: season.throughWeek) { week in
                            model.boardScope = .week
                            model.boardWeek = week
                            model.tab = .board
                        }
                    }
                    .dealt(index)
                }
            }
        } else {
            BoardSkeleton(rows: 3)
        }
    }

    private func subtitle(_ row: SeasonRow) -> String {
        if row.weeksPlayed == 0 { return "No picks yet" }
        var s = "\(row.correct) right · \(row.weeksPlayed) wk\(row.weeksPlayed == 1 ? "" : "s")"
        if let best = row.bestWeek, best.points > 0 { s += " · best \(best.points) (W\(best.week))" }
        return s
    }
}
