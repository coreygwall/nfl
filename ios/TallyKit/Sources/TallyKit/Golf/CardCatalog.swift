import Foundation

/**
 The golf cards on this phone, newest first.

 Local, and only local, for now: one phone keeps the card on Saturday. The shape is already the
 one a shared card will need — every card has an id, every hole knows when it was last written —
 so the day two phones log different holes of the same round, the catalogue is what syncs, and
 nothing a screen reads changes. Dates are ISO 8601 rather than Foundation's reference-date
 doubles so the same JSON can cross to the Worker unchanged.
 */
public struct CardCatalog: Codable, Sendable {
    public var cards: [ScrambleCard]

    public static let empty = CardCatalog(cards: [])

    public init(cards: [ScrambleCard]) {
        self.cards = cards
    }

    public func card(_ id: String) -> ScrambleCard? { cards.first { $0.id == id } }

    public mutating func upsert(_ card: ScrambleCard) {
        cards.removeAll { $0.id == card.id }
        cards.append(card)
        cards.sort { $0.createdAt > $1.createdAt }
    }

    public mutating func remove(_ id: String) {
        cards.removeAll { $0.id == id }
    }

    private static let key = "tally.golf.cards.v1"

    private static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    private static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }

    public static func load(defaults: UserDefaults = .standard) -> CardCatalog {
        guard let data = defaults.data(forKey: key), let c = try? decoder.decode(CardCatalog.self, from: data) else {
            return .empty
        }
        return c
    }

    public func save(defaults: UserDefaults = .standard) {
        if let data = try? CardCatalog.encoder.encode(self) { defaults.set(data, forKey: CardCatalog.key) }
    }

    /// The bytes `save` writes, for a test to look at without a `UserDefaults`.
    public func encoded() throws -> Data { try CardCatalog.encoder.encode(self) }
    public static func decode(_ data: Data) throws -> CardCatalog { try decoder.decode(CardCatalog.self, from: data) }
}
