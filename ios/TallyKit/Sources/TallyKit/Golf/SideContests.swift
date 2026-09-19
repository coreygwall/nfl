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
 One of the three things a group can put points on.

 Two of them are `SideContest` cases and one is not — a shot the team kept has no hole of its own
 — so this is the type that lets the setup sheet draw one row per thing and the settlement run one
 loop instead of three branches that have to be kept in step.
 */
public enum WagerItem: String, Codable, Hashable, Sendable, CaseIterable {
    case shotKept
    case longestDrive
    case closestToPin

    public init(_ contest: SideContest) {
        switch contest {
        case .longestDrive: self = .longestDrive
        case .closestToPin: self = .closestToPin
        }
    }

    /// The contest this item settles, or nil for a kept shot, which is not one.
    public var contest: SideContest? {
        switch self {
        case .shotKept: return nil
        case .longestDrive: return .longestDrive
        case .closestToPin: return .closestToPin
        }
    }

    public var title: String {
        switch self {
        case .shotKept: return "Shots kept"
        case .longestDrive: return SideContest.longestDrive.title
        case .closestToPin: return SideContest.closestToPin.title
        }
    }

    /// The thing being put in for, once: "a shot kept", "a closest to the pin".
    public var unit: String {
        switch self {
        case .shotKept: return "a shot kept"
        case .longestDrive: return "a longest drive"
        case .closestToPin: return "a closest to the pin"
        }
    }

    /// Short enough for a row that also carries a stepper.
    public var short: String {
        switch self {
        case .shotKept: return "a shot"
        case .longestDrive: return "a long drive"
        case .closestToPin: return "a closest"
        }
    }

    public var symbol: String {
        switch self {
        case .shotKept: return "figure.golf"
        case .longestDrive: return SideContest.longestDrive.symbol
        case .closestToPin: return SideContest.closestToPin.symbol
        }
    }
}

/**
 What everybody puts in, each time one of these is won.

 **This is a pot, not a prize.** A stake of 10 on the closest to the pin does not mean the winner
 scores 10; it means every player puts 10 in on every par three, and whoever ends up nearest the
 flag takes the lot. Four playing, ten each: the winner is **+30** and the other three are −10
 apiece. That is how the bet is actually settled on the drive home, and it is why the board can go
 negative and why every column of it adds to nothing.

 The first shape of this feature got it wrong — one number meaning "the winner scores this much" —
 which is a different game: nobody could lose, and a player who took nothing all day finished level
 with a player who was not there. `init(from:)` on `PointValues` migrates those old numbers into
 stakes.

 `on` is separate from `each` so a group that does not want to put anything on shots kept can say
 so without the number they typed being forgotten if they change their mind.
 */
public struct Stake: Codable, Hashable, Sendable {
    /// Whether this is being played for at all. Off is not a stake of zero: it is not on the card.
    public var on: Bool
    /// What **every player** puts in, once, each time this is won.
    public var each: Int

    /// Nothing is worth less than nothing or more than fifty a head.
    public static let range = 0...50

    public init(on: Bool, each: Int) {
        self.on = on
        self.each = min(max(each, Stake.range.lowerBound), Stake.range.upperBound)
    }

    /// Whether this actually moves anything: switched on, and worth something.
    public var live: Bool { on && each > 0 }

    /// What one win collects — `each` from every *other* player. With four playing and ten each,
    /// thirty. The winner's own stake is not part of it, which is why this is the net.
    public func winnings(players: Int) -> Int { max(players - 1, 0) * each }
}

/**
 What the group is playing for, and whether anybody is counting.

 `enabled` is a separate fact from the stakes, so switching the board off to settle an argument and
 back on again does not lose what somebody typed on the first tee.
 */
public struct PointValues: Codable, Hashable, Sendable {
    /// Off means there is no points board at all — not a board of zeroes.
    public var enabled: Bool
    public var shotKept: Stake
    public var longestDrive: Stake
    public var closestToPin: Stake

    /// The two contests on at ten a head and shots kept off: a group switches points on *because*
    /// of the side games, and putting a stake on every shot the team keeps is the unusual choice
    /// rather than the assumed one.
    public static let standard = PointValues()

    /// Kept for the setup sheet's stepper; the real bound lives on `Stake`.
    public static let range = Stake.range

    private enum CodingKeys: String, CodingKey {
        case enabled, shotKept, longestDrive, closestToPin
        /// The first shape: one Int an item, meaning "the winner scores this much". Read only.
        case perShotKept, perLongestDrive, perClosestToPin
    }

    public init(
        enabled: Bool = false,
        shotKept: Stake = Stake(on: false, each: 1),
        longestDrive: Stake = Stake(on: true, each: 10),
        closestToPin: Stake = Stake(on: true, each: 10)
    ) {
        self.enabled = enabled
        self.shotKept = shotKept
        self.longestDrive = longestDrive
        self.closestToPin = closestToPin
    }

    /**
     Hand-written for two reasons at once.

     A card saved before any of this has none of these keys, and Swift's synthesised decoder throws
     on a missing key rather than using the default — the wipe `ScrambleCard` explains at length.
     And a card saved during the few hours the *prize* shape existed has the old Int keys, which
     are migrated rather than dropped: the number somebody typed becomes the stake, and an item
     they had left at zero comes back switched off, which is the same intent in the new shape.
     */
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func stake(_ key: CodingKeys, was old: CodingKeys, otherwise fallback: Stake) throws -> Stake {
            if let current = try c.decodeIfPresent(Stake.self, forKey: key) { return current }
            if let prize = try c.decodeIfPresent(Int.self, forKey: old) { return Stake(on: prize > 0, each: prize) }
            return fallback
        }
        let defaults = PointValues()
        self.init(
            enabled: try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false,
            shotKept: try stake(.shotKept, was: .perShotKept, otherwise: defaults.shotKept),
            longestDrive: try stake(.longestDrive, was: .perLongestDrive, otherwise: defaults.longestDrive),
            closestToPin: try stake(.closestToPin, was: .perClosestToPin, otherwise: defaults.closestToPin)
        )
    }

    public subscript(item: WagerItem) -> Stake {
        get {
            switch item {
            case .shotKept: return shotKept
            case .longestDrive: return longestDrive
            case .closestToPin: return closestToPin
            }
        }
        set {
            switch item {
            case .shotKept: shotKept = newValue
            case .longestDrive: longestDrive = newValue
            case .closestToPin: closestToPin = newValue
            }
        }
    }

    /// The items that actually move points: switched on, worth something, and — for the two
    /// contests — being played at all on this card.
    public func playing(_ contests: ContestRules) -> [WagerItem] {
        WagerItem.allCases.filter { item in
            guard self[item].live else { return false }
            guard let contest = item.contest else { return true }
            return contests.runs(contest)
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
