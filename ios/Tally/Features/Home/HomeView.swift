import SwiftUI
import TallyKit

/**
 Home: which pools you are in, and what each of them wants from you.

 It exists because "which pool am I in" stopped being a rhetorical question. With one pool the
 answer was the whole app, so the app *was* the pool and the question never came up. With two it is
 the first thing you need to know on opening the app, and no other screen can tell you — Picks and
 Board are already inside a pool by the time you get to them.

 The rule it is built to: **the pool you are in is never more than a glance away.** At one pool this
 screen is one card that says what week it is, whether your picks are in, and where you stand — so
 it earns its tab today rather than becoming useful later. At five it is the same card, five times.
 */
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var week: Loadable<WeekBoardResponse> = .idle
    @State private var season: Loadable<SeasonBoardResponse> = .idle
    /// The last week with every result in — usually not the week being picked, so its own request.
    @State private var completed: Loadable<WeekBoardResponse> = .idle

    private var boot: BootstrapResponse? { model.boot.value }
    private var completedWeek: Int? { PoolHome.latestCompletedWeek(boot?.weeks ?? []) }
    /// Changes when the pool changes, when bootstrap finally says which week it is, *and* when a
    /// week finishes. That last one is its own trigger rather than a consequence of the first:
    /// bootstrap re-polls every five minutes, and the last result of a week routinely lands after
    /// the pick week has already rolled over — a Monday night game settling on Tuesday. Keyed on
    /// the pick week alone, that poll would advance this card's heading and links to the newly
    /// finished week while the rows underneath stayed on the week before.
    private var loadKey: String {
        "\(model.pool.host)/\(model.pool.slug)#\(boot?.currentWeek ?? 0)#\(completedWeek ?? 0)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            poolsSection
            exploreSection
            joinSection
            moreSection
        }
        // One pass on arrival rather than a poll: nothing here changes between a tap and a glance,
        // and the board tab is where a live week belongs. What the key is made of, and why each
        // part of it has to be in there, is on `loadKey`.
        .task(id: loadKey) { await load() }
    }

    // MARK: Your pools

    private var poolsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: model.catalog.pools.count > 1 ? "Your pools" : "Your pool")
            ForEach(model.catalog.pools) { pool in
                if pool.ref == model.pool {
                    ActivePoolCard(pool: pool, week: week.value, season: season.value, failed: week.error != nil)
                } else {
                    OtherPoolCard(pool: pool)
                }
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
            LatestWeekCard(completedWeek: completedWeek, board: completed, pastWeeks: pastWeeks)
            SeasonPreviewCard(season: season)
        }
    }

    /// Finished weeks other than the one already on show, newest first: the card features one and
    /// offers the rest, rather than listing the featured week twice.
    private var pastWeeks: [Int] {
        (boot?.weeks ?? [])
            .filter { $0.gameCount > 0 && $0.finalCount == $0.gameCount && $0.week != completedWeek }
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
        let done = PoolHome.latestCompletedWeek(boot.weeks)
        if done != nil, completed.value == nil { completed = .loading }
        async let w = model.service.weekBoard(boot.currentWeek)
        async let s = model.service.seasonBoard()
        do { week = .loaded(try await w) } catch { week = .failed(error.asAPIError) }
        do { season = .loaded(try await s) } catch { season = .failed(error.asAPIError) }

        // In the hours between the last game of a week landing and the pick week rolling over,
        // the finished week *is* the current one, and the board just fetched is already it.
        guard let done else { completed = .idle; return }
        if done == boot.currentWeek {
            completed = week
        } else {
            do { completed = .loaded(try await model.service.weekBoard(done)) } catch { completed = .failed(error.asAPIError) }
        }
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
    private var entries: [Identity] { model.people }

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
            // Only information when there is somewhere else to be.
            if model.catalog.pools.count > 1 { Chip(text: "open", fill: .flag, size: 10) }
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
                } else {
                    Text(owingText).sans(14, weight: .semibold)
                    Button("Make \(owing.count == 1 && entries.count > 1 ? "\(owing[0].name)'s" : "your") picks") {
                        if let first = owing.first, first.id != model.player?.id { model.switchTo(first.id) }
                        model.tab = .picks
                    }
                    .buttonStyle(.tally(.primary, size: .small))
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

/// A pool this phone knows about but is not currently inside. Its board lives behind its own
/// sign-in, so there is nothing honest to show beyond its name until you open it.
private struct OtherPoolCard: View {
    @Environment(AppModel.self) private var model
    let pool: PoolMembership

    var body: some View {
        Button {
            model.switchPool(pool.ref)
            model.tab = .home
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pool.name).font(TallyFont.display(17))
                    Text("\(pool.poolType) · \(pool.ref.host)").sans(12).foregroundStyle(Color.ink2)
                }
                Spacer()
                Text("Open").sans(12, weight: .bold).foregroundStyle(Color.ink2)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink3)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.cardPress)
        .cardFlat()
    }
}

/**
 Who took the last week that actually finished.

 "Finished" is doing real work in that sentence: a week with one game still running has a top three
 that can change, and a `Final` chip over a table that is going to move is a small lie. So this
 shows the last week with every result in, which during a Sunday afternoon means last week rather
 than this one — the live week is the board tab's job, and it says so itself.
 */
private struct LatestWeekCard: View {
    @Environment(AppModel.self) private var model
    let completedWeek: Int?
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
                Text("Latest weekly winner")
                    .sans(11, weight: .bold).tracking(0.8).foregroundStyle(Color.ink3)
                Text(completedWeek.map { "Week \($0) results" } ?? "Weekly standings").display(19)
            }
            Spacer()
            if completedWeek != nil { Chip(text: "Final", fill: .turfSoft, size: 10) }
        }
    }

    @ViewBuilder private var content: some View {
        if let completedWeek {
            if board.error != nil {
                Text("Couldn't load the latest results.").sans(13).foregroundStyle(Color.ink2)
            // The response says which week it is, so it can only ever draw under that week's
            // heading. Re-keying the load above is what fetches the new week; this is what stops
            // the old rows showing under the new title in the seconds before it lands.
            } else if let loaded = board.value, loaded.week == completedWeek {
                rows(loaded, week: completedWeek)
                Button("See the full Week \(completedWeek) leaderboard") { openBoard(week: completedWeek) }
                    .buttonStyle(.tally(.plain, size: .small, fullWidth: true))
            } else {
                BoardSkeleton(rows: 3)
            }
        } else {
            // Week 1 is not over yet, so there is no winner to name. Saying where the first one
            // will appear is more use than an empty card, and the live week is still one tap away.
            Text("The first top three will appear here when Week 1 is final.")
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
                        WeekBars(row: row, throughWeek: season.throughWeek) { week in
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
