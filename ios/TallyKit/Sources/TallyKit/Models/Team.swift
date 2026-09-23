import Foundation

/// A team as the pool draws it: the sticker, the colours, the name on a card.
public struct Team: Hashable, Sendable, Identifiable {
    public let abbr: String
    /// What we show people ("LAR" for the Rams; the feed codes them "LA").
    public let display: String
    public let city: String
    public let nickname: String
    /// Hex colours, "#RRGGBB".
    public let primary: String
    public let secondary: String
    public let conference: String
    public let division: String

    public var id: String { abbr }
    public var fullName: String { "\(city) \(nickname)" }

    /// Whether a label on the team's primary colour should be dark rather than white: whichever of
    /// the two contrasts more, by WCAG relative luminance. A team is drawn as its colours and its
    /// abbreviation rather than its logo (the logos are trademarks we have no licence for), so
    /// the abbreviation has to read on every one of the 32. Same rule as `labelIsDark` in
    /// `shared/teams.ts`.
    public var labelIsDark: Bool { Team.labelIsDark(onHex: primary) }

    public static func labelIsDark(onHex hex: String) -> Bool {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return false }
        func channel(_ shift: UInt32) -> Double {
            let c = Double((value >> shift) & 0xFF) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let l = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
        return (l + 0.05) / 0.05 > 1.05 / (l + 0.05)
    }

    public init(abbr: String, display: String? = nil, city: String, nickname: String, primary: String, secondary: String, conference: String, division: String) {
        self.abbr = abbr
        self.display = display ?? abbr
        self.city = city
        self.nickname = nickname
        self.primary = primary
        self.secondary = secondary
        self.conference = conference
        self.division = division
    }
}

/**
 A sport is a set of teams. Every screen that draws a matchup asks the sport for the team, never
 a global table, so a second sport (college basketball for Brackets, national sides for a World
 Cup Survivor) is a new `Sport` and a new folder of stickers — not a rewrite of the pick screen.
 */
public protocol Sport: Sendable {
    var id: String { get }
    var name: String { get }
    var teams: [Team] { get }
    func team(_ abbr: String) -> Team?
}

public extension Sport {
    /// A team that is always drawable, so an unknown code in a feed degrades to a monogram.
    func teamOrPlaceholder(_ abbr: String) -> Team {
        team(abbr) ?? Team(abbr: abbr, city: abbr, nickname: abbr, primary: "#5B554B", secondary: "#14120F", conference: "", division: "")
    }
}

public struct NFL: Sport {
    public let id = "nfl"
    public let name = "NFL"
    public let teams: [Team]
    private let byAbbr: [String: Team]

    public static let shared = NFL()

    public func team(_ abbr: String) -> Team? { byAbbr[abbr] }

    /// Every team, in the fixed shuffle the welcome page uses so the strip reads as a jumble.
    public static let marquee: [String] = [
        "SEA", "KC", "DET", "PHI", "BUF", "SF", "DAL", "GB", "BAL", "MIA", "NYJ", "CIN", "LAC", "MIN", "PIT", "HOU",
        "NE", "TB", "CHI", "LV", "DEN", "ARI", "CLE", "NO", "JAX", "TEN", "ATL", "IND", "CAR", "WAS", "NYG", "LA",
    ]

    private init() {
        let t = Team.init
        let list: [Team] = [
            t("ARI", nil, "Arizona", "Cardinals", "#97233F", "#FFB612", "NFC", "West"),
            t("ATL", nil, "Atlanta", "Falcons", "#A71930", "#000000", "NFC", "South"),
            t("BAL", nil, "Baltimore", "Ravens", "#241773", "#9E7C0C", "AFC", "North"),
            t("BUF", nil, "Buffalo", "Bills", "#00338D", "#C60C30", "AFC", "East"),
            t("CAR", nil, "Carolina", "Panthers", "#0085CA", "#101820", "NFC", "South"),
            t("CHI", nil, "Chicago", "Bears", "#0B162A", "#C83803", "NFC", "North"),
            t("CIN", nil, "Cincinnati", "Bengals", "#FB4F14", "#000000", "AFC", "North"),
            t("CLE", nil, "Cleveland", "Browns", "#FF3C00", "#311D00", "AFC", "North"),
            t("DAL", nil, "Dallas", "Cowboys", "#003594", "#869397", "NFC", "East"),
            t("DEN", nil, "Denver", "Broncos", "#FB4F14", "#002244", "AFC", "West"),
            t("DET", nil, "Detroit", "Lions", "#0076B6", "#B0B7BC", "NFC", "North"),
            t("GB", nil, "Green Bay", "Packers", "#203731", "#FFB612", "NFC", "North"),
            t("HOU", nil, "Houston", "Texans", "#03202F", "#A71930", "AFC", "South"),
            t("IND", nil, "Indianapolis", "Colts", "#002C5F", "#A2AAAD", "AFC", "South"),
            t("JAX", nil, "Jacksonville", "Jaguars", "#006778", "#D7A22A", "AFC", "South"),
            t("KC", nil, "Kansas City", "Chiefs", "#E31837", "#FFB81C", "AFC", "West"),
            t("LA", "LAR", "Los Angeles", "Rams", "#003594", "#FFA300", "NFC", "West"),
            t("LAC", nil, "Los Angeles", "Chargers", "#0080C6", "#FFC20E", "AFC", "West"),
            t("LV", nil, "Las Vegas", "Raiders", "#000000", "#A5ACAF", "AFC", "West"),
            t("MIA", nil, "Miami", "Dolphins", "#008E97", "#FC4C02", "AFC", "East"),
            t("MIN", nil, "Minnesota", "Vikings", "#4F2683", "#FFC62F", "NFC", "North"),
            t("NE", nil, "New England", "Patriots", "#002244", "#C60C30", "AFC", "East"),
            t("NO", nil, "New Orleans", "Saints", "#101820", "#D3BC8D", "NFC", "South"),
            t("NYG", nil, "New York", "Giants", "#0B2265", "#A71930", "NFC", "East"),
            t("NYJ", nil, "New York", "Jets", "#125740", "#000000", "AFC", "East"),
            t("PHI", nil, "Philadelphia", "Eagles", "#004C54", "#A5ACAF", "NFC", "East"),
            t("PIT", nil, "Pittsburgh", "Steelers", "#101820", "#FFB612", "AFC", "North"),
            t("SEA", nil, "Seattle", "Seahawks", "#002244", "#69BE28", "NFC", "West"),
            t("SF", nil, "San Francisco", "49ers", "#AA0000", "#B3995D", "NFC", "West"),
            t("TB", nil, "Tampa Bay", "Buccaneers", "#D50A0A", "#FF7900", "NFC", "South"),
            t("TEN", nil, "Tennessee", "Titans", "#0C2340", "#4B92DB", "AFC", "South"),
            t("WAS", nil, "Washington", "Commanders", "#5A1414", "#FFB612", "NFC", "East"),
        ]
        teams = list
        byAbbr = Dictionary(uniqueKeysWithValues: list.map { ($0.abbr, $0) })
    }
}
