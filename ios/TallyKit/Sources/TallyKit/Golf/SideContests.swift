import Foundation

/**
 The two bets a scramble runs alongside itself, and what they are worth.

 A scramble already answers one question — whose shots the team kept — and the group standing on
 the tee is usually playing two more: **longest drive** on the par fives and **closest to the pin**
 on the par threes. They are not the round, they are the arguments beside it, and the card that
 records the round is the only thing in the cart with a screen.

 Three decisions are load-bearing here.

 **Which holes host a contest is derived from par, not stored.** A card does not keep a list of
 "these are the CTP holes"; a par three hosts closest to the pin and a par five hosts longest
 drive, and that is the whole rule. It has to work this way because par is editable from the tee
 you are standing on (`ParChip`) — nobody fills in eighteen numbers on the first tee, so the truth
 arrives one hole at a time, and a stored list of contest holes would be wrong from the moment the
 fourth turned out to be a three. Derived, it is simply right the instant par is corrected.

 **An award records which contest it was, not just who won.** The corollary of deriving from par is
 that par can change *under* an award: hole 7 was a five, Dan took the long drive, and then
 somebody notices the card says four. Storing the contest on the award means that record is
 unambiguously a longest drive — it stops counting, because hole 7 no longer hosts one, but it is
 not silently reinterpreted as a closest to the pin, and it comes back intact if the par is
 corrected again. Same posture as shortening a round to nine: the record survives, the counting
 stops.

 **Points are off until somebody turns them on.** A second leaderboard nobody asked for is a second
 answer to "who won", and two answers is none. When they are on, the values are the group's:
 `PointValues.standard` is a point a shot and ten an award, which is the split that makes a
 contest worth about two holes of keeping.
 */
public enum SideContest: String, Codable, Hashable, Sendable, CaseIterable {
    /// The par fives. Everybody hits, and one of them went furthest.
    case longestDrive
    /// The par threes. Everybody hits at the green, and one of them finished nearest the flag.
    case closestToPin

    /// The par this contest is played on, which is the only thing that decides where it runs.
    public var par: Int {
        switch self {
        case .longestDrive: return 5
        case .closestToPin: return 3
        }
    }

    public var title: String {
        switch self {
        case .longestDrive: return "Longest drive"
        case .closestToPin: return "Closest to the pin"
        }
    }

    /// Short enough for a chip beside a hole number.
    public var short: String {
        switch self {
        case .longestDrive: return "Long drive"
        case .closestToPin: return "Closest"
        }
    }

    /// What golfers write on a paper card, and what fits the scorecard's narrow column.
    public var initials: String {
        switch self {
        case .longestDrive: return "LD"
        case .closestToPin: return "CTP"
        }
    }

    public var symbol: String {
        switch self {
        case .longestDrive: return "arrow.left.and.right"
        case .closestToPin: return "target"
        }
    }

    /// The question the round screen asks, once, on the hole it applies to.
    public var prompt: String {
        switch self {
        case .longestDrive: return "Whose drive was longest?"
        case .closestToPin: return "Who was closest to the pin?"
        }
    }

    /// "took the longest drive" — the verb phrase, for a sentence about a person.
    public var took: String {
        switch self {
        case .longestDrive: return "took the longest drive"
        case .closestToPin: return "was closest to the pin"
        }
    }

    /// The noun, counted: "2 longest drives", "1 closest to the pin".
    public func counted(_ n: Int) -> String {
        switch self {
        case .longestDrive: return n == 1 ? "1 longest drive" : "\(n) longest drives"
        case .closestToPin: return n == 1 ? "1 closest to the pin" : "\(n) closest to the pin"
        }
    }

    /// Where this contest runs, said in a sentence: "On every par 5."
    public var runsOn: String { "On every par \(par)." }
}

/// Which of the two the group is playing. Both off is the default, and is the round as it was.
public struct ContestRules: Codable, Hashable, Sendable {
    public var longestDrive: Bool
    public var closestToPin: Bool

    public static let off = ContestRules()

    public init(longestDrive: Bool = false, closestToPin: Bool = false) {
        self.longestDrive = longestDrive
        self.closestToPin = closestToPin
    }

    /// Anything at all to claim on this card.
    public var any: Bool { longestDrive || closestToPin }

    public func runs(_ contest: SideContest) -> Bool {
        switch contest {
        case .longestDrive: return longestDrive
        case .closestToPin: return closestToPin
        }
    }

    public mutating func set(_ contest: SideContest, _ on: Bool) {
        switch contest {
        case .longestDrive: longestDrive = on
        case .closestToPin: closestToPin = on
        }
    }

    /// The contests actually being played, in a stable order.
    public var playing: [SideContest] { SideContest.allCases.filter(runs) }
}

/**
 What each thing is worth, when the group is keeping points as well as strokes.

 `enabled` is a separate fact from the values, so switching the board off and on again does not
 lose what somebody typed on the first tee. The values are clamped on the way in rather than
 trusted: a blob written by a future build, or a hand-edited one, should cost a bad number rather
 than a leaderboard of nonsense.
 */
public struct PointValues: Codable, Hashable, Sendable {
    /// Off means there is no points leaderboard at all — not a leaderboard of zeroes.
    public var enabled: Bool
    /// Per shot of theirs the team kept. The round's own currency, priced.
    public var perShotKept: Int
    public var perLongestDrive: Int
    public var perClosestToPin: Int

    /// A point a shot and ten an award: a contest is worth about two holes of keeping, which is
    /// roughly what it feels worth on the drive home.
    public static let standard = PointValues(enabled: false)

    /// Nothing is worth less than nothing or more than fifty. A zero is meaningful — a group that
    /// wants the board to be purely about the contests sets the shot to nothing.
    public static let range = 0...50

    /// Spelled out rather than left to synthesis, because `init(from:)` below is hand-written and
    /// the encoder's half is not: the two have to be looking at the same keys.
    private enum CodingKeys: String, CodingKey {
        case enabled, perShotKept, perLongestDrive, perClosestToPin
    }

    public init(enabled: Bool = false, perShotKept: Int = 1, perLongestDrive: Int = 10, perClosestToPin: Int = 10) {
        self.enabled = enabled
        self.perShotKept = PointValues.clamp(perShotKept)
        self.perLongestDrive = PointValues.clamp(perLongestDrive)
        self.perClosestToPin = PointValues.clamp(perClosestToPin)
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            enabled: try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false,
            perShotKept: try c.decodeIfPresent(Int.self, forKey: .perShotKept) ?? 1,
            perLongestDrive: try c.decodeIfPresent(Int.self, forKey: .perLongestDrive) ?? 10,
            perClosestToPin: try c.decodeIfPresent(Int.self, forKey: .perClosestToPin) ?? 10
        )
    }

    private static func clamp(_ n: Int) -> Int { min(max(n, range.lowerBound), range.upperBound) }

    public func value(of contest: SideContest) -> Int {
        switch contest {
        case .longestDrive: return perLongestDrive
        case .closestToPin: return perClosestToPin
        }
    }

    public mutating func setValue(_ n: Int, of contest: SideContest) {
        switch contest {
        case .longestDrive: perLongestDrive = PointValues.clamp(n)
        case .closestToPin: perClosestToPin = PointValues.clamp(n)
        }
    }
}

/**
 One hole's side contest, and who took it.

 The contest travels with the award for the reason in the type comment above: par can change under
 it, and a record that only said "Dan" would become a different claim about Dan.
 */
public struct HoleAward: Codable, Hashable, Identifiable, Sendable {
    public let contest: SideContest
    public let playerId: String

    public init(contest: SideContest, playerId: String) {
        self.contest = contest
        self.playerId = playerId
    }

    /// One of each contest per hole, at most, so the contest is the identity.
    public var id: String { contest.rawValue }
}
