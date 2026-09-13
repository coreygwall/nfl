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

    public init(week: Int, entryName: String, poolName: String) {
        self.week = week
        self.entryName = entryName
        self.poolName = poolName
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

        public init(slots: [WeekActivity.Slot], points: Int, possible: Int, place: Int? = nil, field: Int? = nil) {
            self.slots = slots
            self.points = points
            self.possible = possible
            self.place = place
            self.field = field
        }

        /// Left to right as drawn: the five-pointer first, the one-pointer last.
        public var inDisplayOrder: [WeekActivity.Slot] { slots.sorted { $0.rank < $1.rank } }

        /// Nothing left to play. The activity ends shortly after this goes true.
        public var isFinished: Bool { slots.allSatisfy { $0.state != .waiting && $0.state != .live } }

        /// A short line for the places too small to draw five slots, like the Dynamic Island.
        public var summary: String {
            let won = slots.filter { $0.state == .won }.count
            let done = slots.filter { $0.state != .waiting && $0.state != .live }.count
            return "\(won)/\(done) · \(points) pts"
        }
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

        return WeekActivityAttributes.ContentState(
            slots: slots,
            points: points,
            possible: possible,
            place: place,
            field: field
        )
    }
}

// ActivityKit exists on iOS and not on the Mac, where `swift test` runs this package. The types
// above are plain Codable structs so they compile either way; only the conformance is conditional.
#if canImport(ActivityKit)
import ActivityKit

extension WeekActivityAttributes: ActivityAttributes {}
#endif
