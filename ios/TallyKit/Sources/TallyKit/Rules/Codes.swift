import Foundation

/// Device claim codes, as in `shared/codes.ts`. The alphabet drops I, L, O, 0 and 1 so a code can
/// be read across a room.
public enum Codes {
    public static let alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    public static let length = 8

    /// Strips the dash, spaces and case so "q7mn-4pk2" matches "Q7MN4PK2".
    public static func normalize(_ raw: String) -> String {
        String(raw.uppercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) && $0.isASCII }.map { Character($0) })
    }

    public static func isCodeShaped(_ raw: String) -> Bool {
        let code = normalize(raw)
        return code.count == length && code.allSatisfy { alphabet.contains($0) }
    }

    /// Display form: QRT4-9MKP.
    public static func format(_ code: String) -> String {
        let c = normalize(code)
        guard c.count == length else { return c }
        return "\(c.prefix(4))-\(c.suffix(4))"
    }

    /// What to show as someone types: uppercase, a dash after four, never more than eight.
    public static func formatWhileTyping(_ raw: String) -> String {
        let c = String(normalize(raw).prefix(length))
        if c.count > 4 { return "\(c.prefix(4))-\(c.dropFirst(4))" }
        return c
    }
}
