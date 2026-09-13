import SwiftUI
import TallyKit

// MARK: Select

struct SelectStep: View {
    @Environment(AppModel.self) private var model
    let games: [Game]
    let draft: Draft
    let frozen: [Pick]
    let lockedNow: (Game) -> Bool
    let pickCounts: [String: PickCount]
    let allLocked: Bool
    let hasSaved: Bool
    let currentWeek: Int
    let week: Int
    let now: Date
    let openCount: Int
    let picked: Int
    let slotCount: Int
    let status: (label: String, fill: Color)?
    let onPick: (Game, String) -> Void

    @State private var showStarted: Bool? = nil

    private var full: Bool { picked >= slotCount && slotCount > 0 }
    private var frozenByGame: [String: Pick] { Dictionary(frozen.map { ($0.gameId, $0) }, uniquingKeysWith: { a, _ in a }) }
    private var open: [Game] { games.filter { !lockedNow($0) } }
    private var started: [Game] { games.filter(lockedNow) }
    private let columns = [GridItem(.adaptive(minimum: 320), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if allLocked {
                VStack(alignment: .leading, spacing: 4) {
                    (Text("Every Week \(week) game has kicked off. ").bold() + Text(hasSaved ? "Your picks are in the books." : "No picks this week."))
                        .sans(14)
                    if currentWeek != week {
                        LinkButton(title: "Pick Week \(currentWeek) →") { model.pickWeek = currentWeek }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .paper2)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("Pick \(slotCount) winner\(slotCount == 1 ? "" : "s")").display(30)
                        if picked > 0 { Text("\(picked)/\(slotCount) in").sans(15, weight: .bold).foregroundStyle(Color.ink3) }
                        if let status { Chip(text: status.label, fill: status.fill) }
                    }
                    Text(full ? "That's your five. Rank them next — surest pick 5 pts, least sure 1."
                              : "Tap a team to pick it. Choose five, then rank them — surest pick 5 pts, least sure 1.")
                        .sans(14).foregroundStyle(Color.ink2)
                    HStack(spacing: 8) {
                        HStack(spacing: 3) {
                            Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                            Text("No weekly deadline").sans(10, weight: .bold)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(Color.white))
                        .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
                        Text("Games lock one by one at kickoff · \(openCount) open").sans(12).foregroundStyle(Color.ink3)
                    }
                }
            }

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(open) { g in card(g) }
            }

            if !started.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    DashedDivider().padding(.top, 12)
                    Button {
                        withAnimation { showStarted = !(showStarted ?? !frozen.isEmpty) }
                    } label: {
                        HStack {
                            SectionLabel(text: "Already kicked off (\(started.count))")
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color.ink3)
                                .rotationEffect(.degrees((showStarted ?? !frozen.isEmpty) ? 180 : 0))
                        }
                    }
                    .buttonStyle(.plain)
                    if showStarted ?? !frozen.isEmpty {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(started) { g in card(g) }
                        }
                    }
                }
            }
        }
    }

    private func card(_ g: Game) -> some View {
        GameCard(
            game: g,
            locked: lockedNow(g),
            now: now,
            selection: draft.selections[g.id] ?? frozenByGame[g.id]?.team,
            frozenPick: frozenByGame[g.id],
            counts: pickCounts[g.id],
            muted: full && draft.selections[g.id] == nil && frozenByGame[g.id] == nil,
            onPick: { onPick(g, $0) }
        )
    }
}

// MARK: Rank

struct RankStep: View {
    @Environment(AppModel.self) private var model
    let frozen: [Pick]
    let order: [String]
    let availableRanks: [Int]
    let selections: [String: String]
    let gamesById: [String: Game]
    let merged: [Pick]
    let pending: Bool
    let error: String?
    let offline: Bool
    let onOrder: ([String]) -> Void
    let onBack: () -> Void
    let onSubmit: () -> Void

    private var possible: Int { merged.reduce(0) { $0 + Scoring.points(forRank: $1.rank) } }
    private var canSubmit: Bool { !pending && !offline && !(order.isEmpty && frozen.isEmpty) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button(action: onBack) { Label("Back", systemImage: "chevron.left") }
                .buttonStyle(.tally(.plain, size: .small))
                .disabled(pending)
            VStack(alignment: .leading, spacing: 4) {
                Text("How sure are you?").display(26)
                (Text("Drag to reorder — top pick ") + Text("5 points").bold() + Text(", bottom one ") + Text("1").bold() + Text(". Up to ") + Text("\(possible)").bold() + Text(" this week."))
                    .sans(14).foregroundStyle(Color.ink2)
            }
            if !frozen.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Locked in")
                    ForEach(frozen) { p in
                        HStack(spacing: 12) {
                            RankBadge(rank: p.rank, muted: true)
                            TeamSticker(team: model.sport.teamOrPlaceholder(p.team), size: 44, flat: true)
                            MatchupText(pick: p, game: gamesById[p.gameId], compact: true)
                            Spacer()
                            Image(systemName: "lock.fill").foregroundStyle(Color.ink3)
                        }
                        .padding(10)
                        .cardFlat(fill: Color.paper2.opacity(0.7))
                    }
                }
            }
            ReorderList(order: order, availableRanks: availableRanks, selections: selections, gamesById: gamesById, onOrder: onOrder)
            Text("You can still change a pick until that game kicks off.").sans(12).foregroundStyle(Color.ink3)
            if error != nil || offline {
                HStack(alignment: .top, spacing: 12) {
                    Text(offline ? "You're offline. Your picks are saved on this phone — lock them in once you're back." : (error ?? ""))
                        .sans(14, weight: .semibold)
                    if !offline {
                        Spacer()
                        Button("Try again", action: onSubmit).buttonStyle(.tally(.plain, size: .small)).disabled(pending)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardFlat(fill: .dangerSoft, border: .danger)
            }
            SlideToLock(pending: pending, disabled: !canSubmit, onSubmit: onSubmit)
        }
    }
}

// MARK: Done

struct DoneStep: View {
    @Environment(AppModel.self) private var model
    let name: String
    let week: Int
    let picks: [Pick]
    let gamesById: [String: Game]
    let onReview: () -> Void
    let shareURL: URL

    var body: some View {
        VStack(spacing: 8) {
            Stamp(text: "Locked in")
                .rotationEffect(.degrees(-6))
                .padding(.top, 24)
                .transition(.scale(scale: 3).combined(with: .opacity))
            Text("Nice, \(name).").display(26).padding(.top, 16)
            Text("Your five are in for Week \(week).").sans(14).foregroundStyle(Color.ink2)
            VStack(spacing: 8) {
                ForEach(Array(picks.sorted { $0.rank < $1.rank }.enumerated()), id: \.element.id) { i, p in
                    HStack(spacing: 12) {
                        RankBadge(rank: p.rank, size: .small)
                        TeamSticker(team: model.sport.teamOrPlaceholder(p.team), size: 36, flat: true)
                        MatchupText(pick: p, game: gamesById[p.gameId])
                        Spacer()
                    }
                    .padding(8)
                    .cardFlat()
                    .transition(.move(edge: .leading).combined(with: .opacity))
                    .animation(.easeOut(duration: 0.25).delay(0.25 + Double(i) * 0.07), value: picks.count)
                }
            }
            .frame(maxWidth: 400)
            .padding(.top, 16)
            HStack(spacing: 8) {
                Button("Done", action: onReview).buttonStyle(.tally(.plain))
                Button("See the board") {
                    model.boardScope = .week
                    model.boardWeek = week
                    model.tab = .board
                }.buttonStyle(.tally(.primary))
            }
            .padding(.top, 16)
            ShareLink(item: shareURL) {
                Label("Invite someone to join", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.tally(.ghost, size: .small))
            .foregroundStyle(Color.ink2)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: Review

struct ReviewStep: View {
    @Environment(AppModel.self) private var model
    let week: Int
    let games: [Game]
    let myPicks: [Pick]
    let pickCounts: [String: PickCount]
    let lockedNow: (Game) -> Bool
    let anyUnlocked: Bool
    let submitted: Int
    let status: (label: String, fill: Color)?
    let onEdit: () -> Void

    private struct Row: Identifiable {
        let pick: Pick
        let game: Game?
        let outcome: PickOutcome
        let points: Int
        var id: String { pick.gameId }
    }

    private var rows: [Row] {
        let byId = Dictionary(games.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return myPicks.sorted { $0.rank < $1.rank }.map { p in
            let g = byId[p.gameId]
            let scored = Scoring.score(p, game: g, now: model.now)
            return Row(pick: p, game: g, outcome: scored.outcome, points: scored.points)
        }
    }

    var body: some View {
        let rows = rows
        let points = rows.reduce(0) { $0 + $1.points }
        let correct = rows.filter { $0.outcome == .win }.count
        let finals = rows.filter { [.win, .loss, .tie].contains($0.outcome) }.count
        let started = games.filter(lockedNow)
        let nextKick = games.filter { !lockedNow($0) }.map(\.kickoffAt).min()

        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text("Your five").display(26)
                            if let status { Chip(text: status.label, fill: status.fill) }
                        }
                        Text(finals == 0
                             ? "\(Format.plural(rows.count, "pick")) in · \(Format.plural(submitted, "player")) submitted"
                             : "\(correct) of \(finals) right so far")
                            .sans(14).foregroundStyle(Color.ink2)
                        if let nextKick {
                            HStack(spacing: 3) {
                                Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                                Text("Next game locks \(Format.slot(nextKick))")
                            }
                            .sans(12).foregroundStyle(Color.ink3)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(points)").font(TallyFont.display(40)).monospacedDigit()
                        Text("POINTS").font(TallyFont.sans(10, weight: .bold)).tracking(1).foregroundStyle(Color.ink3)
                    }
                }
                VStack(spacing: 8) {
                    ForEach(rows) { row in
                        HStack(spacing: 12) {
                            RankBadge(rank: row.pick.rank, size: .small)
                            TeamSticker(team: model.sport.teamOrPlaceholder(row.pick.team), size: 40, lost: row.outcome == .loss, dimmed: row.outcome == .tie, flat: true)
                            MatchupText(pick: row.pick, game: row.game)
                            Spacer()
                            OutcomeTag(outcome: row.outcome, points: row.points)
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OutcomeStyle.fill(row.outcome)))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(OutcomeStyle.border(row.outcome), lineWidth: 2))
                    }
                }
                HStack(spacing: 8) {
                    if anyUnlocked {
                        Button("Edit picks", action: onEdit).buttonStyle(.tally(.plain, size: .small))
                    }
                    Button("See the board") {
                        model.boardScope = .week
                        model.boardWeek = week
                        model.tab = .board
                    }.buttonStyle(.tally(.primary, size: .small))
                }
            }
            .padding(16)
            .card()

            if !started.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Who picked whom").display(18)
                    ForEach(started) { g in
                        WhoPickedWhom(game: g, counts: pickCounts[g.id] ?? PickCount(away: 0, home: 0), mine: myPicks.first { $0.gameId == g.id }?.team)
                    }
                }
            }
        }
    }
}

/// Side-by-side bars of who took which side, once a game has kicked off.
struct WhoPickedWhom: View {
    @Environment(AppModel.self) private var model
    let game: Game
    let counts: PickCount
    let mine: String?

    var body: some View {
        let away = model.sport.teamOrPlaceholder(game.away)
        let home = model.sport.teamOrPlaceholder(game.home)
        let total = max(counts.total, 1)
        let homeColor = home.primary.lowercased() == away.primary.lowercased() ? home.secondary : home.primary
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                TeamSticker(team: away, size: 28, flat: true)
                Text(away.display).sans(14, weight: .bold).foregroundStyle(mine == game.away ? Color.turf : Color.ink)
                Spacer()
                Text(game.winner.map { $0 == "TIE" ? "Tie" : "\(model.sport.teamOrPlaceholder($0).display) won" } ?? "In progress")
                    .sans(12).foregroundStyle(Color.ink3)
                Spacer()
                Text(home.display).sans(14, weight: .bold).foregroundStyle(mine == game.home ? Color.turf : Color.ink)
                TeamSticker(team: home, size: 28, flat: true)
            }
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(Color(hex: away.primary)).frame(width: geo.size.width * CGFloat(counts.away) / CGFloat(total))
                    Spacer(minLength: 0)
                    Rectangle().fill(Color(hex: homeColor)).frame(width: geo.size.width * CGFloat(counts.home) / CGFloat(total))
                }
            }
            .frame(height: 12)
            .background(Color.paper2)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            HStack {
                Text("\(counts.away) picked")
                Spacer()
                Text("\(counts.home) picked")
            }
            .sans(11, weight: .semibold).foregroundStyle(Color.ink2)
        }
        .padding(12)
        .cardFlat()
    }
}
