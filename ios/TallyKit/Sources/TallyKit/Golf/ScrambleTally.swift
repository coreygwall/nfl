import Foundation

/// One line of the tally: a player, and what the team kept of theirs.
public struct TallyRow: Hashable, Identifiable, Sendable {
    public let player: GolfPlayer
    /// Every shot of theirs the team played from. The number the leaderboard is sorted by.
    public let kept: Int
    /// Tee shots kept — "off the tee", the stat everyone actually claims.
    public let drives: Int
    /// Shots that went in the hole. A tap-in is nobody's, so it is not here.
    public let holed: Int
    /// Everything in between: the approach that set it up, the lag that made it a tap-in.
    public let between: Int
    /// 1-based, and shared on a tie — two people with six kept are both second.
    public let place: Int

    public var id: String { player.id }
}

/**
 One hole's side contest: which it is, and who took it.

 Only holes that *currently* host a contest are ever built into one of these, so a `winner` of nil
 means nobody has claimed it rather than nobody could.
 */
public struct ContestResult: Hashable, Identifiable, Sendable {
    public let hole: Int
    public let contest: SideContest
    public let winner: GolfPlayer?

    /// The hole cannot host two contests today — par is one number — but the id says both anyway,
    /// so a third contest on a par four would not collide with anything.
    public var id: String { "\(hole)-\(contest.rawValue)" }
    public var claimed: Bool { winner != nil }
}

/**
 One line of the points board: what somebody won, what they put in, and the difference.

 `points` is a **net**, so it is signed and the column adds to nothing. That is the whole reason
 the board is worth keeping: a prize board makes everybody a winner by some amount, and a pot says
 who is buying.
 */
public struct PointsRow: Hashable, Identifiable, Sendable {
    public let player: GolfPlayer
    public let kept: Int
    public let longestDrives: Int
    public let closestToPins: Int
    /// Collected from the others, across everything they won.
    public let won: Int
    /// Put in on everything somebody else won.
    public let paid: Int
    /// `won - paid`. Negative is a real answer. The number the board is sorted by.
    public let points: Int
    /// 1-based, and shared on a tie, the same rule the shots-kept board follows.
    public let place: Int

    public var id: String { player.id }

    public func wins(_ contest: SideContest) -> Int {
        switch contest {
        case .longestDrive: return longestDrives
        case .closestToPin: return closestToPins
        }
    }

    public func wins(_ item: WagerItem) -> Int {
        switch item {
        case .shotKept: return kept
        case .longestDrive: return longestDrives
        case .closestToPin: return closestToPins
        }
    }
}

/**
 The reading of a card: who had the most shots kept, and where they were kept.

 Sorted by shots kept, because that is the question; drives and holed shots break the *order* of a
 tie so the list is stable, but not the *place*, because "off the tee" is a brag rather than a
 tiebreaker and nobody agreed otherwise on the first tee.
 */
public enum ScrambleTally {
    public static func rows(_ card: ScrambleCard) -> [TallyRow] {
        var kept: [String: Int] = [:]
        var drives: [String: Int] = [:]
        var holed: [String: Int] = [:]
        var between: [String: Int] = [:]
        for entry in card.holes {
            let shots = entry.strokes.filter { $0.kind == .shot }
            for (index, stroke) in shots.enumerated() {
                guard let id = stroke.playerId else { continue }
                kept[id, default: 0] += 1
                let isDrive = index == 0
                let isHoled = entry.finished && stroke.id == entry.strokes.last?.id
                if isDrive { drives[id, default: 0] += 1 }
                if isHoled { holed[id, default: 0] += 1 }
                if !isDrive, !isHoled { between[id, default: 0] += 1 }
            }
        }
        let sorted = card.players.sorted { a, b in
            let ka = kept[a.id, default: 0], kb = kept[b.id, default: 0]
            if ka != kb { return ka > kb }
            let da = drives[a.id, default: 0], db = drives[b.id, default: 0]
            if da != db { return da > db }
            let ha = holed[a.id, default: 0], hb = holed[b.id, default: 0]
            if ha != hb { return ha > hb }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
        var rows: [TallyRow] = []
        for (index, player) in sorted.enumerated() {
            let k = kept[player.id, default: 0]
            // Same number kept as the row above: same place. Otherwise the place is the row's
            // position, which skips past a tie the way a leaderboard does (1, 2, 2, 4).
            let place = index > 0 && rows[index - 1].kept == k ? rows[index - 1].place : index + 1
            rows.append(TallyRow(
                player: player,
                kept: k,
                drives: drives[player.id, default: 0],
                holed: holed[player.id, default: 0],
                between: between[player.id, default: 0],
                place: place
            ))
        }
        return rows
    }

    /**
     One or two letters per player, for the scorecard's shots column, where four names in a row
     will not fit. A first letter each until two people share one; then those two get two.
     */
    public static func initials(_ players: [GolfPlayer]) -> [String: String] {
        func prefix(_ name: String, _ n: Int) -> String {
            String(name.trimmingCharacters(in: .whitespaces).prefix(n)).uppercased()
        }
        var out: [String: String] = [:]
        for player in players {
            let one = prefix(player.name, 1)
            let clash = players.contains { $0.id != player.id && prefix($0.name, 1) == one }
            out[player.id] = prefix(player.name, clash ? 2 : 1)
        }
        return out
    }

    /**
     The three lines the group actually argues about, each with everyone tied for it.

     Shots kept is the leaderboard, so it is already on the card; these two are the *brags* — off
     the tee, and putts that went in — and they are separate from the leaderboard on purpose. A
     person who kept four drives and nothing else had a good day at one thing, and the share card
     should be able to say so without pretending it decided the round.

     Nobody with a zero is ever named. "Nobody had a drive kept" is not a highlight, and a card
     that says it reads like a bug.
     */
    public struct Highlights: Hashable, Sendable {
        public struct Best: Hashable, Sendable {
            public let names: [String]
            public let count: Int

            public init(names: [String], count: Int) {
                self.names = names
                self.count = count
            }

            /// "Corey" or "Corey and Dan", for a card that has room for one line.
            public var who: String { Names.list(names) }
        }

        public let mostKept: Best?
        public let offTheTee: Best?
        public let holed: Best?
        /// Nil when the contest is not being played at all, and nil when it is but nobody has
        /// been named yet — a poster should not carry an empty trophy either way.
        public let longestDrive: Best?
        public let closestToPin: Best?
    }

    public static func highlights(_ card: ScrambleCard) -> Highlights {
        let rows = rows(card)
        func best(_ value: (TallyRow) -> Int) -> Highlights.Best? {
            let top = rows.map(value).max() ?? 0
            guard top > 0 else { return nil }
            return Highlights.Best(names: rows.filter { value($0) == top }.map(\.player.name), count: top)
        }
        func bestContest(_ contest: SideContest) -> Highlights.Best? {
            guard card.contests.runs(contest) else { return nil }
            var counts: [String: Int] = [:]
            for result in contestResults(card) where result.contest == contest {
                guard let winner = result.winner else { continue }
                counts[winner.id, default: 0] += 1
            }
            let top = counts.values.max() ?? 0
            guard top > 0 else { return nil }
            return Highlights.Best(names: rows.filter { counts[$0.id] == top }.map(\.player.name), count: top)
        }
        return Highlights(
            mostKept: best(\.kept),
            offTheTee: best(\.drives),
            holed: best(\.holed),
            longestDrive: bestContest(.longestDrive),
            closestToPin: bestContest(.closestToPin)
        )
    }

    // MARK: The contests beside the round

    /// Every hole hosting a contest today, in playing order, with whoever has claimed it.
    public static func contestResults(_ card: ScrambleCard) -> [ContestResult] {
        card.contestHoles.compactMap { hole -> ContestResult? in
            guard let contest = card.contest(for: hole) else { return nil }
            return ContestResult(hole: hole, contest: contest, winner: card.winner(of: contest, on: hole))
        }
    }

    /// How many of one contest a player has taken.
    public static func wins(_ contest: SideContest, by playerId: String, on card: ScrambleCard) -> Int {
        contestResults(card).filter { $0.contest == contest && $0.winner?.id == playerId }.count
    }

    /**
     The points board, settled as a pot.

     Every item being played is a bet everybody is in: a stake of ten on the closest to the pin
     means all four players put ten in on every par three, and whoever is nearest the flag takes
     the other three tens. So a win is worth `each × (players − 1)` to the winner and `each` to
     everybody else, and **the column adds to zero** — which `ScrambleTests` pins, because a board
     that does not is a board somebody will have to settle with a calculator.

     Only what has actually been *claimed* is settled. An unclaimed par three has no pot: nobody
     has put anything in on a bet nobody has won yet, and showing it as money already lost would be
     asking people to pay for a hole that is still in front of them.

     Built even when `points.enabled` is off, because the board is a reading of the card rather
     than a setting — the screen decides whether to draw it.
     */
    public static func points(_ card: ScrambleCard) -> [PointsRow] {
        let values = card.points
        let playing = values.playing(card.contests)
        let players = card.players.count
        let kept = Dictionary(uniqueKeysWithValues: rows(card).map { ($0.id, $0.kept) })

        // How many of each item every player has taken, and how many have been taken at all. The
        // second is what everybody else pays into, so it is counted once rather than per player.
        var wins: [WagerItem: [String: Int]] = [.shotKept: kept]
        var claimed: [WagerItem: Int] = [.shotKept: kept.values.reduce(0, +)]
        for result in contestResults(card) {
            let item = WagerItem(result.contest)
            guard let winner = result.winner else { continue }
            wins[item, default: [:]][winner.id, default: 0] += 1
            claimed[item, default: 0] += 1
        }
        func mine(_ item: WagerItem, _ id: String) -> Int { wins[item]?[id] ?? 0 }

        func settle(_ id: String) -> (won: Int, paid: Int) {
            var won = 0
            var paid = 0
            for item in playing {
                let stake = values[item]
                let taken = mine(item, id)
                won += taken * stake.winnings(players: players)
                // Everything somebody else won is a stake this player put in and did not take back.
                paid += (claimed[item, default: 0] - taken) * stake.each
            }
            return (won, paid)
        }

        let net = Dictionary(uniqueKeysWithValues: card.players.map { player -> (String, Int) in
            let s = settle(player.id)
            return (player.id, s.won - s.paid)
        })

        let sorted = card.players.sorted { a, b in
            let pa = net[a.id, default: 0], pb = net[b.id, default: 0]
            if pa != pb { return pa > pb }
            let ca = mine(.closestToPin, a.id), cb = mine(.closestToPin, b.id)
            if ca != cb { return ca > cb }
            let la = mine(.longestDrive, a.id), lb = mine(.longestDrive, b.id)
            if la != lb { return la > lb }
            let ka = kept[a.id, default: 0], kb = kept[b.id, default: 0]
            if ka != kb { return ka > kb }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }

        var out: [PointsRow] = []
        for (index, player) in sorted.enumerated() {
            let s = settle(player.id)
            let p = s.won - s.paid
            let place = index > 0 && out[index - 1].points == p ? out[index - 1].place : index + 1
            out.append(PointsRow(
                player: player,
                kept: kept[player.id, default: 0],
                longestDrives: mine(.longestDrive, player.id),
                closestToPins: mine(.closestToPin, player.id),
                won: s.won,
                paid: s.paid,
                points: p,
                place: place
            ))
        }
        return out
    }

    /// "+30", "−10", "0" — a net, with a real minus sign and an explicit plus, because the sign is
    /// the entire point of this column.
    public static func netText(_ n: Int) -> String {
        if n == 0 { return "0" }
        return n < 0 ? "−\(-n)" : "+\(n)"
    }

    /**
     What everybody is in for, in one line, mentioning only what this card is actually playing.

     "10 each on a closest to the pin · 10 each on a longest drive". The stake is said rather than
     the prize because the stake is what a person is agreeing to; what a win is worth falls out of
     how many are playing, and `winningsLine` says that separately for the one number people ask
     about on the first tee.
     */
    public static func pointsLine(_ card: ScrambleCard) -> String {
        let playing = card.points.playing(card.contests)
        guard !playing.isEmpty else { return "Nothing is being played for yet." }
        return playing.map { "\(card.points[$0].each) each on \($0.unit)" }.joined(separator: " · ")
    }

    /// "Worth 30 to whoever takes it, 10 from each of the other 3." Written for the tee, where the
    /// question is always what a win is actually worth — and the row above already names the bet.
    public static func winningsLine(stake: Stake, players: Int) -> String {
        let others = max(players - 1, 0)
        guard others > 0, stake.each > 0 else { return "Nobody else to play it with yet." }
        return "Worth \(stake.winnings(players: players)) to whoever takes it, \(stake.each) from each of the other \(others)."
    }

    /**
     The card, as a message somebody can paste into the group chat.

     **Not what normally gets shared.** A round goes out as the drawn card (`ShareCardView`), because
     a picture is what gets re-shared in a thread and a paragraph is not. This is the fallback for
     the one case that would otherwise be a dead end: `ImageRenderer` can return nil, and a share
     button that does nothing is worse than one that sends the words.
     */
    public static func summary(_ card: ScrambleCard) -> String {
        var lines: [String] = []
        let title = card.course.isEmpty ? card.name : "\(card.name) · \(card.course)"
        lines.append(title)

        let progress = card.isComplete ? "final" : card.throughHole == 0 ? "not started" : "through \(card.throughHole)"
        if card.throughHole > 0 {
            lines.append("\(card.strokesTaken) strokes, \(toParText(card.toPar)) · \(progress)")
        } else {
            lines.append(progress)
        }

        let rows = rows(card)
        if rows.contains(where: { $0.kept > 0 }) {
            lines.append("")
            lines.append("Shots kept")
            for row in rows {
                var detail: [String] = []
                if row.drives > 0 { detail.append("\(row.drives) off the tee") }
                if row.holed > 0 { detail.append("\(row.holed) holed") }
                let tail = detail.isEmpty ? "" : " (\(detail.joined(separator: ", ")))"
                lines.append("\(row.place). \(row.player.name) — \(row.kept)\(tail)")
            }
        }

        let contests = contestResults(card).filter(\.claimed)
        if !contests.isEmpty {
            for contest in card.contests.playing {
                let taken = contests.filter { $0.contest == contest }
                guard !taken.isEmpty else { continue }
                lines.append("")
                lines.append(contest.title)
                for result in taken {
                    lines.append("Hole \(result.hole) — \(result.winner?.name ?? "")")
                }
            }
        }

        if card.points.enabled {
            let board = points(card)
            if board.contains(where: { $0.points != 0 }) {
                lines.append("")
                lines.append("Points · \(pointsLine(card))")
                for row in board {
                    lines.append("\(row.place). \(row.player.name) — \(netText(row.points))")
                }
            }
        }

        lines.append("")
        lines.append("Kept with Tally")
        return lines.joined(separator: "\n")
    }

    /// "E", "−2", "+3": the number a golfer reads, with a real minus sign.
    public static func toParText(_ n: Int) -> String {
        if n == 0 { return "E" }
        return n < 0 ? "−\(-n)" : "+\(n)"
    }

    /**
     Every word a finished hole can be *called*, which is a shorter list than the words it can be
     labelled with.

     `label` runs off the end into a bare number — a quintuple bogey is "+5" — and there is no
     recording of "+5", nor should there be. `callName` folds that whole tail into one word so a
     hole always has exactly one sound to reach for, and this is the list of the sounds. It is the
     naming rule for the files themselves: a recording is one of these words plus a format, so
     `birdie.m4a` is the birdie. Nothing matches by score, which means a file can be added or
     replaced without touching a line of code.
     */
    public static let callNames = ["ace", "albatross", "eagle", "birdie", "par", "bogey", "double", "worse"]

    /// Which of `callNames` this hole is. Always one of them, for any score on any par.
    public static func callName(score: Int, par: Int) -> String {
        let word = label(score: score, par: par)
        return callNames.contains(word) ? word : "worse"
    }

    /// The word for a finished hole's score. Anything past a double bogey is just the number.
    public static func label(score: Int, par: Int) -> String {
        switch score - par {
        case ..<(-2): return score == 1 ? "ace" : "albatross"
        case -2: return score == 1 ? "ace" : "eagle"
        case -1: return "birdie"
        case 0: return "par"
        case 1: return "bogey"
        case 2: return "double"
        default: return "+\(score - par)"
        }
    }
}
