import Foundation
// `list` calls through to Names in TallyKit, so that the widget extension and the app say a
// tie the same way.
import TallyKit

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

    /// "1st", "2nd", "3rd", "11th" — for the one place a badge is not the right shape.
    static func ordinal(_ n: Int) -> String {
        let tens = n % 100
        if tens >= 11 && tens <= 13 { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }

    static func plural(_ n: Int, _ singular: String, _ plural: String? = nil) -> String {
        n == 1 ? "\(n) \(singular)" : "\(n) \(plural ?? singular + "s")"
    }

    /// "Corey", "Corey and Sam", "Corey, Sam and Parker" — for the handful of places a tie has to
    /// be read out loud. The rule itself is in TallyKit, because the widget extension has ties to
    /// read out too and cannot see this file.
    static func list(_ items: [String]) -> String { Names.list(items) }
}
