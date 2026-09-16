import Foundation

/**
 What the home screen knows.

 A widget process is woken for a fraction of a second, with no session, no network guarantee and no
 memory of last time. So the app leaves it everything already worked out: this is written to the
 shared App Group container on every refresh the app does, and read back by the widget in
 microseconds. That is what makes a widget correct on a phone in a pocket — including one that has
 not been opened since Thursday, where a live fetch would show a placeholder and a spinner.

 The widget *also* refreshes on its own timeline (`WidgetRefresh`), so the snapshot is a floor
 rather than a ceiling: instant and offline-correct, then quietly brought up to date.

 Slots are `WeekActivity.Slot`, deliberately — the lock screen and the home screen say the same
 thing about the same five picks, so they share the vocabulary and the drawing rather than growing
 two of each.
 */
public struct WidgetSnapshot: Codable, Hashable, Sendable {
    public let poolName: String
    public let poolSlug: String
    /// The origin this pool lives on, kept whole so a widget can build a link back into it.
    public let origin: URL
    public let week: Int
    /// When this was written. The widget shows it once it is old enough to be worth doubting.
    public let updatedAt: Date
    public let entries: [WidgetEntry]
    /// First week that counts towards the season, so a widget can say why the season board is empty.
    public let seasonStartsAt: Int

    public init(
        poolName: String,
        poolSlug: String,
        origin: URL,
        week: Int,
        updatedAt: Date,
        entries: [WidgetEntry],
        seasonStartsAt: Int
    ) {
        self.poolName = poolName
        self.poolSlug = poolSlug
        self.origin = origin
        self.week = week
        self.updatedAt = updatedAt
        self.entries = entries
        self.seasonStartsAt = seasonStartsAt
    }

    public func entry(id: String?) -> WidgetEntry? {
        guard let id, let match = entries.first(where: { $0.id == id }) else { return entries.first }
        return match
    }

    /// Past this, a widget says so rather than presenting Thursday's numbers as today's.
    public func isStale(now: Date = Date()) -> Bool {
        now.timeIntervalSince(updatedAt) > 3 * 3600
    }
}

/// One entry's week, as three widgets need it.
public struct WidgetEntry: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String

    // The week
    public let slots: [WeekActivity.Slot]
    public let points: Int
    public let possible: Int
    public let place: Int?
    public let field: Int?
    /// Unix seconds, for the same reason the Live Activity uses them: unambiguous across a wire.
    public let nextKickoffEpoch: Int?
    public let weekTop: [WidgetStanding]

    // The season
    public let seasonPlace: Int?
    public let seasonPoints: Int?
    public let seasonField: Int?
    public let seasonTop: [WidgetStanding]
    /// False before the first counting week, when a table of zeroes is a boast about a race that
    /// has not started.
    public let seasonStarted: Bool

    public init(
        id: String,
        name: String,
        slots: [WeekActivity.Slot],
        points: Int,
        possible: Int,
        place: Int?,
        field: Int?,
        nextKickoffEpoch: Int?,
        weekTop: [WidgetStanding],
        seasonPlace: Int?,
        seasonPoints: Int?,
        seasonField: Int?,
        seasonTop: [WidgetStanding],
        seasonStarted: Bool
    ) {
        self.id = id
        self.name = name
        self.slots = slots
        self.points = points
        self.possible = possible
        self.place = place
        self.field = field
        self.nextKickoffEpoch = nextKickoffEpoch
        self.weekTop = weekTop
        self.seasonPlace = seasonPlace
        self.seasonPoints = seasonPoints
        self.seasonField = seasonField
        self.seasonTop = seasonTop
        self.seasonStarted = seasonStarted
    }

    public var nextKickoff: Date? { nextKickoffEpoch.map { Date(timeIntervalSince1970: TimeInterval($0)) } }

    /// The same five phases the lock screen uses, so the two surfaces never disagree about what
    /// part of the week it is.
    public var picksSettled: Bool { slots.allSatisfy { $0.state != .waiting && $0.state != .live } }
    public var liveCount: Int { slots.filter { $0.state == .live }.count }

    public var outstanding: (games: Int, points: Int) {
        let left = slots.filter { $0.state == .waiting || $0.state == .live }
        return (left.count, left.reduce(0) { $0 + $1.stake })
    }
}

/// A row on a board, trimmed to what fits on a home screen.
public struct WidgetStanding: Codable, Hashable, Sendable, Identifiable {
    public let place: Int
    public let name: String
    public let points: Int
    public let isMe: Bool
    public var id: String { "\(place)-\(name)" }

    public init(place: Int, name: String, points: Int, isMe: Bool) {
        self.place = place
        self.name = name
        self.points = points
        self.isMe = isMe
    }
}

/**
 The shared container, and the one place its name is written down.

 A file rather than `UserDefaults(suiteName:)`: the snapshot is a single object rewritten whole,
 which is what a file is, and a corrupt or half-written defaults plist is a much worse failure than
 a file that fails to decode and falls back to the last good one.
 */
public enum WidgetStore {
    /// Both targets carry this in their entitlements. It is not a secret — it is scoped to the
    /// team, and only apps signed by this team can name it.
    public static let appGroup = "group.app.playtally.ios"

    public static let widgetKind = "app.playtally.widgets"

    private static var url: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("snapshot.json")
    }

    public static func read() -> WidgetSnapshot? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder.tally.decode(WidgetSnapshot.self, from: data)
    }

    /// Returns whether anything changed, so the app only asks WidgetKit to redraw when it should.
    @discardableResult
    public static func write(_ snapshot: WidgetSnapshot) -> Bool {
        guard let url else { return false }
        // Compare on everything but the timestamp: rewriting the same week every thirty seconds
        // would have the home screen redrawing all afternoon for no visible change.
        if let existing = read(), existing.sameContent(as: snapshot) { return false }
        guard let data = try? JSONEncoder.tally.encode(snapshot) else { return false }
        do {
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    public static func clear() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }
}

extension WidgetSnapshot {
    /// Everything except when it was written.
    func sameContent(as other: WidgetSnapshot) -> Bool {
        poolName == other.poolName
            && poolSlug == other.poolSlug
            && origin == other.origin
            && week == other.week
            && seasonStartsAt == other.seasonStartsAt
            && entries == other.entries
    }
}

extension JSONDecoder {
    /// ISO-8601 dates, matching the API. The snapshot is written and read by our own code on both
    /// sides, so this only has to agree with itself — but agreeing with the API too means a value
    /// can be copied straight across without a conversion nobody remembers to do.
    public static let tally: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

extension JSONEncoder {
    public static let tally: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}
