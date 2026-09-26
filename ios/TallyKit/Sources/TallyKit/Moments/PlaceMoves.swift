import Foundation

/**
 Who moved, between two looks at the same board.

 The board polls itself every minute through a Sunday, and a row that has changed place used to
 simply be somewhere else on the next frame — the standings reshuffled with nothing to say they
 had. The rows glide now, and for a few seconds each one that moved wears how far: ▲2, ▼1. That is
 the difference between a table and a scoreboard.

 Positive is up the table. Only a player on both boards can have moved: somebody new has no
 "before", and somebody gone has no "after". The web's `placeMoves` (`src/lib/placeMoves.ts`) is
 the same rule.
 */
public enum PlaceMoves {
    public static func between<Row: BoardRow>(_ before: [Row], _ after: [Row]) -> [String: Int] {
        let was = Dictionary(before.map { ($0.playerId, $0.place) }, uniquingKeysWith: { a, _ in a })
        var moved: [String: Int] = [:]
        for row in after {
            guard let old = was[row.playerId], old != row.place else { continue }
            moved[row.playerId] = old - row.place
        }
        return moved
    }
}
