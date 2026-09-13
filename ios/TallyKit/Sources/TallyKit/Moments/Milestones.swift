import Foundation

/**
 Noticing that something happened.

 The app reloads a week every time it comes forward, and most of those reloads say nothing new. A
 few say a great deal: a pick came in, the week finished, you went top of the table. This works out
 which, by keeping the last thing it saw and comparing.

 It is deliberately not a diff of everything — only of the handful of things worth a buzz. Anything
 broader and the phone would go off every time a scoreline moved.
 */
public enum Milestone: Equatable, Sendable {
    /// One of my picks came in.
    case pickWon(team: String, points: Int)
    /// One of my picks went down.
    case pickLost(team: String)
    /// The week finished and I took it. `shared` when someone tied me at the top.
    case wonWeek(week: Int, points: Int, shared: Bool)
    /// The week finished and I did not take it.
    case finishedWeek(week: Int, place: Int, points: Int)
    /// Top of the season table, having not been before.
    case tookSeasonLead(points: Int)

    /// Whether this is worth interrupting for — confetti and a card, rather than a buzz in passing.
    public var isCelebration: Bool {
        switch self {
        case .wonWeek, .tookSeasonLead: true
        case .pickWon, .pickLost, .finishedWeek: false
        }
    }
}

/// Everything about one week that the app watches for changes. Small enough to keep on disk.
public struct WeekWatch: Codable, Equatable, Sendable {
    public let week: Int
    /// Game id to outcome, for my picks only. Outcomes are `Outcome`'s raw values.
    public let outcomes: [String: String]
    public let points: Int
    public let place: Int
    /// Every game in the week has a result.
    public let finished: Bool
    /// How many entries were in it, so "1st of 9" can be said.
    public let field: Int
    /// Somebody else finished level at the top. A shared win is still a win, and saying so is
    /// better than a celebration the other person can contradict.
    public let sharedFirst: Bool

    public init(week: Int, outcomes: [String: String], points: Int, place: Int, finished: Bool, field: Int, sharedFirst: Bool = false) {
        self.week = week
        self.outcomes = outcomes
        self.points = points
        self.place = place
        self.finished = finished
        self.field = field
        self.sharedFirst = sharedFirst
    }

    /// Picks whose game has not been decided yet, which is what "settled since" is measured against.
    private static let unsettled: Set<String> = ["pending", "live"]

    /**
     What happened between two looks at the same week.

     A first look reports nothing. That matters: opening the app for the first time on a Sunday
     evening should not replay the whole afternoon in haptics — it should set a baseline and let the
     next result be the news. The one exception is a week that finished, which is worth hearing
     about however late you arrive, and is handled by the caller through `celebrated`.
     */
    public func milestones(
        since old: WeekWatch?,
        teamsByGame: [String: String] = [:],
        ranksByGame: [String: Int] = [:]
    ) -> [Milestone] {
        guard let old, old.week == week else { return [] }
        var found: [Milestone] = []

        // Results first, most confident pick first, so three landing at once read as a run in the
        // order they were ranked rather than in whatever order a dictionary came out in.
        let settled = outcomes
            .filter { WeekWatch.unsettled.contains(old.outcomes[$0.key] ?? "pending") && !WeekWatch.unsettled.contains($0.value) }
            .sorted { (ranksByGame[$0.key] ?? .max, $0.key) < (ranksByGame[$1.key] ?? .max, $1.key) }
        for (gameId, outcome) in settled {
            let team = teamsByGame[gameId] ?? ""
            switch outcome {
            // What this pick was worth, not what the whole reload added — two landing together
            // would otherwise both claim the pair's points.
            case "win": found.append(.pickWon(team: team, points: ranksByGame[gameId].map(Scoring.points(forRank:)) ?? 0))
            case "loss": found.append(.pickLost(team: team))
            default: break // A tie earns nothing and costs nothing; it is not news.
            }
        }

        if finished, !old.finished {
            if place == 1 {
                found.append(.wonWeek(week: week, points: points, shared: sharedFirst))
            } else {
                found.append(.finishedWeek(week: week, place: place, points: points))
            }
        }
        return found
    }
}

/**
 What has already been made a fuss of.

 The big moments are worth exactly one celebration each. Without this, every reload of a finished
 week would throw confetti again — which is the difference between a nice touch and an app someone
 turns the sound off for.
 */
public struct CelebrationLog: Codable, Equatable, Sendable {
    private var keys: Set<String>

    public init(keys: Set<String> = []) { self.keys = keys }

    /// True the first time only. Records the key as a side effect, which is the point.
    public mutating func claim(_ key: String) -> Bool {
        guard !keys.contains(key) else { return false }
        keys.insert(key)
        return true
    }

    public func has(_ key: String) -> Bool { keys.contains(key) }

    /// A stable name for a moment, so the same week cannot be celebrated twice.
    public static func key(playerId: String, _ what: String) -> String { "\(playerId):\(what)" }
}

/**
 Where the last look and the fuss already made are kept.

 On the phone, because that is where it belongs: whether *this* device has already thrown confetti
 at you is not the server's business, and a week you celebrated on your phone should not be
 celebrated again on your iPad — but it doing so is a small enough wrong to be worth the simplicity.
 */
public enum MilestoneStore {
    private static func watchKey(_ playerId: String, _ week: Int) -> String { "tally.watch.\(playerId).\(week)" }
    private static let celebratedKey = "tally.celebrated"

    public static func lastSeen(playerId: String, week: Int, defaults: UserDefaults = .standard) -> WeekWatch? {
        guard let data = defaults.data(forKey: watchKey(playerId, week)) else { return nil }
        return try? JSONDecoder().decode(WeekWatch.self, from: data)
    }

    public static func record(_ watch: WeekWatch, playerId: String, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(watch) else { return }
        defaults.set(data, forKey: watchKey(playerId, watch.week))
    }

    public static func celebrations(defaults: UserDefaults = .standard) -> CelebrationLog {
        guard let data = defaults.data(forKey: celebratedKey),
              let log = try? JSONDecoder().decode(CelebrationLog.self, from: data)
        else { return CelebrationLog() }
        return log
    }

    private static func seasonKey(_ playerId: String) -> String { "tally.seasonPlace.\(playerId)" }

    /// Where this entry stood in the season table last time we looked, or nil on a first look.
    public static func lastSeasonPlace(playerId: String, defaults: UserDefaults = .standard) -> Int? {
        let stored = defaults.integer(forKey: seasonKey(playerId))
        return stored > 0 ? stored : nil
    }

    /// Returns true when this is a climb to the top from somewhere else — the one season change
    /// worth a buzz. Records the new place either way.
    public static func noteSeasonPlace(_ place: Int, playerId: String, defaults: UserDefaults = .standard) -> Bool {
        let before = lastSeasonPlace(playerId: playerId, defaults: defaults)
        defaults.set(place, forKey: seasonKey(playerId))
        guard let before else { return false } // A first look sets the baseline and says nothing.
        return place == 1 && before != 1
    }

    /// Claims a moment and writes the log back. True the first time only, on this device.
    public static func claimCelebration(_ key: String, defaults: UserDefaults = .standard) -> Bool {
        var log = celebrations(defaults: defaults)
        guard log.claim(key) else { return false }
        if let data = try? JSONEncoder().encode(log) { defaults.set(data, forKey: celebratedKey) }
        return true
    }
}
