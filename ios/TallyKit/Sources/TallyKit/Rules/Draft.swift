import Foundation

/**
 The picks a player is putting together for a week, before they are saved. Mirrors
 `src/lib/draft.ts`: a set of selections (game → team) and the order they will be ranked in,
 most confident first. Kept on the phone per player and week, so a killed app loses nothing.
 */
public struct Draft: Codable, Hashable, Sendable {
    /// gameId → picked team (unlocked games only).
    public var selections: [String: String]
    /// Rank order of the selected gameIds (most confident first).
    public var order: [String]

    public static let empty = Draft(selections: [:], order: [])

    public init(selections: [String: String], order: [String]) {
        self.selections = selections
        self.order = order
    }

    public var isEmpty: Bool { order.isEmpty }

    /// Tapping a team: picks it, swaps to it, or (tapping it again) clears the game.
    public func toggling(gameId: String, team: String) -> Draft {
        var next = self
        let current = selections[gameId]
        if current == team {
            next.selections.removeValue(forKey: gameId)
            next.order.removeAll { $0 == gameId }
        } else {
            next.selections[gameId] = team
            if current == nil {
                next.order.removeAll { $0 == gameId }
                next.order.append(gameId)
            }
        }
        return next
    }

    public func removing(gameId: String) -> Draft {
        var next = self
        next.selections.removeValue(forKey: gameId)
        next.order.removeAll { $0 == gameId }
        return next
    }

    public func moving(from: Int, to: Int) -> Draft {
        guard to >= 0, to < order.count, from >= 0, from < order.count, from != to else { return self }
        var next = self
        let item = next.order.remove(at: from)
        next.order.insert(item, at: to)
        return next
    }
}

/// Per player, per week, on this phone.
public enum DraftStore {
    private static func key(_ playerId: String, _ week: Int) -> String { "tally.draft.\(playerId).\(week)" }

    public static func load(playerId: String, week: Int, defaults: UserDefaults = .standard) -> Draft? {
        guard let data = defaults.data(forKey: key(playerId, week)) else { return nil }
        return try? JSONDecoder().decode(Draft.self, from: data)
    }

    /**
     An empty draft is not a draft — it is the absence of one, so it clears rather than writes.

     This matters more than it looks. Saving picks clears the store and then resets the draft to
     empty, and that reset is itself a change, so it wrote an empty draft straight back over the
     clear. `load` then returned that empty-but-present draft, `seedIfNeeded` took it in preference
     to the picks on the server, and the screen came back with an empty tray — five picks that were
     safely saved, looking lost. Making absence and emptiness the same thing here closes it for
     every caller rather than for the one that happened to trip it.
     */
    public static func save(_ draft: Draft, playerId: String, week: Int, defaults: UserDefaults = .standard) {
        guard !draft.isEmpty else { return clear(playerId: playerId, week: week, defaults: defaults) }
        if let data = try? JSONEncoder().encode(draft) { defaults.set(data, forKey: key(playerId, week)) }
    }

    public static func clear(playerId: String, week: Int, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key(playerId, week))
    }
}
