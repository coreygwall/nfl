import Foundation

/// Date and time the way the site writes them, in the phone's own zone.
enum Format {
    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale.autoupdatingCurrent
        f.setLocalizedDateFormatFromTemplate(pattern)
        return f
    }

    private static let slot = formatter("EEE jmm")
    private static let time = formatter("jmm")
    private static let shortDay = formatter("EEE MMM d")
    private static let longDay = formatter("EEEE MMM d")

    /// Compact kickoff for dense cards: "Sun 10:00 AM".
    static func slot(_ date: Date) -> String { slot.string(from: date) }
    static func time(_ date: Date) -> String { time.string(from: date) }
    static func shortDay(_ date: Date) -> String { shortDay.string(from: date) }
    static func day(_ date: Date) -> String { longDay.string(from: date) }
    /// "Sun, Sep 13 · 10:00 AM"
    static func kickoff(_ date: Date) -> String { "\(shortDay.string(from: date)) · \(time.string(from: date))" }

    static func countdown(to target: Date, from now: Date) -> String {
        let diff = target.timeIntervalSince(now)
        if diff <= 0 { return "now" }
        let m = Int(diff / 60)
        let h = m / 60
        let d = h / 24
        if d >= 2 { return "\(d)d \(h % 24)h" }
        if h >= 1 { return "\(h)h \(m % 60)m" }
        return "\(max(m, 1))m"
    }

    static func relative(_ date: Date, now: Date = Date()) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: now)
    }

    static func plural(_ n: Int, _ singular: String, _ plural: String? = nil) -> String {
        n == 1 ? "\(n) \(singular)" : "\(n) \(plural ?? singular + "s")"
    }
}
