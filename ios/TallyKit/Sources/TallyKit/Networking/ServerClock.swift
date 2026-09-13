import Foundation

/**
 The phone's clock, corrected by the server's. Every API response carries `now`, and locks are
 decided against it rather than the device's own time, so a phone set five minutes fast never
 shows a game as open that the Worker will refuse. A dev-only override (`tally.nowOverride`,
 an ISO date in UserDefaults) is forwarded as `?now=` the way the web client does; the Worker
 honours it only when `ENVIRONMENT=dev`.
 */
public final class ServerClock: @unchecked Sendable {
    public static let shared = ServerClock()

    private let lock = NSLock()
    private var offset: TimeInterval = 0
    private let override: Date?

    public init(defaults: UserDefaults = .standard) {
        if let raw = defaults.string(forKey: "tally.nowOverride"), let d = ISO8601Parsing.date(from: raw) {
            override = d
        } else {
            override = nil
        }
    }

    public var overrideISO: String? {
        override.map { ISO8601Parsing.string(from: $0) }
    }

    public func note(serverNow: Date) {
        guard override == nil else { return }
        lock.lock()
        offset = serverNow.timeIntervalSinceNow
        lock.unlock()
    }

    public var now: Date {
        if let override { return override }
        lock.lock()
        defer { lock.unlock() }
        return Date().addingTimeInterval(offset)
    }
}

/// `Date.toISOString()` writes milliseconds; a hand-typed override may not. Both parse.
public enum ISO8601Parsing {
    private static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    public static func date(from raw: String) -> Date? {
        withFractional.date(from: raw) ?? plain.date(from: raw)
    }

    public static func string(from date: Date) -> String {
        withFractional.string(from: date)
    }

    public static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let raw = try c.decode(String.self)
            guard let date = ISO8601Parsing.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Not an ISO-8601 date: \(raw)")
            }
            return date
        }
        return d
    }()

    public static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(ISO8601Parsing.string(from: date))
        }
        return e
    }()
}
