import Foundation

/**
 What every contest on the phone has to say for itself on the app's home.

 The home tab lists every pool and every golf card as one card each, and the only question it
 exists to answer is *which of these wants me*. That answer has to be the same whether the card is
 being drawn, counted for the badge on the tab, or used to decide where a tap lands, so the rule
 lives here once and the views only read it. It is also the kind of rule that costs somebody their
 week if it is wrong — "picks in" off a stale board is the one sentence Home must never guess —
 which is why it takes plain values and has tests, rather than living in a view.

 A pool answers from a `WidgetSnapshot`: the same projection the home-screen widgets draw, built by
 the same `WidgetRefresh`, so the hub and the widgets cannot disagree about whose picks are in. A
 card answers from itself; a scramble has no server.
 */
public enum HubAttention: Int, Comparable, Hashable, Sendable {
    /// Something of yours is missing and there is still time: picks owed, games still open.
    case needsYou = 0
    /// Nothing to do, but something is happening — a game of yours is on, a round is under way.
    case live
    /// Waiting on the calendar: picks in and nothing kicked off, a card set up for Saturday.
    case waiting
    /// Over. A finished week, a finished round.
    case done

    public static func < (a: HubAttention, b: HubAttention) -> Bool { a.rawValue < b.rawValue }
}

/// A pool as the hub reads it: what the widgets know, plus the shape of the week from bootstrap —
/// how many games there are and how many have kicked off, which the snapshot does not carry.
public struct HubPool: Hashable, Sendable {
    public let snapshot: WidgetSnapshot
    public let week: WeekSummary?

    public init(snapshot: WidgetSnapshot, week: WeekSummary?) {
        self.snapshot = snapshot
        self.week = week
    }
}

/// How the hub writes a time. Handed in rather than owned, because the app formats in the
/// reader's zone with its own formatters and a test wants something it can read.
public struct HubClock {
    /// A day and a time: "Sun, Sep 21 · 10:00 AM".
    public let kickoff: (Date) -> String
    /// A time alone, for a day the sentence has already named: "8:15 PM".
    public let time: (Date) -> String

    public init(kickoff: @escaping (Date) -> String, time: @escaping (Date) -> String) {
        self.kickoff = kickoff
        self.time = time
    }
}

public enum Hub {
    // MARK: Pools

    /// The entries that have not saved a full five. Five slots is five picks: the snapshot only
    /// holds a slot for a pick that exists, hidden or not, and never for a rank nobody took.
    public static func owing(_ pool: HubPool) -> [WidgetEntry] {
        pool.snapshot.entries.filter { $0.slots.count < Scoring.maxPicks }
    }

    /// Games this week that had not kicked off when bootstrap was asked.
    static func openGames(_ pool: HubPool) -> Int {
        guard let week = pool.week else { return 0 }
        return max(week.gameCount - week.lockedCount, 0)
    }

    public static func attention(pool: HubPool) -> HubAttention {
        // Owing picks with no game left to pick is a missed week, not a task — nothing on the
        // card can be done about it, so it must not be shouted about.
        if !owing(pool).isEmpty, openGames(pool) > 0 { return .needsYou }
        if pool.snapshot.entries.contains(where: { $0.liveCount > 0 }) { return .live }
        if let week = pool.week, week.gameCount > 0, week.finalCount >= week.gameCount { return .done }
        return .waiting
    }

    /**
     When the picks are due, said the way somebody would say it across a room.

     "Tonight at 8:15" is what a person hears; "Thu, Sep 18 · 8:15 PM" is what a calendar says.
     The first is used when the day is today or tomorrow, because that is when the day is obvious
     and the time is the whole message. Once a game has kicked off the deadline has already passed
     for that game and the honest thing to say is how many are still open.
     */
    public static func deadline(pool: HubPool, now: Date, calendar: Calendar = .current, clock: HubClock) -> String? {
        guard let week = pool.week, week.gameCount > 0, week.lockedCount < week.gameCount else { return nil }
        if week.lockedCount > 0 {
            let open = week.gameCount - week.lockedCount
            return open == 1 ? "1 game still open" : "\(open) games still open"
        }
        let kickoff = week.firstKickoff
        if kickoff <= now { return "due now" }
        if calendar.isDate(kickoff, inSameDayAs: now) {
            let evening = calendar.component(.hour, from: kickoff) >= 17
            return "due \(evening ? "tonight" : "today") · \(clock.time(kickoff))"
        }
        if let tomorrow = calendar.date(byAdding: .day, value: 1, to: now), calendar.isDate(kickoff, inSameDayAs: tomorrow) {
            return "due tomorrow · \(clock.time(kickoff))"
        }
        return "due \(clock.kickoff(kickoff))"
    }

    /// The line under the pool's name: which week, and the one thing about it worth knowing.
    public static func headline(pool: HubPool, now: Date, calendar: Calendar = .current, clock: HubClock) -> String {
        let week = "Week \(pool.snapshot.week)"
        switch attention(pool: pool) {
        case .needsYou:
            return "\(week) · picks \(deadline(pool: pool, now: now, calendar: calendar, clock: clock) ?? "due")"
        case .live:
            return "\(week) · games on now"
        case .done:
            return "\(week) · final"
        case .waiting:
            guard let summary = pool.week, summary.gameCount > 0 else { return week }
            if summary.lockedCount == 0 { return "\(week) · first game \(clock.kickoff(summary.firstKickoff))" }
            return "\(week) · \(summary.finalCount) of \(summary.gameCount) final"
        }
    }

    /// Who still owes picks, as a sentence — the same one the pool's own home says.
    public static func owingLine(pool: HubPool) -> String? {
        let owing = owing(pool)
        guard !owing.isEmpty else { return nil }
        let all = pool.snapshot.entries.count
        if all <= 1 { return "Your picks aren't in yet." }
        if owing.count == all { return "None of your \(all) entries have picked yet." }
        return "\(Names.list(owing.map(\.name))) still \(owing.count == 1 ? "needs" : "need") picks."
    }

    /**
     Five places for a row, from an entry's slots.

     The board already knows how to draw five places that fill in — `PickSlotRow` — and it reads
     `PickSlot`. A snapshot reads `WeekActivity.Slot`, which is the same five facts in the shape a
     lock screen wants. This is the walk back: a rank with no slot is a rank nobody took, a slot
     with no team is a pick still secret, and a settled slot carries what it banked.
     */
    public static func pickSlots(_ slots: [WeekActivity.Slot]) -> [PickSlot] {
        let byRank = Dictionary(slots.map { ($0.rank, $0) }, uniquingKeysWith: { a, _ in a })
        return Scoring.allRanks.map { rank in
            guard let slot = byRank[rank] else { return .empty(rank: rank) }
            guard let team = slot.team else { return .hidden(rank: rank) }
            let outcome: Outcome = switch slot.state {
            case .won: .win
            case .lost: .loss
            case .tied: .tie
            case .waiting, .live: .pending
            }
            let points = slot.state == .won ? slot.stake : 0
            // The game id is not in a slot and nothing that draws a pick reads it; the rank is the
            // identity a row uses.
            return .taken(ScoredPick(gameId: "", team: team, rank: rank, points: points, outcome: outcome))
        }
    }

    // MARK: Cards

    public static func attention(card: ScrambleCard) -> HubAttention {
        if card.isComplete { return .done }
        // A stroke on any hole is a round under way; a card with names on it and nothing else is
        // Saturday's plan, not Saturday.
        if card.holes.contains(where: { !$0.strokes.isEmpty }) { return .live }
        return .waiting
    }

    public static func headline(card: ScrambleCard) -> String {
        switch attention(card: card) {
        case .done:
            return "Final · \(ScrambleTally.toParText(card.toPar)) · \(card.strokesTaken) strokes"
        case .live:
            if card.throughHole == 0 { return "Playing hole \(card.currentHole)" }
            return "Through \(card.throughHole) of \(card.holeCount) · \(ScrambleTally.toParText(card.toPar))"
        case .waiting, .needsYou:
            return "Not started · \(card.players.count) players"
        }
    }
}
