import Foundation

/**
 What each pool type is, in one place — the same content as `shared/pools.ts` on the web. The
 rules page, the landing sheet and the welcome hero all read from here, so there is one copy to
 edit. A pool type says which sport it is played in; the sport supplies the teams.
 */
public struct PoolStep: Hashable, Sendable, Identifiable {
    public let title: String
    public let body: String
    public let showRanks: Bool
    public var id: String { title }
    public init(title: String, body: String, showRanks: Bool = false) {
        self.title = title; self.body = body; self.showRanks = showRanks
    }
}

public struct PoolNote: Hashable, Sendable, Identifiable {
    public let term: String
    public let body: String
    /// Only makes sense once you are inside the pool.
    public let appOnly: Bool
    public var id: String { term }
    public init(term: String, body: String, appOnly: Bool = false) {
        self.term = term; self.body = body; self.appOnly = appOnly
    }
}

public enum PoolStatus: String, Sendable {
    case live, soon
}

public struct PoolTypeContent: Hashable, Sendable, Identifiable {
    /// Matches the pool's URL slug when an instance of this type is running.
    public let slug: String
    public let name: String
    public let status: PoolStatus
    public let sports: [String]
    public let tagline: String
    public let blurb: String
    public let steps: [PoolStep]
    public let notes: [PoolNote]
    public var id: String { slug }

    public func notes(inApp: Bool) -> [PoolNote] {
        notes.filter { inApp || !$0.appOnly }
    }
}

public enum PoolTypes {
    public static let highFive = PoolTypeContent(
        slug: "high-five",
        name: "High Five",
        status: .live,
        sports: ["NFL"],
        tagline: "Pick five. Rank your confidence. Score up to 15 points every week.",
        blurb: "Every week, pick the winners of five games and rank them 1 to 5. Your surest call is worth 5 points, your shakiest 1.",
        steps: [
            PoolStep(title: "Pick 5 winners", body: "Choose any five games you think you can call correctly. You can change each pick until that game kicks off."),
            PoolStep(title: "Rank your confidence", body: "Your surest pick is worth 5 points, then 4, 3, 2, and 1. Put the most points behind the picks you trust most.", showRanks: true),
            PoolStep(title: "Climb the board", body: "A correct pick earns its assigned points. A miss earns zero. Get all five right and you score the full 15."),
        ],
        notes: [
            PoolNote(term: "No weekly deadline", body: "Games lock one at a time at kickoff, so later games stay open."),
            PoolNote(term: "Showing up late is okay", body: "Pick from the games that are left. Your first remaining pick is still worth 5 points."),
            PoolNote(term: "Picks stay private", body: "Other players' picks appear only after those games begin."),
            PoolNote(term: "Season standings", body: "Most points wins. Ties break on correct picks, then 5-point hits."),
            PoolNote(term: "Using another device?", body: "Tap “I already entered”, choose your name, and type your device code — tap your name at the top of this app to find it. It stops anyone else picking as you.", appOnly: true),
            PoolNote(term: "What about an NFL tie?", body: "A tied game scores zero for everyone who picked it."),
        ]
    )

    public static let survivor = PoolTypeContent(
        slug: "survivor", name: "Survivor", status: .soon, sports: ["NFL", "Soccer"],
        tagline: "One pick a week, one life, no repeats.",
        blurb: "Pick one winner each week and you can never pick that team again. Miss once and you're out.",
        steps: [], notes: []
    )

    public static let brackets = PoolTypeContent(
        slug: "brackets", name: "Brackets", status: .soon, sports: ["College basketball", "World Cup"],
        tagline: "Fill it in, watch it burn by the second round.",
        blurb: "Call the whole tournament before it starts, then argue about it until next spring.",
        steps: [], notes: []
    )

    public static let majors = PoolTypeContent(
        slug: "majors", name: "Majors", status: .soon, sports: ["Golf"],
        tagline: "Draft a handful of players and live with it for four days.",
        blurb: "Pick your group before the first tee. Their scores are your score, all weekend.",
        steps: [], notes: []
    )

    public static let all: [PoolTypeContent] = [highFive, survivor, brackets, majors]

    public static func byName(_ name: String) -> PoolTypeContent? {
        all.first { $0.name == name }
    }

    public static func bySlug(_ slug: String) -> PoolTypeContent? {
        all.first { $0.slug == slug }
    }
}
