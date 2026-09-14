import SwiftUI
import TallyKit

/**
 The league office. Every Tally pool scores the same NFL games, so who won is settled in exactly
 one place — here — rather than by every commissioner typing the same fourteen results into their
 own pool and eventually disagreeing.

 Today that is a person with a feed to pull from. When it is fully automated the screen becomes a
 window onto a job that runs itself; the architecture does not move, because the authority was
 never a pool's to begin with.
 */
struct LeagueOfficeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    enum Section: Hashable { case results, feed }
    @State private var section: Section = .results

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("These apply to every pool on Tally, not just \(model.boot.value?.poolName ?? "this one").")
                            .sans(12).foregroundStyle(Color.ink2)
                            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                            .cardFlat(fill: .paper2)
                        TallySegmented(value: $section, options: [(.results, "Results"), (.feed, "Schedule & feed")])
                        switch section {
                        case .results: LeagueResultsView()
                        case .feed: LeagueFeedView()
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("League office")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

private struct LeagueResultsView: View {
    @Environment(AppModel.self) private var model
    @State private var week: Int?
    @State private var data: Loadable<LeagueWeekResponse> = .idle
    @State private var pulling = false
    @State private var conflicts: [PullConflict] = []

    private var activeWeek: Int { week ?? model.boot.value?.boardWeek ?? 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                WeekMenu(week: activeWeek, max: model.maxWeek, onChange: { week = $0 })
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Capsule().fill(Color.white))
                    .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                Spacer()
                Button(pulling ? "Pulling…" : "Pull final scores") { Task { await pull() } }
                    .buttonStyle(.tally(.plain, size: .small))
                    .disabled(pulling)
            }
            Text("Tap the winner. Tap again to clear. Every pool's board updates instantly. Automatic pulls only fill blanks, so anything set here stands.")
                .sans(12).foregroundStyle(Color.ink2)
            if !conflicts.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("The feed disagrees with \(Format.plural(conflicts.count, "result"))").sans(14, weight: .bold)
                    ForEach(conflicts) { c in
                        Text("\(c.gameId): recorded \(c.recorded), the feed says \(c.feed) (\(c.awayScore)–\(c.homeScore)). Clear that game and pull again to take the feed's version.")
                            .sans(12).foregroundStyle(Color.ink2)
                    }
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .flagSoft, border: .flag)
            }
            switch data {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let res):
                ForEach(res.games) { g in
                    LeagueGameRow(game: g, onSet: { winner in Task { await set(g, winner) } })
                }
            }
        }
        .task(id: activeWeek) { await load() }
    }

    private func load() async {
        if data.value == nil { data = .loading }
        do { data = .loaded(try await model.service.leagueWeek(activeWeek)) } catch { data = .failed(error.asAPIError) }
    }

    private func set(_ g: Game, _ winner: String?) async {
        do {
            _ = try await model.service.setResult(gameId: g.id, winner: winner)
            let text = winner == nil ? "Result cleared" : winner == "TIE" ? "Recorded as a tie" : "\(model.sport.teamOrPlaceholder(winner!).nickname) win recorded"
            model.toast(text, kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch {
            model.toast(error.asAPIError.message, kind: .error)
        }
    }

    private func pull() async {
        pulling = true
        defer { pulling = false }
        do {
            let r = try await model.service.pullResults(week: activeWeek)
            conflicts = r.conflicts
            model.toast(r.ok ? "Applied \(r.applied), confirmed \(r.confirmed), \(r.pending) still pending." : (r.reason ?? "The feed was refused."), kind: r.ok ? .success : .error)
            await load()
            await model.refreshBootstrap()
        } catch {
            model.toast(error.asAPIError.message, kind: .error)
        }
    }
}

private struct LeagueGameRow: View {
    @Environment(AppModel.self) private var model
    let game: Game
    let onSet: (String?) -> Void

    var body: some View {
        let away = model.sport.teamOrPlaceholder(game.away)
        let home = model.sport.teamOrPlaceholder(game.home)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Format.kickoff(game.kickoffAt)).sans(12, weight: .semibold).foregroundStyle(Color.ink2)
                Spacer()
                Text(game.status == .final ? "Final" : game.locked ? "Live" : "Upcoming").sans(11, weight: .bold).foregroundStyle(Color.ink3)
                if let a = game.awayScore, let h = game.homeScore { Text("\(a)–\(h)").sans(12, weight: .bold) }
            }
            HStack(spacing: 8) {
                choice(away, selected: game.winner == away.abbr) { onSet(game.winner == away.abbr ? nil : away.abbr) }
                Button("Tie") { onSet(game.winner == "TIE" ? nil : "TIE") }
                    .buttonStyle(.tally(game.winner == "TIE" ? .primary : .plain, size: .small))
                choice(home, selected: game.winner == home.abbr) { onSet(game.winner == home.abbr ? nil : home.abbr) }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardFlat(fill: game.winner != nil ? .turfSoft : .white)
    }

    private func choice(_ team: Team, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                TeamSticker(team: team, size: 28, flat: true)
                Text(team.display)
            }
        }
        .buttonStyle(.tally(selected ? .turf : .plain, size: .small, fullWidth: true))
    }
}

private struct LeagueFeedView: View {
    @Environment(AppModel.self) private var model
    @State private var status: Loadable<LeagueStatus> = .idle
    @State private var busy: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch status {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let s):
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(text: "Status")
                    row("Build", s.build)
                    row("Schedule", "\(s.scheduleVersion) · synced \(s.scheduleSyncedAt.map { Format.relative($0) } ?? "never")\(s.scheduleLastChanges.map { " · \($0) changes" } ?? "")")
                    if let e = s.scheduleSyncError { Text("Schedule sync error: \(e)").sans(12).foregroundStyle(Color.danger) }
                    row("Results", "last pull \(s.resultsSyncedAt.map { Format.relative($0) } ?? "never")")
                    if let e = s.resultsSyncError { Text("Results sync error: \(e)").sans(12).foregroundStyle(Color.danger) }
                    if let admins = s.admins, !admins.isEmpty {
                        row("Office", admins.map(\.name).joined(separator: ", "))
                    }
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardFlat()
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Tools")
                tool("Check nflverse now", note: "Moves any kickoff the NFL has flexed. Never touches picks or results.") { await sync("remote") }
                tool("Pull final scores (season)", note: "Fills in every finished game without a result. Anything entered by hand stands.") { await pull() }
                tool("Reload bundled schedule", note: "Re-applies the schedule shipped with the Worker.") { await sync("bundled") }
            }
        }
        .task { await load() }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(k).sans(12, weight: .bold).frame(width: 70, alignment: .leading)
            Text(v).sans(12).foregroundStyle(Color.ink2)
        }
    }

    private func tool(_ title: String, note: String, action: @escaping () async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(busy == title ? "Working…" : title) { Task { busy = title; await action(); busy = nil } }
                .buttonStyle(.tally(.plain, size: .small))
                .disabled(busy != nil)
            Text(note).sans(12).foregroundStyle(Color.ink2)
        }
    }

    private func load() async {
        if status.value == nil { status = .loading }
        do { status = .loaded(try await model.service.leagueStatus()) } catch { status = .failed(error.asAPIError) }
    }

    private func sync(_ source: String) async {
        do {
            let r = try await model.service.syncSchedule(source: source)
            model.toast(r.summary, kind: .success)
            await load()
            await model.refreshBootstrap()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }

    private func pull() async {
        do {
            let r = try await model.service.pullResults(week: nil)
            model.toast(r.ok ? "Applied \(r.applied), confirmed \(r.confirmed), \(r.pending) pending, \(r.conflicts.count) conflicts." : (r.reason ?? "The feed was refused."), kind: r.ok ? .success : .error)
            await load()
        } catch { model.toast(error.asAPIError.message, kind: .error) }
    }
}
