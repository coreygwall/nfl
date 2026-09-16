import Foundation

/**
 A scramble, scored from the inside.

 Four people play one ball: everybody hits, the team picks the best one, everybody hits from there.
 The card the course hands out only ever records the team's score. What the team actually argues
 about on the drive home is *whose* ball got picked — and that is what this keeps. Every stroke the
 team takes is somebody's, chosen, so the round is a list of strokes with a name on each, and the
 score falls out of the count.

 Two strokes carry no name. A **tap-in** is the gimme that finished the hole: it counts on the card,
 because the ball had to go in, and it credits nobody, because nobody earned it. A **penalty** is a
 stroke the rules added rather than a person hit. Both count; neither shows on the tally. The one
 putt that *does* deserve a mark — the fifty-footer, or the lag to an inch that made the tap-in a
 tap-in — is just a shot with a name, the same as the drive.

 The unit is the hole. Every mutation here is per hole, and a hole is finished by one of two
 deliberate acts (`finish(hole:tapIn:)`), so a half-entered hole can be walked away from and picked
 up again. Holes are stored as a list rather than a dictionary because the same shape will one day
 cross to the Worker as JSON, where a hole-by-hole merge (the phone that wrote hole 7 last wins hole
 7) is the sync rule this leaves room for.
 */
public struct GolfPlayer: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public var name: String

    public init(id: String = UUID().uuidString, name: String) {
        self.id = id
        self.name = name
    }
}

/**
 What a stroke was.

 Three of the four credit nobody, and they are separate kinds rather than one because the card
 should say what actually happened. `penalty` used to be the only nameless stroke available, which
 made it the thing people reached for when they had simply forgotten to log one — putting the word
 *penalty* on the card for a stroke that was nothing of the sort. `unclaimed` is that stroke.
 */
public enum StrokeKind: String, Codable, Hashable, Sendable {
    /// Somebody's ball, chosen by the team. The only kind that earns a mark on the tally.
    case shot
    /// The gimme that finished the hole. Counts on the card, credits nobody.
    case tapIn
    /// A stroke the rules added rather than a person hit. Counts, credits nobody, finishes nothing.
    case penalty
    /// A stroke the team took that belongs to nobody in particular — a provisional, or one that
    /// went unlogged until the hole was added up. Counts, credits nobody, finishes nothing.
    case unclaimed
}

public struct Stroke: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let kind: StrokeKind
    /// Set only for a `.shot`.
    public let playerId: String?

    public init(id: String = UUID().uuidString, kind: StrokeKind, playerId: String? = nil) {
        self.id = id
        self.kind = kind
        self.playerId = kind == .shot ? playerId : nil
    }

    public static func shot(by playerId: String) -> Stroke { Stroke(kind: .shot, playerId: playerId) }
    public static var tapIn: Stroke { Stroke(kind: .tapIn) }
    public static var penalty: Stroke { Stroke(kind: .penalty) }
    public static var unclaimed: Stroke { Stroke(kind: .unclaimed) }
}

/// One hole's record: the strokes in the order they were taken, and whether the ball is in.
public struct HoleEntry: Codable, Hashable, Sendable {
    public let hole: Int
    public var strokes: [Stroke]
    public var finished: Bool
    public var updatedAt: Date

    public init(hole: Int, strokes: [Stroke] = [], finished: Bool = false, updatedAt: Date = Date()) {
        self.hole = hole
        self.strokes = strokes
        self.finished = finished
        self.updatedAt = updatedAt
    }

    /// Every stroke counts on the card, whoever or whatever it belonged to.
    public var score: Int { strokes.count }

    /// The tee shot the team kept: the first stroke anybody hit. A penalty before it (a lost ball
    /// off the tee, re-teed) does not make the re-tee any less the drive.
    public var drive: Stroke? { strokes.first { $0.kind == .shot } }

    /// Who holed it, once the hole is finished and it was a shot rather than a gimme.
    public var holedBy: String? {
        guard finished, let last = strokes.last, last.kind == .shot else { return nil }
        return last.playerId
    }

    public var endedWithTapIn: Bool { finished && strokes.last?.kind == .tapIn }
}

public struct ScrambleCard: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public var name: String
    public var course: String
    public let createdAt: Date
    public var players: [GolfPlayer]
    /// Par per hole, in order. Its count is the length of the round: 18, or 9.
    public var pars: [Int]
    public var holes: [HoleEntry]
    /// The hole the team is standing on. Part of the record, so a relaunch lands on the right tee.
    public var currentHole: Int

    public init(
        id: String = UUID().uuidString,
        name: String,
        course: String = "",
        createdAt: Date = Date(),
        players: [GolfPlayer],
        pars: [Int],
        holes: [HoleEntry] = [],
        currentHole: Int = 1
    ) {
        self.id = id
        self.name = name
        self.course = course
        self.createdAt = createdAt
        self.players = players
        self.pars = pars
        self.holes = holes
        self.currentHole = currentHole
    }

    // MARK: Reading

    public var holeCount: Int { pars.count }
    public var holeNumbers: ClosedRange<Int> { 1...max(holeCount, 1) }
    public var totalPar: Int { pars.reduce(0, +) }

    public func par(_ hole: Int) -> Int {
        guard hole >= 1, hole <= pars.count else { return 4 }
        return pars[hole - 1]
    }

    public func entry(_ hole: Int) -> HoleEntry? { holes.first { $0.hole == hole } }

    public func player(_ id: String?) -> GolfPlayer? {
        guard let id else { return nil }
        return players.first { $0.id == id }
    }

    /// Only holes on the card: a round shortened to nine after the back was played keeps the
    /// record but stops counting it.
    public var finishedHoles: [HoleEntry] {
        holes.filter { $0.finished && holeNumbers.contains($0.hole) }.sorted { $0.hole < $1.hole }
    }
    /// How many holes are in, which is what "through 12" means even if 7 was skipped and finished later.
    public var throughHole: Int { finishedHoles.count }
    public var isComplete: Bool { holeCount > 0 && throughHole == holeCount }
    public var strokesTaken: Int { finishedHoles.reduce(0) { $0 + $1.score } }
    /// Over finished holes only: a hole with two strokes on it is not yet under par.
    public var toPar: Int { finishedHoles.reduce(0) { $0 + $1.score - par($1.hole) } }

    /**
     The hole most recently finished, by *when* rather than by number.

     The round screen moves on the moment a hole is in, so the correction somebody makes three
     seconds later — that last one was Dan's, not Pete's — is about a hole that is no longer on
     screen. This is the one it was. By `updatedAt`, because holes can be played out of order and
     the seventeenth finished can be hole 3.
     */
    public var lastFinished: HoleEntry? {
        finishedHoles.max { ($0.updatedAt, $0.hole) < ($1.updatedAt, $1.hole) }
    }

    /// The next hole still to play after `hole`, wrapping round to pick up one that was skipped.
    public func nextUnfinishedHole(after hole: Int) -> Int? {
        guard holeCount > 0 else { return nil }
        let order = Array((hole + 1)...(hole + holeCount)).map { ($0 - 1) % holeCount + 1 }
        return order.first { !(entry($0)?.finished ?? false) }
    }

    // MARK: Writing

    private mutating func update(_ hole: Int, _ change: (inout HoleEntry) -> Void) {
        var entry = self.entry(hole) ?? HoleEntry(hole: hole)
        change(&entry)
        entry.updatedAt = Date()
        holes.removeAll { $0.hole == hole }
        holes.append(entry)
        holes.sort { $0.hole < $1.hole }
    }

    /// Another stroke on an open hole. A finished hole is left alone: reopen it first (`undo`), so a
    /// stray tap after "holed it" cannot quietly turn a birdie into a par.
    public mutating func record(_ stroke: Stroke, on hole: Int) {
        guard holeNumbers.contains(hole), !(entry(hole)?.finished ?? false) else { return }
        update(hole) { $0.strokes.append(stroke) }
    }

    /**
     The ball is in. With `tapIn` a nameless stroke is added first; without it the last stroke
     recorded is the one that went in and its owner gets the mark. Either way there has to be a
     stroke on the hole — a hole nobody hit on cannot be finished.
     */
    public mutating func finish(hole: Int, tapIn: Bool) {
        guard let current = entry(hole), !current.strokes.isEmpty, !current.finished else { return }
        update(hole) {
            if tapIn { $0.strokes.append(.tapIn) }
            $0.finished = true
        }
    }

    /**
     One step back, whatever the last step was. On a finished hole that is the finishing act: a
     tap-in comes off and the hole reopens, a "holed it" simply reopens. On an open hole the last
     stroke comes off. Nothing to take back is a no-op rather than an error.
     */
    public mutating func undo(hole: Int) {
        guard let current = entry(hole) else { return }
        if current.finished {
            update(hole) {
                if $0.strokes.last?.kind == .tapIn { $0.strokes.removeLast() }
                $0.finished = false
            }
        } else if !current.strokes.isEmpty {
            update(hole) { $0.strokes.removeLast() }
        }
    }

    /// Move to the next hole still to play, if there is one.
    public mutating func advance() {
        if let next = nextUnfinishedHole(after: currentHole) { currentHole = next }
    }

    /**
     Correct a hole's par.

     Nobody knows their course's card from memory, so the setup sheet guesses par 72 and the truth
     arrives one tee at a time. Clamped to 3...6 because a par 2 is not a thing and a par 7 is not
     on this card; the control on the round screen offers 3, 4 and 5.
     */
    public mutating func setPar(_ par: Int, on hole: Int) {
        guard holeNumbers.contains(hole), hole <= pars.count else { return }
        pars[hole - 1] = min(max(par, 3), 6)
    }

    public mutating func go(to hole: Int) {
        guard holeNumbers.contains(hole) else { return }
        currentHole = hole
    }
}
