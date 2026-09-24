import SwiftUI
import TallyKit

/**
 The board, ported from `Board.tsx`: week or season, one row per player that opens to show their
 picks. What each player still has to play for is on their row ("up to 14"); there used to be a
 "Potential" sort as well, taken out because it confused more than it told.
 */
struct BoardView: View {
    @Environment(AppModel.self) private var model
    /// List or grid. A preference rather than screen state, so the person who reads the board as
    /// a table on Sunday finds it that way again on Monday. It lives up here with the week/season
    /// switch: both are ways of looking at the same standings.
    @AppStorage("tally.boardGrid") private var grid = false

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 16) {
            BoardControls(scope: $model.boardScope, grid: $grid,
                          showLayout: model.boardScope == .week)
            if model.boardScope == .week {
                WeekBoardView(week: model.activeBoardWeek, grid: grid)
                    .id("\(model.player?.id ?? "-"):\(model.activeBoardWeek)")
            } else {
                SeasonBoardView()
                    .id(model.player?.id ?? "-")
            }
            LinkButton(title: "How scoring works", color: .ink3) { model.showRules = true }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)
        }
    }
}

/**
 The ways of reading the board: which board, and — on the week — list or grid. One line when one
 line holds them, two when it does not.

 `ViewThatFits` rather than a width someone measured once: a person who has turned their type size
 right up can run out of room even for two controls, and then the toggle drops to its own
 right-aligned row and the segmented control keeps its full width.

 The layout toggle is drawn for the whole of the week tab rather than only once rows land, so the
 row does not reflow under your thumb as the board loads. The season board has no grid, so it has
 no toggle and never needs the second row.
 */
private struct BoardControls: View {
    @Binding var scope: BoardScope
    @Binding var grid: Bool
    let showLayout: Bool

    var body: some View {
        if showLayout {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    pair
                    BoardLayoutToggle(grid: $grid)
                }
                VStack(alignment: .trailing, spacing: 8) {
                    HStack(spacing: 8) { pair }
                    BoardLayoutToggle(grid: $grid)
                }
            }
        } else {
            HStack(spacing: 8) { pair }
        }
    }

    /// Which board.
    @ViewBuilder private var pair: some View {
        TallySegmented(value: $scope, options: [(.week, "Week"), (.season, "Season")])
    }
}

struct WeekBoardView: View {
    @Environment(AppModel.self) private var model
    let week: Int
    /// List or grid, decided by the toggle on the row above (`BoardView`).
    let grid: Bool
    @State private var board: Loadable<WeekBoardResponse> = .idle
    @State private var open: String?
    @State private var celebrating = false
    @State private var confetti = 0

    var body: some View {
        Group {
            switch board {
            // The shape of the board, not a spinner in the middle of nothing.
            case .idle, .loading: BoardSkeleton()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let data): content(data)
            }
        }
        .overlay { if confetti > 0 { ConfettiView(trigger: confetti).allowsHitTesting(false) } }
        .task(id: week) { await load() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                await load(quiet: true)
            }
        }
    }

    private func load(quiet: Bool = false) async {
        if !quiet, board.value == nil { board = .loading }
        do {
            let fresh = try await model.service.weekBoard(week)
            board = .loaded(fresh)
            react(to: fresh)
        } catch {
            if board.value == nil { board = .failed(error.asAPIError) }
        }
    }

    private func after(_ seconds: Double, _ work: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    /// Winners of the week: everyone level at the top, once every game has a result.
    private func winners(_ data: WeekBoardResponse) -> [WeekRow] {
        guard data.gameCount > 0, data.finalCount == data.gameCount else { return [] }
        return data.rows.filter { $0.place == 1 && $0.picksMade > 0 }
    }

    /**
     Feel what just changed.

     The board reloads itself every minute, and almost every reload says nothing. This works out
     which ones do — a pick settling, the week ending — and marks them. The first look at a week
     only sets a baseline, so opening the app late on a Sunday does not replay the whole afternoon
     in haptics; the week finishing is the exception, and gets its celebration however late you
     arrive, exactly once.
     */
    private func react(to data: WeekBoardResponse) {
        guard let me = model.player?.id, let mine = data.rows.first(where: { $0.playerId == me }) else { return }
        let top = winners(data)
        let watch = WeekWatch(
            week: week,
            outcomes: Dictionary(mine.picks.map { ($0.gameId, $0.outcome.rawValue) }, uniquingKeysWith: { a, _ in a }),
            points: mine.points,
            place: mine.place,
            finished: data.gameCount > 0 && data.finalCount == data.gameCount,
            field: data.rows.count,
            sharedFirst: top.count > 1
        )
        let teams = Dictionary(mine.picks.map { ($0.gameId, $0.team) }, uniquingKeysWith: { a, _ in a })
        let ranks = Dictionary(mine.picks.map { ($0.gameId, $0.rank) }, uniquingKeysWith: { a, _ in a })
        let found = watch.milestones(
            since: MilestoneStore.lastSeen(playerId: me, week: week),
            teamsByGame: teams,
            ranksByGame: ranks
        )
        MilestoneStore.record(watch, playerId: me)

        // Results are spread out, not stacked. A Sunday afternoon settles three games in the same
        // poll often enough, and three patterns starting in the same millisecond are one long
        // meaningless buzz — where the same three a half-second apart read as three results. The
        // cap is there because past a few it stops being information and starts being a rattle.
        var beat = 0
        for milestone in found {
            let play: () -> Void
            switch milestone {
            case .pickWon: play = Haptics.won
            case .pickLost: play = Haptics.lost
            case .finishedWeek: play = Haptics.weekSettled
            case .wonWeek, .tookSeasonLead: continue // Below, which also covers arriving late.
            }
            guard beat < 3 else { break }
            if beat == 0 { play() } else { after(Double(beat) * 0.5, play) }
            beat += 1
        }

        // The win is claimed rather than reacted to, so it lands once whether you were watching when
        // the last whistle went or opened the app on Tuesday.
        guard watch.finished, mine.place == 1, mine.picksMade > 0 else { return }
        guard MilestoneStore.claimCelebration(CelebrationLog.key(playerId: me, "week-\(week)")) else { return }
        celebrating = true
        confetti += 1
        Haptics.wonTheWeek()
    }

    @ViewBuilder
    private func content(_ data: WeekBoardResponse) -> some View {
        let started = data.lockedCount > 0
        let top = winners(data)
        let iWon = top.contains { $0.playerId == model.player?.id }
        VStack(alignment: .leading, spacing: 10) {
            // Your own week, first, once. A card rather than a sheet: nobody should have to tap
            // "OK" to acknowledge their own good week, and this can be scrolled straight past.
            if celebrating, let mine = top.first(where: { $0.playerId == model.player?.id }) {
                WeekWinnerCard(week: week, points: mine.points, shared: top.count > 1) {
                    withAnimation(Motion.fade) { celebrating = false }
                }
                .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
            // Then who took it, for everyone, for as long as the week is on screen.
            if !top.isEmpty {
                WeekWinnerBanner(week: week, winners: top.map(\.name), points: top[0].points, isMe: iWon)
            }
            if data.rows.isEmpty {
                EmptyState(title: "Nobody's on the board yet.", body: "Be the first to lock in five picks.") {
                    Button("Make your picks") { model.pickWeek = week; model.tab = .picks }.buttonStyle(.tally(.primary, size: .small))
                }
            } else if grid {
                BoardGrid(rows: data.rows, started: started)
            } else {
                ForEach(Array(data.rows.enumerated()), id: \.element.id) { index, row in
                    let won = !top.isEmpty && row.place == 1 && row.picksMade > 0
                    BoardRowCard(place: row.place, name: row.name, isMe: row.playerId == model.player?.id, mine: row.isMine, points: row.points, muted: !started,
                                 crowned: won,
                                 subtitle: row.picksMade == 0 ? "No picks"
                                    : !started ? "\(Format.plural(row.picksMade, "pick")) in · up to \(row.possible)"
                                    : "\(row.correct) of \(row.picksMade) right · up to \(row.possible)",
                                 open: open == row.playerId, onToggle: { withAnimation(Motion.fade) { open = open == row.playerId ? nil : row.playerId } }) {
                        if row.picksMade == 0 {
                            PickSlotRow(slots: row.pickSlots)
                            if row.playerId == model.player?.id {
                                LinkButton(title: "Make your picks →") { model.pickWeek = week; model.tab = .picks }
                            } else {
                                Text("Hasn't picked yet.").sans(14).foregroundStyle(Color.ink3)
                            }
                        } else {
                            PickSlotRow(slots: row.pickSlots)
                            let hidden = row.picksMade - row.picks.count
                            if hidden > 0 {
                                HStack(spacing: 4) {
                                    Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                                    Text("\(hidden) pick\(hidden == 1 ? "" : "s") still hidden — the team shows at kickoff")
                                }
                                .sans(12).foregroundStyle(Color.ink3)
                            }
                        }
                    }
                    .dealt(index)
                    .scrollSettle()
                }
            }
            // How far through the week this is, and which prize it settles — underneath, because
            // it is a footnote about the standings rather than a heading over them, and the top
            // of this screen is for the standings and the three ways of reading them.
            VStack(alignment: .leading, spacing: 2) {
                Text(data.lockedCount == 0
                     ? "Nothing has kicked off yet · \(data.rows.filter { $0.picksMade > 0 }.count) of \(data.rows.count) have picked"
                     : "\(data.finalCount) of \(data.gameCount) games final")
                    .sans(13).foregroundStyle(Color.ink2)
                if week < model.seasonStartsAt {
                    Text("Week \(week) has its own winner. The season race starts in Week \(model.seasonStartsAt).")
                        .sans(12).foregroundStyle(Color.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 2)
        }
    }
}

struct SeasonBoardView: View {
    @Environment(AppModel.self) private var model
    @State private var board: Loadable<SeasonBoardResponse> = .idle
    @State private var open: String?

    var body: some View {
        Group {
            switch board {
            // The shape of the board, not a spinner in the middle of nothing.
            case .idle, .loading: BoardSkeleton()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let data): content(data)
            }
        }
        .task { await load() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                await load(quiet: true)
            }
        }
    }

    private func load(quiet: Bool = false) async {
        if !quiet, board.value == nil { board = .loading }
        do {
            let fresh = try await model.service.seasonBoard()
            board = .loaded(fresh)
            // Going top of the table is the one season change worth feeling. Slipping down is not:
            // the app should not be the thing that rubs it in.
            if let me = model.player?.id, !fresh.notStarted,
               let mine = fresh.rows.first(where: { $0.playerId == me }), mine.weeksPlayed > 0,
               MilestoneStore.noteSeasonPlace(mine.place, playerId: me) {
                Haptics.tookTheLead()
                model.toast("Top of the season table.")
            }
        } catch {
            if board.value == nil { board = .failed(error.asAPIError) }
        }
    }

    @ViewBuilder
    private func content(_ data: SeasonBoardResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if data.notStarted {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Starts in Week \(data.seasonStartsAt)").display(18)
                    Text("Week \(data.seasonStartsAt - 1) has a winner of its own — those points just don't carry. The season is the running total from Week \(data.seasonStartsAt) on.")
                        .sans(13).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .flagSoft)
            } else {
                Text("Season standings through Week \(data.throughWeek)")
                    .sans(14).foregroundStyle(Color.ink2)
            }
            if data.rows.isEmpty {
                EmptyState(title: "Nobody's on the board yet.", body: "Standings show up once people start picking.")
            } else {
                ForEach(Array(data.rows.enumerated()), id: \.element.id) { index, row in
                    let subtitle: String = {
                        if row.weeksPlayed == 0 { return "No picks yet" }
                        var s = "\(row.correct) right · \(row.weeksPlayed) wk\(row.weeksPlayed == 1 ? "" : "s")"
                        if row.possible > row.points { s += " · up to \(row.possible)" }
                        if let best = row.bestWeek, best.points > 0 { s += " · best \(best.points) (W\(best.week))" }
                        return s
                    }()
                    BoardRowCard(place: row.place, name: row.name, isMe: row.playerId == model.player?.id, mine: row.isMine, points: row.points, muted: data.throughWeek == 0,
                                 subtitle: subtitle, open: open == row.playerId,
                                 onToggle: { withAnimation(Motion.fade) { open = open == row.playerId ? nil : row.playerId } }) {
                        WeekBars(row: row, fromWeek: data.seasonStartsAt, throughWeek: data.throughWeek) { w in
                            model.boardScope = .week
                            model.boardWeek = w
                        }
                    }
                    .dealt(index)
                    .scrollSettle()
                }
            }
            WinningsCard()
        }
    }
}

/**
 The real-money board: what every entry has actually won, running. It sits under the season
 standings rather than inside them — the points column already means something on every other
 screen, and this is a different number entirely, so it gets its own card and its own `$` rather
 than borrowing the points row's big digit. Mirrors `WinningsCard` on the web.
 */
struct WinningsCard: View {
    @Environment(AppModel.self) private var model
    @State private var board: Loadable<WinningsResponse> = .idle

    var body: some View {
        Group {
            switch board {
            // Real money is worth showing only once it is right — say nothing rather than guess,
            // and the season standings above already carry the loading state for this screen.
            case .idle, .loading, .failed: EmptyView()
            case .loaded(let data): content(data)
            }
        }
        .task { await load() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                await load()
            }
        }
    }

    private func load() async {
        if let fresh = try? await model.service.winnings() { board = .loaded(fresh) }
    }

    @ViewBuilder
    private func content(_ data: WinningsResponse) -> some View {
        // Nothing has settled yet — nothing to show.
        if data.rows.contains(where: { $0.total > 0 }) {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("WINNINGS")
                        .sans(10, weight: .bold).tracking(1)
                        .foregroundStyle(Color.ink3)
                    Text("\(Winnings.label(data.weeklyPot)) to each week's winner, \(Winnings.label(data.seasonPot)) to the season's\(data.seasonSettled ? "" : " once it's decided") — a tie splits the pot evenly.")
                        .sans(12).foregroundStyle(Color.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(data.rows.filter { $0.total > 0 }) { row in
                    WinningsRowView(row: row, isMe: row.playerId == model.player?.id)
                }
                if !data.weeks.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Rectangle().fill(Color.line).frame(height: 1)
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(data.weeks) { week in
                                Text(weekLine(week)).sans(12).foregroundStyle(Color.ink2)
                            }
                        }
                    }
                }
                Text(Winnings.noMoneyNote)
                    .sans(11).foregroundStyle(Color.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardFlat()
        }
    }

    /// "Week 1 — Joseph Philbin — $18" alone, "Week 2 — Athens G & Parker split $9 each" tied.
    private func weekLine(_ week: WeekWinnings) -> String {
        let names = week.winnerNames.joined(separator: " & ")
        let tail = week.winnerNames.count > 1 ? "split \(Winnings.label(week.share)) each" : "— \(Winnings.label(week.share))"
        return "Week \(week.week) — \(names) \(tail)"
    }
}

private struct WinningsRowView: View {
    let row: WinningsRow
    let isMe: Bool

    var body: some View {
        HStack(spacing: 10) {
            PlaceBadge(place: row.place, small: true)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(row.name).font(TallyFont.display(15, weight: .bold)).lineLimit(1)
                    if isMe { Chip(text: "you", size: 10) }
                    if row.mine && !isMe { Chip(text: "yours", size: 10) }
                }
                Text("\(row.weeksWon) week\(row.weeksWon == 1 ? "" : "s") won\(row.season > 0 ? " · season" : "")")
                    .sans(11).foregroundStyle(Color.ink2)
            }
            Spacer(minLength: 8)
            Text(Winnings.label(row.total))
                .font(TallyFont.display(18, weight: .bold)).monospacedDigit()
        }
        .padding(8)
        .background(isMe ? Color.flagSoft : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// One player's row: place, name, a one-line summary, the points, and a drawer underneath.
struct BoardRowCard<Detail: View>: View {
    let place: Int
    let name: String
    let isMe: Bool
    /// One of the account's other entries: not who you are picking as, but yours all the same.
    /// Told apart from the field with a chip rather than the flag fill, because two highlighted
    /// rows would leave nobody sure which one the picks tab is actually on.
    var mine = false
    let points: Int
    let muted: Bool
    /// Took the week. Only ever true once the week is over, so it reads as a result rather than a
    /// lead — "top of the table right now" is what the place badge is for.
    var crowned = false
    let subtitle: String
    let open: Bool
    let onToggle: () -> Void
    @ViewBuilder let detail: Detail

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    PlaceBadge(place: place, muted: muted, crowned: crowned)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(name).font(TallyFont.display(17)).lineLimit(1)
                            if isMe { Chip(text: "you", size: 10) }
                            if mine && !isMe { Chip(text: "yours", size: 10) }
                            if crowned { Chip(text: "winner", fill: .flag, size: 10, label: .onAccent) }
                        }
                        Text(subtitle).sans(12).foregroundStyle(Color.ink2).lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        // `.numericText` rolls the digits, but only if the change is inside an
                        // animation — without this it snaps like any other value.
                        Text("\(points)").font(TallyFont.display(30)).monospacedDigit()
                            .contentTransition(.numericText())
                            .animation(Motion.settle, value: points)
                        Text("PTS").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
                    }
                }
                .padding(12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.cardPress)
            .accessibilityAddTraits(open ? [.isButton, .isSelected] : .isButton)
            if open {
                VStack(alignment: .leading, spacing: 8) {
                    DashedDivider()
                    detail
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        // No .clipped() here: the card's own offset shadow lives outside its bounds, and clipping
        // sliced it off on the highlighted row.
        .modifier(TallyCard(hard: isMe || crowned, fill: isMe || crowned ? .flagSoft : .surface, border: .cardBorder, radius: TallyRadius.card, dashed: false))
    }
}

/**
 Five places, always, in rank order. A pick whose game has begun shows its team and what it is
 worth; one that has not shows a lock in its own place, because the rank is public even while the
 team is not; a rank nobody took stays an empty outline. The row fills in as the week goes rather
 than growing sideways, so its shape says how far along someone is at a glance.
 */
struct PickSlotRow: View {
    let slots: [PickSlot]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(slots) { slot in
                slotView(slot)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func slotView(_ slot: PickSlot) -> some View {
        switch slot {
        case .taken(let pick):
            PickChip(pick: pick)
        case .hidden(let rank):
            EmptySlotChip(points: Scoring.points(forRank: rank), locked: true)
        case .empty(let rank):
            EmptySlotChip(points: Scoring.points(forRank: rank), locked: false)
        }
    }
}

struct EmptySlotChip: View {
    let points: Int
    let locked: Bool

    var body: some View {
        let said = locked ? "A hidden pick worth \(points) points, revealed at kickoff" : "No pick worth \(points) points"
        HStack(spacing: PillFit.Chip.gap) {
            Group {
                if locked {
                    Image(systemName: "lock.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink2)
                } else {
                    Text("–").sans(13, weight: .bold).foregroundStyle(Color.ink3)
                }
            }
            .frame(width: PillFit.Chip.logo, height: PillFit.Chip.logo)
            Text("\(points)")
                .font(TallyFont.display(11))
                .monospacedDigit()
                .foregroundStyle(locked ? Color.ink : Color.ink3)
                .frame(minWidth: PillFit.Chip.badge, minHeight: PillFit.Chip.badge)
                .background(Circle().fill(locked ? Color.surface : Color.clear))
        }
        .padding(.leading, PillFit.Chip.leading)
        .padding(.trailing, PillFit.Chip.trailing)
        .padding(.vertical, PillFit.Chip.vertical)
        .background(Capsule().fill(locked ? Color.surface : Color.paper2.opacity(0.5)))
        .overlay(
            Capsule().strokeBorder(
                locked ? Color.ink.opacity(0.25) : Color.line,
                style: StrokeStyle(lineWidth: 2, dash: locked ? [] : [4, 3])
            )
        )
        .accessibilityLabel(said)
    }
}

/// One pick, small enough that all five sit on one line. The number is the points.
struct PickChip: View {
    @Environment(AppModel.self) private var model
    let pick: ScoredPick

    private struct Style {
        let border: Color
        let fill: Color
        let badgeFill: Color
        let badgeText: Color
        let value: String
    }

    /**
     Colour carries the state, so nothing has to say "pending" — plain means not finished.

     A loss is red rather than merely faded. Grey reads as "nothing happened here", which is what a
     rank nobody took looks like; a pick that went down is a different thing and should be legible
     as one from across the row. A tie stays neutral: it scored nothing, but it was not wrong.
     */
    private var style: Style {
        switch pick.outcome {
        case .win: return Style(border: .turf, fill: .turfSoft, badgeFill: .turf, badgeText: .onFill, value: "\(pick.points)")
        case .loss: return Style(border: Color.danger.opacity(0.55), fill: .dangerSoft, badgeFill: .surface, badgeText: .danger, value: "0")
        case .tie: return Style(border: .line, fill: .paper2, badgeFill: .surface, badgeText: .ink3, value: "0")
        case .pending: return Style(border: Color.ink.opacity(0.25), fill: .surface, badgeFill: .surface, badgeText: .ink, value: "\(Scoring.points(forRank: pick.rank))")
        }
    }

    var body: some View {
        let team = model.sport.teamOrPlaceholder(pick.team)
        let stake = Scoring.points(forRank: pick.rank)
        let s = style
        HStack(spacing: PillFit.Chip.gap) {
            TeamSticker(team: team, size: PillFit.Chip.logo, lost: pick.outcome == .loss, flat: true)
            Text(s.value)
                .font(TallyFont.display(11))
                .monospacedDigit()
                .foregroundStyle(s.badgeText)
                .frame(minWidth: PillFit.Chip.badge, minHeight: PillFit.Chip.badge)
                .background(Circle().fill(s.badgeFill))
        }
        .padding(.leading, PillFit.Chip.leading)
        .padding(.trailing, PillFit.Chip.trailing)
        .padding(.vertical, PillFit.Chip.vertical)
        .background(Capsule().fill(s.fill))
        .overlay(Capsule().strokeBorder(s.border, lineWidth: 2))
        .accessibilityLabel("\(team.nickname), \(pick.outcome == .win ? "won \(pick.points) points" : pick.outcome == .pending ? "still playing, worth \(stake) points" : "got nothing")")
    }
}

/**
 One player's season as a chart: a column per week from the first week that counts to the last of
 the season, so the weeks still to come are *on screen* as placeholders rather than implied.

 It used to draw only the weeks that had been played, which in Week 2 meant a single column filling
 the whole width — and because a nothing week was drawn as a two-point sliver, that column read as
 a horizontal rule with a stray "2" under it. Nobody could tell it was a chart.

 Three states, and the dashes mean here what they mean on the grid: nothing here.

 | Column | Week | Drawn as |
 | --- | --- | --- |
 | scored | played, points on the board | turf fill, its number above |
 | blank | played, nothing scored | an empty track |
 | ahead | not played yet | a dashed outline |

 The scale is a *perfect week* rather than this row's own best, so a five-point column is the same
 height on everybody's chart — which is the whole point of putting them one above another. The web
 draws the same three states from the same rule (`SeasonWeekChart`).
 */
struct WeekBars: View {
    let row: SeasonRow
    /// The first week that counts towards the season — the server's, not a client constant.
    let fromWeek: Int
    let throughWeek: Int
    let onWeek: (Int) -> Void

    /// How tall a column's track is. A perfect week fills it exactly.
    private let track: CGFloat = 52

    var body: some View {
        let last = max(WeekLogic.weeks, fromWeek)
        VStack(alignment: .leading, spacing: 6) {
            Text("POINTS BY WEEK")
                .sans(10, weight: .bold).tracking(1)
                .foregroundStyle(Color.ink3)
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(fromWeek...last, id: \.self) { w in column(w) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Points by week")
    }

    private func column(_ w: Int) -> some View {
        let pts = row.points(inWeek: w)
        let played = w <= throughWeek
        return VStack(spacing: 3) {
            // The score is the thing to read, so it is the only full-ink text here.
            Text(played && pts > 0 ? "\(pts)" : " ")
                .sans(10, weight: .bold).monospacedDigit()
                .foregroundStyle(Color.ink)
            ZStack(alignment: .bottom) {
                // Every track is the same. A dashed outline on the weeks still to come was doing
                // the job a green bar already does — saying which weeks have happened — and
                // seventeen dashed boxes at this size is a texture, not information.
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color.paper2)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Color.line, lineWidth: 1)
                    )
                if pts > 0 {
                    UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 4)
                        .fill(Color.turf)
                        .overlay(
                            UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 4)
                                .strokeBorder(Color.ink, lineWidth: 2)
                        )
                        .frame(height: max(CGFloat(pts) / CGFloat(Scoring.maxWeekPoints) * track, 6))
                }
            }
            .frame(height: track)
            // Every week is numbered, but quietly: the axis is for orienting yourself once, and it
            // should never compete with the scores above it.
            Text("\(w)")
                .sans(8, weight: .bold).monospacedDigit()
                .foregroundStyle(Color.ink3.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        // Every column opens its week now that they all look alike; a week still to come opens a
        // board of fixtures, which is a fair answer to tapping it.
        .onTapGesture { Haptics.tap(); onWeek(w) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(played ? "Week \(w): \(pts) point\(pts == 1 ? "" : "s")" : "Week \(w): not played yet")
        .accessibilityAddTraits(.isButton)
    }
}
