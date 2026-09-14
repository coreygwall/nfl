import Foundation

// The two offices.
//
// A *commissioner* runs one pool: its roster, its name, its invite. The *league office* runs the
// results, the schedule and the score feed — one authority for every pool, because every pool
// scores the same games. Both are grants against an account, which is why nothing here carries a
// PIN: the session that holds your picks is the session that holds your keys. The one exception is
// `claimRoles`, which is how an account gets the keys in the first place.

public struct OfficePick: Codable, Hashable, Sendable, Identifiable {
    public let playerId: String
    public let name: String
    public let team: String
    public let rank: Int
    public var id: String { playerId }
}

public struct CommissionerGame: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let season: Int
    public let week: Int
    public let kickoffAt: Date
    public let away: String
    public let home: String
    public let neutral: Bool
    public let venue: String?
    public let winner: String?
    public let awayScore: Int?
    public let homeScore: Int?
    public let locked: Bool
    public let status: GameStatus
    public let picks: [OfficePick]

    public var game: Game {
        Game(id: id, season: season, week: week, kickoffAt: kickoffAt, away: away, home: home, neutral: neutral, venue: venue,
             winner: winner, awayScore: awayScore, homeScore: homeScore, locked: locked, status: status)
    }
}

public struct CommissionerWeekResponse: Codable, Sendable {
    public let now: Date
    public let week: Int
    public let games: [CommissionerGame]
    public let players: [Player]
}

public struct SetResultRequest: Codable, Sendable {
    public let winner: String?
    public let awayScore: Int?
    public let homeScore: Int?
    public init(winner: String?, awayScore: Int? = nil, homeScore: Int? = nil) {
        self.winner = winner; self.awayScore = awayScore; self.homeScore = homeScore
    }

    enum CodingKeys: String, CodingKey { case winner, awayScore, homeScore }

    // `winner: null` clears a result, so it must be written out rather than dropped.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(winner, forKey: .winner)
        try c.encodeIfPresent(awayScore, forKey: .awayScore)
        try c.encodeIfPresent(homeScore, forKey: .homeScore)
    }
}

public struct CommissionerPlayer: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let createdAt: Date
    public let lastSeenAt: Date
    public let picksCount: Int
    public let weeksPlayed: Int
    /// How many devices are signed in as this player.
    public let devices: Int
    /// The code that claims this name on a new device; nil for names created before codes.
    public let code: String?
    /// The commissioner's checkmark — squared away for the season.
    public let ready: Bool
}

public struct CommissionerPlayersResponse: Codable, Sendable {
    public let players: [CommissionerPlayer]
}

public struct ResetAccessResponse: Codable, Sendable {
    public let player: Player
    public let code: String
}

public struct ReadyResponse: Codable, Sendable {
    public let ready: Bool
}

public struct PullConflict: Codable, Hashable, Sendable, Identifiable {
    public let gameId: String
    public let recorded: String
    public let feed: String
    public let awayScore: Int
    public let homeScore: Int
    public var id: String { gameId }
}

public struct PullResultsResponse: Codable, Sendable {
    public let ok: Bool
    public let reason: String?
    public let applied: Int
    public let confirmed: Int
    public let pending: Int
    public let conflicts: [PullConflict]
    public let syncedAt: Date
}

public struct LeagueStatus: Codable, Sendable {
    public let now: Date
    public let build: String
    public let scheduleVersion: String
    public let scheduleSyncedAt: Date?
    public let scheduleLastChanges: Int?
    public let scheduleSyncError: String?
    public let resultsSyncedAt: Date?
    public let resultsSyncError: String?
    public let admins: [RoleHolder]?
}

/// The league office's week: the games and their results, and nobody's picks.
public struct LeagueWeekResponse: Codable, Sendable {
    public let now: Date
    public let week: Int
    public let games: [Game]
}

/// `/league/sync-schedule` answers differently for the bundled and the remote source.
public struct SyncResult: Codable, Sendable {
    public let ok: Bool?
    public let reason: String?
    public let fetched: Int?
    public let updated: Int?
    public let upserted: Int?
    public let version: String?

    public var summary: String {
        if let upserted { return "Loaded the bundled schedule (\(upserted) games)." }
        if ok == false { return reason ?? "The feed was refused." }
        return "Checked \(fetched ?? 0) games, moved \(updated ?? 0)."
    }
}


// MARK: Roles

/// What the signed-in account may open. Both false for a player, which is nearly everyone.
public struct Roles: Codable, Hashable, Sendable {
    public let commissioner: Bool
    public let platformAdmin: Bool
    public init(commissioner: Bool = false, platformAdmin: Bool = false) {
        self.commissioner = commissioner
        self.platformAdmin = platformAdmin
    }

    public static let none = Roles()
}

public struct PoolDTO: Codable, Hashable, Sendable {
    public let id: String
    public let slug: String
    public let name: String
    public let type: String?
}

public struct PoolSummary: Codable, Hashable, Sendable {
    public let id: String
    public let slug: String
    public let name: String
    public let type: String
    public let season: Int
    public let createdAt: Date
}

public struct RoleHolder: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let grantedAt: Date
}

public struct CommissionerOverview: Codable, Sendable {
    public let now: Date
    public let pool: PoolSummary
    public let playerCount: Int
    public let readyCount: Int
    /// Names on the roster that no device has signed in as yet.
    public let unclaimedCount: Int
    public let commissioners: [RoleHolder]
    public let roles: Roles
}

public struct ClaimRolesResponse: Codable, Sendable {
    public let roles: Roles
    public let pool: PoolDTO
    public let commissioners: [RoleHolder]
}

public struct CommissionersResponse: Codable, Sendable {
    public let commissioners: [RoleHolder]
}

public struct PoolResponse: Codable, Sendable {
    public let pool: PoolSummary
}
