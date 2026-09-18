import Foundation

/**
 The code you say out loud to get somebody into a pool. The rules live twice, once per language;
 `shared/pool-codes.ts` is the other copy and `poolCodeParity.test.ts` fails if they drift.

 Deliberately not the shape of a device claim code (`Codes`, eight characters from one mixed
 alphabet), because they are not the same kind of thing. A claim code is a secret: it proves a
 name is yours, so it is long and it is guessed at behind a lockout. A join code is a *handle*:
 printed in a group chat, read across a table, typed by whoever wants in. Three letters, then
 three digits — `KDP-472` — and the fixed shape is the useful part: it is spoken without
 spelling, and one input box can tell a pasted link from a join code from a claim code without
 asking the server. Both alphabets drop what people misread: no I, L or O, no 0 or 1.
 */
public enum PoolCode {
    /// No I, L or O: the three that a spoken or handwritten letter loses.
    public static let letters = "ABCDEFGHJKMNPQRSTUVWXYZ"
    /// No 0 or 1: the two that are the letters above.
    public static let digits = "23456789"
    public static let letterCount = 3
    public static let digitCount = 3
    public static let length = letterCount + digitCount

    /// Strips the dash, the spaces and the case, so "kdp 472" matches "KDP472".
    public static func normalize(_ raw: String) -> String {
        String(raw.uppercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) && $0.isASCII }.map { Character($0) })
    }

    /// Whether this is a join code at all. Shape only — whether a pool answers to it is the
    /// server's to say — which is what lets the app refuse a typo without spending a request.
    public static func isShaped(_ raw: String) -> Bool {
        let code = normalize(raw)
        guard code.count == length else { return false }
        return code.prefix(letterCount).allSatisfy { letters.contains($0) }
            && code.suffix(digitCount).allSatisfy { digits.contains($0) }
    }

    /// Display form: KDP-472. The dash is never stored and never sent.
    public static func format(_ code: String) -> String {
        let c = normalize(code)
        guard c.count == length else { return c }
        return "\(c.prefix(letterCount))-\(c.suffix(digitCount))"
    }

    /// What to show as somebody types: uppercase, a dash after three, never more than six.
    public static func formatWhileTyping(_ raw: String) -> String {
        let c = String(normalize(raw).prefix(length))
        if c.count > letterCount { return "\(c.prefix(letterCount))-\(c.dropFirst(letterCount))" }
        return c
    }
}
