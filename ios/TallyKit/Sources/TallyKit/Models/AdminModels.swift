import Foundation

// The commissioner's side of the API. Everything here rides behind the `x-admin-pin` header.

public struct AdminPick: Codable, Hashable, Sendable, Identifiable {
    public let playerId: String
    public let name: String
    public let team: String
    public let rank: Int
    public var id: String { playerId }
}

public struct AdminGame: Codable, Hashable, Sendable, Identifiable {
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
    public let picks: [AdminPick]

    public var game: Game {
        Game(id: id, season: season, week: week, kickoffAt: kickoffAt, away: away, home: home, neutral: neutral, venue: venue,
             winner: winner, awayScore: awayScore, homeScore: homeScore, locked: locked, status: status)
    }
}

public struct AdminWeekResponse: Codable, Sendable {
    public let now: Date
    public let week: Int
    public let games: [AdminGame]
    public let players: [Player]
}

public struct AdminSetResultRequest: Codable, Sendable {
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

public struct AdminPlayer: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let createdAt: Date
    public let lastSeenAt: Date
    public let picksCount: Int
    public let weeksPlayed: Int
    /// How many devices are signed in as this player.
    public let devices: Int
    /// Of those, how many the commissioner put on their own phone.
    public let adminDevices: Int
    /// The code that claims this name on a new device; nil for names created before codes.
    public let code: String?
    /// The commissioner's checkmark — squared away for the season.
    public let ready: Bool
}

public struct AdminPlayersResponse: Codable, Sendable {
    public let players: [AdminPlayer]
}

public struct AdminDeviceResponse: Codable, Sendable {
    public let player: Player
    public let token: String
}

public struct AdminResetAccessResponse: Codable, Sendable {
    public let player: Player
    public let code: String
}

public struct AdminReadyResponse: Codable, Sendable {
    public let ready: Bool
}

public struct AdminPullConflict: Codable, Hashable, Sendable, Identifiable {
    public let gameId: String
    public let recorded: String
    public let feed: String
    public let awayScore: Int
    public let homeScore: Int
    public var id: String { gameId }
}

public struct AdminPullResultsResponse: Codable, Sendable {
    public let ok: Bool
    public let reason: String?
    public let applied: Int
    public let confirmed: Int
    public let pending: Int
    public let conflicts: [AdminPullConflict]
    public let syncedAt: Date
}

public struct AdminStatus: Codable, Sendable {
    public let now: Date
    public let build: String
    public let scheduleVersion: String
    public let scheduleSyncedAt: Date?
    public let scheduleLastChanges: Int?
    public let scheduleSyncError: String?
    public let resultsSyncedAt: Date?
    public let resultsSyncError: String?
}

/// `/admin/sync-schedule` answers differently for the bundled and the remote source.
public struct AdminSyncResult: Codable, Sendable {
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
