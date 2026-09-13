import SwiftUI
import TallyKit

/**
 The board, ported from `Board.tsx`: week or season, sorted by points or by what is still on the
 table, one row per player that opens to show their picks. Both toggles share one line.
 */
struct BoardView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                TallySegmented(value: $model.boardScope, options: [(.week, "Week"), (.season, "Season")])
                TallySegmented(value: $model.boardSort, options: [(.points, "Points"), (.possible, "Potential")])
            }
            if model.boardScope == .week {
                WeekBoardView(week: model.activeBoardWeek, sort: model.boardSort)
                    .id("\(model.player?.id ?? "-"):\(model.activeBoardWeek)")
            } else {
                SeasonBoardView(sort: model.boardSort)
                    .id(model.player?.id ?? "-")
            }
            HStack(spacing: 4) {
                LinkButton(title: "How scoring works", color: .ink3) { model.tab = .rules }
                Text("· Commissioner?").sans(12).foregroundStyle(Color.ink3)
                LinkButton(title: "Enter results", color: .ink3) { model.showAdmin = true }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)
        }
    }
}

/// Sorting by potential reorders the list but keeps each player's real standing on their badge.
private func rowsSorted<T: BoardRow>(_ rows: [T], by sort: BoardSort) -> [T] {
    sort == .points ? rows : rows.sorted { a, b in a.possible != b.possible ? a.possible > b.possible : a.place < b.place }
}

struct WeekBoardView: View {
    @Environment(AppModel.self) private var model
    let week: Int
    let sort: BoardSort
    @State private var board: Loadable<WeekBoardResponse> = .idle
    @State private var open: String?

    var body: some View {
        Group {
            switch board {
            case .idle, .loading: Spinner()
            case .failed(let err): ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let data): content(data)
            }
        }
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
        do { board = .loaded(try await model.service.weekBoard(week)) } catch { if board.value == nil { board = .failed(error.asAPIError) } }
    }

    @ViewBuilder
    private func content(_ data: WeekBoardResponse) -> some View {
        let started = data.lockedCount > 0
        VStack(alignment: .leading, spacing: 10) {
            Text(data.lockedCount == 0
                 ? "Nothing has kicked off yet · \(data.rows.filter { $0.picksMade > 0 }.count) of \(data.rows.count) have picked"
                 : "\(data.finalCount) of \(data.gameCount) games final")
                .sans(14).foregroundStyle(Color.ink2)
            if data.rows.isEmpty {
                EmptyState(title: "Nobody's on the board yet.", body: "Be the first to lock in five picks.") {
                    Button("Make your picks") { model.pickWeek = week; model.tab = .picks }.buttonStyle(.tally(.primary, size: .small))
                }
            } else {
                ForEach(rowsSorted(data.rows, by: sort)) { row in
                    BoardRowCard(place: row.place, name: row.name, isMe: row.playerId == model.player?.id, points: row.points, muted: !started,
                                 subtitle: row.picksMade == 0 ? "No picks"
                                    : !started ? "\(Format.plural(row.picksMade, "pick")) in · up to \(row.possible)"
                                    : "\(row.correct) of \(row.picksMade) right · up to \(row.possible)",
                                 open: open == row.playerId, onToggle: { withAnimation(.easeOut(duration: 0.2)) { open = open == row.playerId ? nil : row.playerId } }) {
                        if row.picksMade == 0 {
                            if row.playerId == model.player?.id {
                                LinkButton(title: "Make your picks →") { model.pickWeek = week; model.tab = .picks }
                            } else {
                                Text("Hasn't picked yet.").sans(14).foregroundStyle(Color.ink3)
                            }
                        } else {
                            FlowLayout(spacing: 6) {
                                ForEach(row.picks) { p in PickChip(pick: p) }
                            }
                            let hidden = row.picksMade - row.picks.count
                            if hidden > 0 {
                                HStack(spacing: 4) {
                                    Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                                    Text("\(hidden) more pick\(hidden == 1 ? "" : "s") revealed at kickoff")
                                }
                                .sans(12).foregroundStyle(Color.ink3)
                            }
                        }
                    }
                }
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: sort)
            }
        }
    }
}

struct SeasonBoardView: View {
    @Environment(AppModel.self) private var model
    let sort: BoardSort
    @State private var board: Loadable<SeasonBoardResponse> = .idle
    @State private var open: String?

    var body: some View {
        Group {
            switch board {
            case .idle, .loading: Spinner()
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
        do { board = .loaded(try await model.service.seasonBoard()) } catch { if board.value == nil { board = .failed(error.asAPIError) } }
    }

    @ViewBuilder
    private func content(_ data: SeasonBoardResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(data.throughWeek == 0 ? "Season standings · nothing has kicked off yet" : "Season standings through Week \(data.throughWeek)")
                .sans(14).foregroundStyle(Color.ink2)
            if data.rows.isEmpty {
                EmptyState(title: "Nobody's on the board yet.", body: "Standings show up once people start picking.")
            } else {
                ForEach(rowsSorted(data.rows, by: sort)) { row in
                    let subtitle: String = {
                        if row.weeksPlayed == 0 { return "No picks yet" }
                        var s = "\(row.correct) right · \(row.weeksPlayed) wk\(row.weeksPlayed == 1 ? "" : "s")"
                        if row.possible > row.points { s += " · up to \(row.possible)" }
                        if let best = row.bestWeek, best.points > 0 { s += " · best \(best.points) (W\(best.week))" }
                        return s
                    }()
                    BoardRowCard(place: row.place, name: row.name, isMe: row.playerId == model.player?.id, points: row.points, muted: data.throughWeek == 0,
                                 subtitle: subtitle, open: open == row.playerId,
                                 onToggle: { withAnimation(.easeOut(duration: 0.2)) { open = open == row.playerId ? nil : row.playerId } }) {
                        WeekBars(row: row, throughWeek: data.throughWeek) { w in
                            model.boardScope = .week
                            model.boardWeek = w
                        }
                    }
                }
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: sort)
            }
        }
    }
}

/// One player's row: place, name, a one-line summary, the points, and a drawer underneath.
struct BoardRowCard<Detail: View>: View {
    let place: Int
    let name: String
    let isMe: Bool
    let points: Int
    let muted: Bool
    let subtitle: String
    let open: Bool
    let onToggle: () -> Void
    @ViewBuilder let detail: Detail

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    PlaceBadge(place: place, muted: muted)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(name).font(TallyFont.display(17)).lineLimit(1)
                            if isMe { Chip(text: "you", size: 10) }
                        }
                        Text(subtitle).sans(12).foregroundStyle(Color.ink2).lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(points)").font(TallyFont.display(30)).monospacedDigit().contentTransition(.numericText())
                        Text("PTS").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
                    }
                }
                .padding(12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
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
        .modifier(TallyCard(hard: isMe, fill: isMe ? .flagSoft : .white, border: .ink, radius: TallyRadius.card, dashed: false))
        .clipped()
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

    /// Colour carries the state, so nothing has to say "pending" — plain means not finished.
    private var style: Style {
        switch pick.outcome {
        case .win: return Style(border: .turf, fill: .turfSoft, badgeFill: .turf, badgeText: .white, value: "\(pick.points)")
        case .loss, .tie: return Style(border: .line, fill: .paper2, badgeFill: .white, badgeText: .ink3, value: "0")
        case .pending: return Style(border: Color.ink.opacity(0.25), fill: .white, badgeFill: .white, badgeText: .ink, value: "\(Scoring.points(forRank: pick.rank))")
        }
    }

    var body: some View {
        let team = model.sport.teamOrPlaceholder(pick.team)
        let stake = Scoring.points(forRank: pick.rank)
        let s = style
        HStack(spacing: 2) {
            TeamSticker(team: team, size: 26, dimmed: pick.outcome == .loss, flat: true)
            Text(s.value)
                .font(TallyFont.display(11))
                .monospacedDigit()
                .foregroundStyle(s.badgeText)
                .frame(minWidth: 18, minHeight: 18)
                .background(Circle().fill(s.badgeFill))
        }
        .padding(.leading, 2).padding(.trailing, 4).padding(.vertical, 2)
        .background(Capsule().fill(s.fill))
        .overlay(Capsule().strokeBorder(s.border, lineWidth: 2))
        .accessibilityLabel("\(team.nickname), \(pick.outcome == .win ? "won \(pick.points) points" : pick.outcome == .pending ? "still playing, worth \(stake) points" : "got nothing")")
    }
}

/// Points per week as a row of bars; tap one to open that week's board.
struct WeekBars: View {
    let row: SeasonRow
    let throughWeek: Int
    let onWeek: (Int) -> Void

    var body: some View {
        let weeks = Array(1...max(throughWeek, 1))
        let top = max(15, weeks.map { row.points(inWeek: $0) }.max() ?? 0)
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(weeks, id: \.self) { w in
                let pts = row.points(inWeek: w)
                Button { onWeek(w) } label: {
                    VStack(spacing: 4) {
                        UnevenRoundedRectangle(topLeadingRadius: 5, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 5)
                            .fill(pts > 0 ? Color.turf : Color.paper3)
                            .overlay(UnevenRoundedRectangle(topLeadingRadius: 5, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 5).strokeBorder(Color.ink, lineWidth: 2))
                            .frame(height: max(CGFloat(pts) / CGFloat(top) * 48, pts > 0 ? 6 : 2))
                        Text("\(w)").sans(9, weight: .bold).foregroundStyle(Color.ink3)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Week \(w): \(pts) points")
            }
        }
        .frame(height: 64, alignment: .bottom)
    }
}
