import Foundation

/// Name rules, from `shared/names.ts`. The server enforces these too (and the profanity filter,
/// which lives only there); checking here saves a round trip and uses the same words.
public enum Names {
    public static let min = 2
    public static let max = 24

    public static func normalize(_ raw: String) -> String {
        let folded = raw.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines)
        return folded.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// Case-insensitive uniqueness key.
    public static func key(_ name: String) -> String {
        normalize(name).lowercased()
    }

    public enum Check: Equatable {
        case ok(String)
        case invalid(String)

        public var name: String? {
            if case .ok(let n) = self { return n }
            return nil
        }
        public var message: String? {
            if case .invalid(let m) = self { return m }
            return nil
        }
    }

    public static func validate(_ raw: String) -> Check {
        let name = normalize(raw)
        if name.count < min { return .invalid("Needs at least \(min) characters.") }
        if name.count > max { return .invalid("Keep it under \(max) characters.") }
        let allowed = name.unicodeScalars.allSatisfy { scalar in
            CharacterSet.letters.contains(scalar) || CharacterSet.decimalDigits.contains(scalar)
                || scalar == " " || scalar == "." || scalar == "'" || scalar == "’" || scalar == "-"
        }
        if !allowed { return .invalid("Letters, numbers, spaces, and . ' - only.") }
        return .ok(name)
    }
}
