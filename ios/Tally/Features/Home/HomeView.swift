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

    private var boot: BootstrapResponse? { model.boot.value }
    /// Changes when the pool changes *or* when bootstrap finally says which week it is.
    private var loadKey: String { "\(model.pool.host)/\(model.pool.slug)#\(boot?.currentWeek ?? 0)" }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            poolsSection
            joinSection
            moreSection
        }
        // One pass on arrival rather than a poll: nothing here changes between a tap and a glance,
        // and the board tab is where a live week belongs. The key has to include the week rather
        // than only the pool, because bootstrap is still idle at the moment the pool changes — on
        // launch and again after a switch — and a task keyed on the pool alone would run once,
        // find no week to ask about, and never run again.
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
        async let w = model.service.weekBoard(boot.currentWeek)
        async let s = model.service.seasonBoard()
        do { week = .loaded(try await w) } catch { week = .failed(error.asAPIError) }
        do { season = .loaded(try await s) } catch { season = .failed(error.asAPIError) }
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

    /// The entries of mine that have not saved a full five yet, in the order they appear.
    private var owing: [Identity] {
        guard let week else { return [] }
        let made = Dictionary(uniqueKeysWithValues: week.rows.map { ($0.playerId, $0.picksMade) })
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
                } else if week == nil {
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
