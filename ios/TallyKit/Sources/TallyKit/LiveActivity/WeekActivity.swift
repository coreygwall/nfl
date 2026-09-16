import Foundation

/**
 What a week looks like on a lock screen.

 The app starts one of these on a Sunday morning and the Worker pushes it updates as games finish.
 It lives here in TallyKit rather than in either target because both of them need the type: the app
 to start and update it, the widget extension to draw it. The shapes are deliberately small and
 already-rendered — a Live Activity payload has a hard size limit, and a widget process should not
 be doing arithmetic.
 */
public enum WeekActivity {
    /// One of the five, drawn in its own place. Ordered 5 down to 1, left to right, so the row
    /// reads the way the picks were ranked: the surest thing first.
    public struct Slot: Codable, Hashable, Sendable {
        /// 1 is the most confident pick, worth 5.
        public let rank: Int
        /// Nil while a pick is still secret — nobody has kicked off, so the rank shows alone.
        public let team: String?
        public let state: State

        public init(rank: Int, team: String?, state: State) {
            self.rank = rank
            self.team = team
            self.state = state
        }

        /// What the points are worth, which is what the slot shows when it has not settled.
        public var stake: Int { Scoring.points(forRank: rank) }
    }

    /**
     Where a week has got to, from one entry's seat.

     Five states rather than "running" and "over", because the two in the middle are the ones a
     lock screen is actually for. `between` is a Sunday at half past three with the early games in
     and the late ones not yet on. `watching` is the hour after your last pick has played, when
     your points are fixed and your place is not. Both used to end the activity; both are exactly
     when somebody wants it.
     */
    public enum Phase: String, Codable, Hashable, Sendable {
        /// Picks are in, nothing has kicked off.
        case locked
        /// At least one of their games is on.
        case live
        /// None of theirs is on, and some have not played. The gap between slates.
        case between
        /// All five have settled. The week has not, so their place can still move.
        case watching
        /// The week is over for everyone.
        case final
    }

    public enum State: String, Codable, Hashable, Sendable {
        /// Not kicked off.
        case waiting
        /// Under way, and could still go either way.
        case live
        case won
        case lost
        case tied
    }
}

/// The parts of a Live Activity that never change once it starts.
public struct WeekActivityAttributes: Codable, Hashable, Sendable {
    public let week: Int
    /// Which entry this is, so someone running three of them can tell the lock screens apart.
    public let entryName: String
    public let poolName: String
    /// The entry's id. `entryName` is what a person reads; this is what the app matches on when it
    /// relaunches mid-Sunday and has to work out which of the running activities is which. Two
    /// entries in one household can share a first name — they cannot share an id.
    public let entryId: String

    public init(week: Int, entryName: String, poolName: String, entryId: String = "") {
        self.week = week
        self.entryName = entryName
        self.poolName = poolName
        self.entryId = entryId
    }

    /// The parts that change as the week goes, pushed from the Worker.
    public struct ContentState: Codable, Hashable, Sendable {
        /// Rank 1 first. The widget reverses it, because 5-to-1 left to right is how the picks read.
        public let slots: [WeekActivity.Slot]
        /// Points banked so far.
        public let points: Int
        /// Still available from games that have not finished.
        public let possible: Int
        /// Where they stand, when there is a board worth quoting. Nil early on, when it is noise.
        public let place: Int?
        public let field: Int?
        /// Whether the *week* is over, which is a different question from whether this entry's
        /// five have settled. Somebody whose last pick played in the early game is done at four
        /// o'clock and their position is not: it moves under them all afternoon as everyone else
        /// finishes. The activity has to stay up for that, and only this says when it may stop.
        public let weekFinal: Bool
        /**
         When this entry's next game starts, if one has not — Unix seconds, deliberately not a
         `Date`.

         This shape is also a push payload. ActivityKit decodes `content-state` with a stock
         `JSONDecoder`, whose default strategy reads a `Date` as seconds since *2001*, so a Worker
         that sent the obvious ISO-8601 string — or the obvious Unix timestamp — would have its
         updates rejected, or silently land in the wrong century, with nothing on either side to
         say why. An `Int` cannot be misread.

         It is what makes a Sunday afternoon with nothing currently live still worth a glance:
         "back at 4:05" rather than silence.
         */
        public let nextKickoffEpoch: Int?

        /// The kickoff as a date, for the one place that formats it.
        public var nextKickoff: Date? { nextKickoffEpoch.map { Date(timeIntervalSince1970: TimeInterval($0)) } }

        public init(
            slots: [WeekActivity.Slot],
            points: Int,
            possible: Int,
            place: Int? = nil,
            field: Int? = nil,
            weekFinal: Bool = false,
            nextKickoffEpoch: Int? = nil
        ) {
            self.slots = slots
            self.points = points
            self.possible = possible
            self.place = place
            self.field = field
            self.weekFinal = weekFinal
            self.nextKickoffEpoch = nextKickoffEpoch
        }

        /// Left to right as drawn: the five-pointer first, the one-pointer last.
        public var inDisplayOrder: [WeekActivity.Slot] { slots.sorted { $0.rank < $1.rank } }

        /// Every one of this entry's five has a result. Their *points* cannot move after this;
        /// their *place* very much can, which is why this is not the same as being over.
        public var picksSettled: Bool { slots.allSatisfy { $0.state != .waiting && $0.state != .live } }

        /// Where the week has got to, from this entry's seat. The view draws one of five things
        /// and this is the only place that decides which, so the rule is testable without a
        /// simulator — which matters, because a lock screen is the one surface nobody can watch
        /// while they work.
        public var phase: WeekActivity.Phase {
            if weekFinal { return .final }
            if slots.contains(where: { $0.state == .live }) { return .live }
            if picksSettled { return .watching }
            // Nothing of theirs is on. Either it has not started at all, or they are between
            // slates — the Sunday afternoon gap that the old build treated as a reason to pack up.
            return slots.contains(where: { $0.state != .waiting }) ? .between : .locked
        }

        /// Games of theirs still to come or still running, and what those are worth. The reason
        /// to keep watching, stated as a pair because "3 games" and "9 points" answer different
        /// questions.
        public var outstanding: (games: Int, points: Int) {
            let left = slots.filter { $0.state == .waiting || $0.state == .live }
            return (left.count, left.reduce(0) { $0 + $1.stake })
        }

        public var wonCount: Int { slots.filter { $0.state == .won }.count }
        public var settledCount: Int { slots.filter { $0.state != .waiting && $0.state != .live }.count }

        /// A short line for the places too small to draw five slots, like the Dynamic Island.
        public var summary: String { "\(wonCount)/\(settledCount) · \(points) pts" }

        /**
         The line under the row, which is where the five phases actually differ.

         Each one answers the question that phase raises and nothing else: when does this start,
         what is still live, when is the next one, can my position still move, and how did it end.
         It lives here rather than in the widget so the lock screen and the picks tab say the same
         thing in the same words — a Sunday afternoon is one situation, not two. `clock` formats a
         kickoff in the reader's own zone. Staleness outranks everything: it is a statement about
         whether the rest can be believed.
         */
        public func statusLine(stale: Bool = false, clock: (Date) -> String) -> String {
            if stale { return "Scores may be behind." }
            let left = outstanding
            switch phase {
            case .locked:
                guard let kickoff = nextKickoff else { return "Picks are in." }
                return "Picks are in — first game \(clock(kickoff))."
            case .live:
                let live = slots.filter { $0.state == .live }.count
                let onNow = live == 1 ? "1 game on now" : "\(live) games on now"
                return "\(onNow) · \(left.points) still to play for."
            case .between:
                guard let kickoff = nextKickoff else {
                    return "\(Self.games(left.games)) left, worth \(left.points)."
                }
                return "Back at \(clock(kickoff)) · \(Self.games(left.games)) left, worth \(left.points)."
            case .watching:
                // Their five are done and the week is not. Saying so is the only honest thing
                // here: the points have stopped moving and the place has not.
                return "All five in. Your place can still move."
            case .final:
                guard let place, let field, field > 1 else {
                    return "That is the week — \(Self.points(points))."
                }
                return place == 1
                    ? "You won the week on \(Self.points(points))."
                    : "\(Scoring.ordinal(place)) of \(field) on \(Self.points(points))."
            }
        }

        private static func games(_ n: Int) -> String { n == 1 ? "1 game" : "\(n) games" }
        private static func points(_ n: Int) -> String { n == 1 ? "1 point" : "\(n) points" }
    }
}

extension WeekActivityAttributes.ContentState {
    /**
     Build the state from the week the app already has. Everything the widget draws is worked out
     here, in the app, so the widget process does nothing but lay out what it is handed — and so
     the Worker, pushing an update later, has one shape to fill in rather than a set of rules to
     reimplement.

     `hiddenRanks` are picks whose game has not kicked off: the rank is public, the team is not.
     They take their place in the row with no badge, which is the same thing the board does.
     */
    public static func from(
        picks: [Pick],
        games: [Game],
        hiddenRanks: [Int] = [],
        now: Date,
        place: Int? = nil,
        field: Int? = nil
    ) -> WeekActivityAttributes.ContentState {
        let byId = Dictionary(games.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let byRank = Dictionary(picks.map { ($0.rank, $0) }, uniquingKeysWith: { a, _ in a })
        let hidden = Set(hiddenRanks)
        var points = 0
        var possible = 0
        var slots: [WeekActivity.Slot] = []

        for rank in Scoring.allRanks {
            guard let pick = byRank[rank] else {
                // A rank whose team is still secret is a slot; a rank nobody took is not.
                if hidden.contains(rank) {
                    possible += Scoring.points(forRank: rank)
                    slots.append(WeekActivity.Slot(rank: rank, team: nil, state: .waiting))
                }
                continue
            }
            let game = byId[pick.gameId]
            let state: WeekActivity.State
            if let winner = game?.winner {
                state = winner == "TIE" ? .tied : winner == pick.team ? .won : .lost
            } else {
                state = (game.map { $0.kickoffAt <= now } ?? false) ? .live : .waiting
            }
            if state == .won { points += Scoring.points(forRank: rank) }
            if state == .waiting || state == .live { possible += Scoring.points(forRank: rank) }
            slots.append(WeekActivity.Slot(rank: rank, team: pick.team, state: state))
        }

        // The week is over when every game in it has a result — not when this entry's five do.
        // An empty slate is not a finished one, or a week the app has no schedule for would land
        // on the lock screen already declaring itself done.
        let weekFinal = !games.isEmpty && games.allSatisfy { $0.winner != nil }

        // The next of *their* games, which is the only kickoff worth putting on screen. The next
        // game in the league is not news to somebody who has no pick in it.
        let mine = Set(picks.map(\.gameId))
        let nextKickoff = games
            .filter { mine.contains($0.id) && $0.winner == nil && $0.kickoffAt > now }
            .map(\.kickoffAt)
            .min()

        return WeekActivityAttributes.ContentState(
            slots: slots,
            points: points,
            possible: possible,
            place: place,
            field: field,
            weekFinal: weekFinal,
            nextKickoffEpoch: nextKickoff.map { Int($0.timeIntervalSince1970) }
        )
    }
}

// ActivityKit imports on the Mac, where `swift test` runs this package, but every type in it is
// marked unavailable there — so the guard has to be the platform, not `canImport`. The types above
// are plain Codable structs and compile either way; only the conformance is conditional.
#if os(iOS)
import ActivityKit

extension WeekActivityAttributes: ActivityAttributes {}
#endif
