import Foundation

// The API contract, mirrored from shared/api.ts. Field names match the JSON exactly so the
// decoder needs no key mapping; when the Worker gains a field, add it here as an optional.

public enum GameStatus: String, Codable, Sendable {
    case upcoming, live, final
}

public struct Game: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let season: Int
    public let week: Int
    public let kickoffAt: Date
    public let away: String
    public let home: String
    public let neutral: Bool
    public let venue: String?
    /// A team abbreviation, "TIE", or nil while the game is undecided.
    public let winner: String?
    public let awayScore: Int?
    public let homeScore: Int?
    /// Whether the game had kicked off at the server's `now`. The client re-derives this from
    /// `kickoffAt` as time passes (see `WeekLogic`).
    public let locked: Bool
    public let status: GameStatus

    public init(id: String, season: Int, week: Int, kickoffAt: Date, away: String, home: String, neutral: Bool, venue: String?, winner: String?, awayScore: Int?, homeScore: Int?, locked: Bool, status: GameStatus) {
        self.id = id; self.season = season; self.week = week; self.kickoffAt = kickoffAt; self.away = away; self.home = home
        self.neutral = neutral; self.venue = venue; self.winner = winner; self.awayScore = awayScore; self.homeScore = homeScore
        self.locked = locked; self.status = status
    }

    public func opponent(of team: String) -> String { team == away ? home : away }
    public func involves(_ team: String) -> Bool { team == away || team == home }
}

public struct Pick: Codable, Hashable, Sendable, Identifiable {
    public let gameId: String
    public let team: String
    public let rank: Int
    public var id: String { gameId }

    public init(gameId: String, team: String, rank: Int) {
        self.gameId = gameId; self.team = team; self.rank = rank
    }
}

public struct Player: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public init(id: String, name: String) { self.id = id; self.name = name }
}

/// A player as everyone sees them, plus whether a device has claimed the name.
public struct RosterPlayer: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let claimed: Bool
    public var player: Player { Player(id: id, name: name) }
}

public struct WeekSummary: Codable, Hashable, Sendable, Identifiable {
    public let week: Int
    public let firstKickoff: Date
    public let lastKickoff: Date
    public let gameCount: Int
    public let lockedCount: Int
    public let finalCount: Int
    public var id: Int { week }
}

public struct BootstrapResponse: Codable, Sendable {
    public let now: Date
    public let build: String
    public let season: Int
    public let poolName: String
    /// Week where picking should happen right now.
    public let currentWeek: Int
    /// Latest week with started games — the results view default.
    public let boardWeek: Int
    public let weeks: [WeekSummary]
    public let players: [RosterPlayer]
    public let me: Player?
    public let account: Player?
    public let myEntries: [Player]?
    /// Your own claim code, for adding another device. Only sent to an authenticated device.
    public let myCode: String?
    /// How many passkeys this identity has for this host — 0 means we can offer to add one.
    public let myPasskeys: Int?

    public var maxWeek: Int { weeks.map(\.week).max() ?? WeekLogic.weeks }
}

public struct CreatePlayerResponse: Codable, Sendable {
    public let player: Player
    public let created: Bool
    /// Present when this request earned the device its identity; store it, it is not shown again.
    public let token: String?
    /// The code that claims this name on another device.
    public let code: String?
}

public struct ClaimResponse: Codable, Sendable {
    public let player: Player
    public let token: String
    public let code: String
}

public struct EntryResponse: Codable, Sendable {
    public let player: Player
}

public struct PickCount: Codable, Hashable, Sendable {
    public let away: Int
    public let home: Int
    public var total: Int { away + home }
    public init(away: Int, home: Int) { self.away = away; self.home = home }
}

public struct WeekResponse: Codable, Sendable {
    public let now: Date
    public let week: Int
    public let games: [Game]
    public let myPicks: [Pick]
    /// Pick tallies per game, only for games that have kicked off.
    public let pickCounts: [String: PickCount]
    /// Players with at least one pick this week.
    public let submitted: Int

    public init(now: Date, week: Int, games: [Game], myPicks: [Pick], pickCounts: [String: PickCount], submitted: Int) {
        self.now = now; self.week = week; self.games = games; self.myPicks = myPicks; self.pickCounts = pickCounts; self.submitted = submitted
    }
}

public struct PutPicksRequest: Codable, Sendable {
    public let picks: [Pick]
    public init(picks: [Pick]) { self.picks = picks }
}

public struct PutPicksResponse: Codable, Sendable {
    public let now: Date
    public let picks: [Pick]
}

public enum Outcome: String, Codable, Sendable {
    case win, loss, tie, pending
}

public struct ScoredPick: Codable, Hashable, Sendable, Identifiable {
    public let gameId: String
    public let team: String
    public let rank: Int
    public let points: Int
    public let outcome: Outcome
    public var id: String { gameId }
}

public protocol BoardRow: Identifiable {
    var playerId: String { get }
    var name: String { get }
    var isMe: Bool { get }
    var place: Int { get }
    var points: Int { get }
    var correct: Int { get }
    var fives: Int { get }
    var possible: Int { get }
}

public struct WeekRow: Codable, Hashable, Sendable, BoardRow {
    public let playerId: String
    public let name: String
    public let isMe: Bool
    public let place: Int
    public let points: Int
    public let correct: Int
    public let fives: Int
    public let picksMade: Int
    /// Points still reachable this week (current points + pending picks).
    public let possible: Int
    /// Only picks whose game has kicked off, plus all of the requester's own.
    public let picks: [ScoredPick]
    public var id: String { playerId }
}

public struct WeekBoardResponse: Codable, Sendable {
    public let now: Date
    public let week: Int
    public let gameCount: Int
    public let finalCount: Int
    public let lockedCount: Int
    public let rows: [WeekRow]
}

public struct BestWeek: Codable, Hashable, Sendable {
    public let week: Int
    public let points: Int
}

public struct SeasonRow: Codable, Hashable, Sendable, BoardRow {
    public let playerId: String
    public let name: String
    public let isMe: Bool
    public let place: Int
    public let points: Int
    public let correct: Int
    public let fives: Int
    /// Points banked plus everything still live in undecided games.
    public let possible: Int
    public let weeksPlayed: Int
    public let bestWeek: BestWeek?
    /// Keyed by week as a string, because that is what JSON objects have for keys.
    public let byWeek: [String: Int]
    public var id: String { playerId }

    public func points(inWeek week: Int) -> Int { byWeek[String(week)] ?? 0 }
}

public struct SeasonBoardResponse: Codable, Sendable {
    public let now: Date
    public let season: Int
    public let throughWeek: Int
    public let rows: [SeasonRow]
}

public struct SessionResponse: Codable, Sendable {
    public let player: Player
}

public struct OkResponse: Codable, Sendable {
    public let ok: Bool
}

public struct ApiErrorBody: Codable, Sendable {
    public struct Inner: Codable, Sendable {
        public let code: String
        public let message: String
        public let details: JSONValue?
    }
    public let error: Inner
}
