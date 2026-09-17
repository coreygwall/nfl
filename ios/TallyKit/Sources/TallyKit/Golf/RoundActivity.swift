import Foundation

/**
 A round in progress, on a lock screen.

 A scramble is four hours long and the phone spends most of it in a pocket, so the lock screen is
 where the round actually lives: which hole, what the team is to par, and who is winning the
 argument. Unlike the week's activity this one is **driven entirely by the app** — there is no feed
 and no server, so there is nothing to push and it needs no APNs key. The app is in somebody's hand
 every few minutes anyway, which is exactly when the numbers change.

 The type lives in TallyKit because both targets need it: the app to start and update it, the
 widget extension to draw it. The shapes are small and already-worked-out, because a Live Activity
 payload has a hard size limit and a widget process should not be doing arithmetic.
 */
public struct RoundActivityAttributes: Codable, Hashable, Sendable {
    /// Which card this is, so a relaunch can match a running activity back to it.
    public let cardId: String
    public let cardName: String
    public let course: String
    public let holeCount: Int

    public init(cardId: String, cardName: String, course: String = "", holeCount: Int) {
        self.cardId = cardId
        self.cardName = cardName
        self.course = course
        self.holeCount = holeCount
    }

    public struct ContentState: Codable, Hashable, Sendable {
        /// One player on the tally, already ranked. Trimmed to what a lock screen can show.
        public struct Line: Codable, Hashable, Sendable {
            public let name: String
            public let kept: Int
            public let place: Int

            public init(name: String, kept: Int, place: Int) {
                self.name = name
                self.kept = kept
                self.place = place
            }
        }

        public let hole: Int
        public let par: Int
        /// Strokes logged on the hole being played, so a glance says whether the team is in trouble.
        public let strokesOnHole: Int
        /// Holes finished.
        public let through: Int
        /// Total strokes over the holes that are in.
        public let strokes: Int
        public let toPar: Int
        public let lines: [Line]
        public let done: Bool

        public init(
            hole: Int,
            par: Int,
            strokesOnHole: Int,
            through: Int,
            strokes: Int,
            toPar: Int,
            lines: [Line],
            done: Bool
        ) {
            self.hole = hole
            self.par = par
            self.strokesOnHole = strokesOnHole
            self.through = through
            self.strokes = strokes
            self.toPar = toPar
            self.lines = lines
            self.done = done
        }

        /// Everyone tied at the top, which is the only place a tie is worth reading out.
        public var leaders: [String] { lines.filter { $0.place == 1 && $0.kept > 0 }.map(\.name) }

        /**
         Where the round is, in one sentence.

         Four situations rather than two, because the middle of a hole and the start of one are
         different glances: standing on a tee you want to know how far in you are, and three
         strokes into a par four you want to know that.
         */
        public func statusLine() -> String {
            if done { return "That's the round. \(strokes) strokes, \(ScrambleTally.toParText(toPar))." }
            if strokesOnHole > 0 {
                let shots = strokesOnHole == 1 ? "1 shot in" : "\(strokesOnHole) shots in"
                return "Hole \(hole), par \(par) · \(shots)."
            }
            if through == 0 { return "Hole \(hole), par \(par) · on the tee." }
            return "Hole \(hole), par \(par) · through \(through)."
        }

        /// Who is winning the argument, or nothing at all before anybody's ball has been kept.
        public func leadLine() -> String? {
            let names = leaders
            guard let top = lines.first(where: { $0.place == 1 }), top.kept > 0, !names.isEmpty else { return nil }
            let verb = names.count == 1 ? "leads" : "lead"
            return "\(Names.list(names)) \(verb) with \(top.kept) kept."
        }
    }

    /// The state a card is in right now, trimmed for the lock screen.
    public static func state(from card: ScrambleCard, topN: Int = 4) -> ContentState {
        let rows = ScrambleTally.rows(card)
        return ContentState(
            hole: card.currentHole,
            par: card.par(card.currentHole),
            strokesOnHole: card.entry(card.currentHole).map { $0.finished ? 0 : $0.score } ?? 0,
            through: card.throughHole,
            strokes: card.strokesTaken,
            toPar: card.toPar,
            lines: rows.prefix(topN).map { ContentState.Line(name: $0.player.name, kept: $0.kept, place: $0.place) },
            done: card.isComplete
        )
    }
}

// ActivityKit imports on the Mac, where `swift test` runs this package, but every type in it is
// marked unavailable there — so the guard has to be the platform, not `canImport`. Everything above
// is a plain Codable struct and compiles either way; only the conformance is conditional.
#if os(iOS)
import ActivityKit

extension RoundActivityAttributes: ActivityAttributes {}
#endif
