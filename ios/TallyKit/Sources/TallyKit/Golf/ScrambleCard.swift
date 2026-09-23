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

/// One hole's record: the strokes in the order they were taken, whether the ball is in, and who
/// took the hole's side contest if it hosts one.
public struct HoleEntry: Codable, Hashable, Sendable {
    public let hole: Int
    public var strokes: [Stroke]
    public var finished: Bool
    public var updatedAt: Date
    /// At most one of each contest. Kept even when the hole's par no longer hosts that contest —
    /// see `SideContests.swift` for why the record outlives the counting.
    public var awards: [HoleAward]

    public init(
        hole: Int,
        strokes: [Stroke] = [],
        finished: Bool = false,
        updatedAt: Date = Date(),
        awards: [HoleAward] = []
    ) {
        self.hole = hole
        self.strokes = strokes
        self.finished = finished
        self.updatedAt = updatedAt
        self.awards = awards
    }

    private enum CodingKeys: String, CodingKey {
        case hole, strokes, finished, updatedAt, awards
    }

    /**
     Hand-written for one reason: `awards` arrived after cards were already on phones.

     Swift's synthesised decoder does not fall back to a property's default when the key is
     missing — it throws. `CardCatalog.load` turns a throw into an empty catalogue, so a
     synthesised decoder here would have deleted every round anybody had ever kept, silently, on
     the update that shipped this file. Every field added from here on decodes the same way.
     */
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        hole = try c.decode(Int.self, forKey: .hole)
        strokes = try c.decode([Stroke].self, forKey: .strokes)
        finished = try c.decode(Bool.self, forKey: .finished)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        awards = try c.decodeIfPresent([HoleAward].self, forKey: .awards) ?? []
    }

    /// Who took this hole's contest, whatever the hole's par says today. `ScrambleCard.winner`
    /// is the one that applies the par rule; this is the raw record.
    public func award(_ contest: SideContest) -> String? {
        awards.first { $0.contest == contest }?.playerId
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
    public private(set) var id: String
    public var name: String
    public var course: String
    public let createdAt: Date
    public var players: [GolfPlayer]
    /// Par per hole, in order. Its count is the length of the round: 18, or 9.
    public var pars: [Int]
    public var holes: [HoleEntry]
    /// The hole the team is standing on. Part of the record, so a relaunch lands on the right tee.
    public var currentHole: Int
    /// Which side contests the group is playing. Both off is a round exactly as it was before.
    public var contests: ContestRules
    /// What a shot and an award are worth, and whether anybody is counting.
    public var points: PointValues
    /**
     When the names, the pars, the contests or the stakes last changed.

     The second half of the merge rule (`merging(_:)`), and the reason it is separate from a hole's
     `updatedAt`: renaming a player and playing the seventh are different kinds of change, and a
     rule that moved them together would have one overwrite the other. Defaults to `createdAt` for
     every card saved before this existed, which makes those cards lose every settings race — the
     right answer, since a card that has never been shared has nothing to race with.
     */
    public var settingsUpdatedAt: Date
    /**
     The link this card was published under, once somebody has shared it.

     Local to the phone and deliberately **not** on the wire: the server assigns it and knows it,
     so a client sending it back would be telling the server something it decided. Nil means this
     card has never left the device, which is the state every card starts in and most stay in.
     */
    public var shareToken: String?

    public init(
        id: String = UUID().uuidString,
        name: String,
        course: String = "",
        createdAt: Date = Date(),
        players: [GolfPlayer],
        pars: [Int],
        holes: [HoleEntry] = [],
        currentHole: Int = 1,
        contests: ContestRules = .off,
        points: PointValues = .standard,
        settingsUpdatedAt: Date? = nil,
        shareToken: String? = nil
    ) {
        self.id = id
        self.name = name
        self.course = course
        self.createdAt = createdAt
        self.players = players
        self.pars = pars
        self.holes = holes
        self.currentHole = currentHole
        self.contests = contests
        self.points = points
        self.settingsUpdatedAt = settingsUpdatedAt ?? createdAt
        self.shareToken = shareToken
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, course, createdAt, players, pars, holes, currentHole, contests, points
        case settingsUpdatedAt, shareToken
    }

    /// Hand-written for the same reason as `HoleEntry`'s: a card saved before side contests
    /// existed has neither key, and a throw here is a wiped catalogue rather than an error.
    ///
    /// It is also what lets a card come straight off the wire. The server's copy carries neither
    /// `currentHole` (which is a fact about a device, not a round) nor `shareToken` (which is the
    /// server's to know), and both default here rather than throwing.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        course = try c.decode(String.self, forKey: .course)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        players = try c.decode([GolfPlayer].self, forKey: .players)
        pars = try c.decode([Int].self, forKey: .pars)
        holes = try c.decode([HoleEntry].self, forKey: .holes)
        currentHole = try c.decodeIfPresent(Int.self, forKey: .currentHole) ?? 1
        contests = try c.decodeIfPresent(ContestRules.self, forKey: .contests) ?? .off
        points = try c.decodeIfPresent(PointValues.self, forKey: .points) ?? .standard
        settingsUpdatedAt = try c.decodeIfPresent(Date.self, forKey: .settingsUpdatedAt) ?? createdAt
        shareToken = try c.decodeIfPresent(String.self, forKey: .shareToken)
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

    // MARK: The contests beside the round

    /**
     Which side contest this hole hosts, if any — decided by par, and by nothing else.

     Par is the whole rule (`SideContests.swift` says why), so correcting the fourth to a three on
     the fourth tee turns it into a closest-to-the-pin hole there and then. A card with neither
     contest switched on answers nil everywhere, which is how every round that predates this
     behaves.
     */
    public func contest(for hole: Int) -> SideContest? {
        guard holeNumbers.contains(hole) else { return nil }
        return SideContest.allCases.first { $0.par == par(hole) && contests.runs($0) }
    }

    /// Every hole currently hosting a contest, in playing order.
    public var contestHoles: [Int] {
        guard contests.any else { return [] }
        return holeNumbers.filter { contest(for: $0) != nil }
    }

    /**
     Who took a hole's contest — nil if nobody has said yet, and nil if the hole no longer hosts
     the contest the award was recorded under.

     That second case is a par corrected after the fact. The award stays on disk and comes back if
     the par comes back; it simply stops counting, the same way holes 10-18 stop counting when a
     round is shortened to nine.
     */
    public func winner(of contest: SideContest, on hole: Int) -> GolfPlayer? {
        guard self.contest(for: hole) == contest else { return nil }
        return player(entry(hole)?.award(contest))
    }

    /// The hole's contest and whoever has it, in one lookup, for a screen standing on that tee.
    public func standing(on hole: Int) -> (contest: SideContest, winner: GolfPlayer?)? {
        guard let contest = contest(for: hole) else { return nil }
        return (contest, winner(of: contest, on: hole))
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

    /**
     Say whose a stroke actually was, after the fact.

     The fix that happens most is not "one too many" but "that was Dan's, not Pete's" — and until
     this existed the only way to make it was to reopen the hole, undo back past the stroke and
     re-enter everything after it. A wrong name three strokes back on a par five was a nine-tap
     repair, made on a tee where the next hole has already started.

     Allowed on a finished hole, the same way an award is: the count does not change, so the score
     cannot, and the thing this corrects — whose mark it is — is exactly what people notice once
     the hole is in and the tally has moved. The stroke keeps its id, so it is the same stroke
     with a different name on it rather than a new one at the end.
     */
    public mutating func reassign(strokeId: String, on hole: Int, to kind: StrokeKind, playerId: String? = nil) {
        guard holeNumbers.contains(hole) else { return }
        if kind == .shot {
            guard let playerId, players.contains(where: { $0.id == playerId }) else { return }
        }
        update(hole) { entry in
            guard let index = entry.strokes.firstIndex(where: { $0.id == strokeId }) else { return }
            entry.strokes[index] = Stroke(id: strokeId, kind: kind, playerId: playerId)
        }
    }

    /// Take one stroke out of the middle of an open hole — the one that was logged twice. A
    /// finished hole is left alone, like `record`: the count is the score, so reopen it first.
    public mutating func remove(strokeId: String, on hole: Int) {
        guard holeNumbers.contains(hole), let current = entry(hole), !current.finished else { return }
        guard current.strokes.contains(where: { $0.id == strokeId }) else { return }
        update(hole) { $0.strokes.removeAll { $0.id == strokeId } }
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
        touchSettings()
    }

    /// Mark the names, pars, contests or stakes as changed now. Every write to one of those has to
    /// call this, or a shared card will keep losing that change to an older copy on another phone.
    public mutating func touchSettings(_ now: Date = Date()) {
        settingsUpdatedAt = now
    }

    public mutating func go(to hole: Int) {
        guard holeNumbers.contains(hole) else { return }
        currentHole = hole
    }

    /**
     Name who took a hole's side contest, or clear it by passing nil.

     Deliberately *not* guarded by `contest(for:)`: the hole is allowed to be recorded before its
     par is right, and the reading side already refuses to count an award on a hole that does not
     host that contest. Guarding here instead would mean a tap that looked like it worked and
     stored nothing.

     It is allowed on a finished hole, unlike `record`. A stray tap cannot turn a birdie into a
     par here — an award changes no score — and the closest to the pin is usually settled while
     somebody is already writing the hole down.
     */
    /**
     This card and another copy of it, reconciled.

     The Swift half of `mergeCards` in `shared/golf.ts`, and it has to agree with it exactly: the
     server runs that one on every write, so a phone that merged differently would show a round
     the server does not have and then quietly push it back.

     **The hole is the unit**, and the newer of the two wins it outright — its strokes and its
     awards belong together, and merging *inside* one would invent a round nobody played. The
     settings move as a second unit on `settingsUpdatedAt`, because renaming a player and
     shortening a round are not changes you would want half of.

     Two things never cross: `currentHole`, because which tee this phone is standing on is nobody
     else's business, and `shareToken`, which this device already knows and the wire does not
     carry. Keeping them local is what stops a sync dragging somebody back three holes.
     */
    public func merging(_ other: ScrambleCard) -> ScrambleCard {
        var merged = other.settingsUpdatedAt > settingsUpdatedAt ? other : self
        merged.id = id
        merged.currentHole = currentHole
        merged.shareToken = shareToken ?? other.shareToken
        var byHole: [Int: HoleEntry] = [:]
        for hole in holes { byHole[hole.hole] = hole }
        for hole in other.holes {
            if let mine = byHole[hole.hole], mine.updatedAt >= hole.updatedAt { continue }
            byHole[hole.hole] = hole
        }
        merged.holes = byHole.values.sorted { $0.hole < $1.hole }
        return merged
    }

    public mutating func award(_ contest: SideContest, on hole: Int, to playerId: String?) {
        guard holeNumbers.contains(hole) else { return }
        let known = playerId.flatMap { id in players.first { $0.id == id }?.id }
        guard known != nil || playerId == nil else { return }
        update(hole) { entry in
            entry.awards.removeAll { $0.contest == contest }
            if let known { entry.awards.append(HoleAward(contest: contest, playerId: known)) }
        }
    }
}
