import Foundation

/// What the Worker says about a shared card.
public struct SharedCardResponse: Decodable, Sendable {
    public let token: String
    public let revision: Int
    public let updatedAt: Date
    public let card: ScrambleCard
    /// Only on a publish: false when the app asked for a link it already had.
    public let created: Bool?
}

private struct CardEnvelope: Encodable {
    let card: ScrambleCard
}

/**
 A golf card, shared to everybody who is actually playing it.

 One phone keeping the card is fine until you notice that three of the four people round it are
 holding a browser and nothing else. Publishing puts the card on the Worker and hands back a link;
 from then on the phone and every browser holding that link are keeping the same round.

 Three things about how this talks to the server, each of which is a decision rather than a detail:

 - **No session.** These routes are authorised by the token in the URL and nothing else, so the
   client carries no identity at all. A person can own a golf card without being in a pool, and
   asking them to sign in to share an afternoon of golf would be asking the wrong question.
 - **The server merges, and its answer is the truth.** Every call comes back with the merged card,
   which can legitimately contain holes this phone has never seen. `ScrambleCard.merging(_:)` is
   how that is folded back in without losing the two things that are local — which tee this phone
   is standing on, and the token.
 - **`shareToken` and `currentHole` are stripped before sending.** The first is the server's to
   know and the second is nobody's but this device's, so neither belongs in a request body.
 */
public actor GolfService {
    private let client: APIClient

    /// The host a card is published to. One Worker today; the parameter is the seam for more.
    public init(origin: URL = PoolRef.default.origin, session: URLSession = APIClient.defaultSession) {
        self.client = APIClient(pool: PoolRef(origin: origin, slug: ""), session: session) { AuthHeaders() }
    }

    /**
     Put this card on the Worker, or ask for the link it already has.

     Idempotent by the card's id, so the app's Share button can call it every time it is tapped
     without scattering links to one round across a group chat. It also *merges* rather than
     overwrites, because the phone doing the publishing may well be behind — somebody opened the
     link and played two holes while it was in a pocket.
     */
    public func publish(_ card: ScrambleCard) async throws -> SharedCardResponse {
        try await client.post("/golf/cards", body: CardEnvelope(card: wire(card)))
    }

    /// Read the shared copy. The one call that happens without anybody having tapped anything.
    public func fetch(token: String) async throws -> SharedCardResponse {
        try await client.get("/golf/cards/\(token)")
    }

    /// Send this phone's copy and take back whatever the server makes of it and everybody else's.
    public func push(_ card: ScrambleCard, token: String) async throws -> SharedCardResponse {
        try await client.put("/golf/cards/\(token)", body: CardEnvelope(card: wire(card)))
    }

    /// The card as the wire wants it: without the two fields that are this device's own business.
    private func wire(_ card: ScrambleCard) -> ScrambleCard {
        var out = card
        out.shareToken = nil
        out.currentHole = 1
        return out
    }
}

public extension ScrambleCard {
    /// The page anybody can open this card at, once it has been published.
    var shareURL: URL? {
        guard let shareToken else { return nil }
        return GolfShare.url(token: shareToken)
    }
}

/**
 Where a shared card lives, said once.

 The Swift half of `SHARED_CARD_PREFIX` in `shared/golf.ts`; `golfParity.test.ts` holds the two
 together. Three things have to agree about this prefix and they are written in three places — the
 Worker decides which requests get the noindex header, `public/robots.txt` decides which a crawler
 may fetch, and this builds the link that goes in a QR code. A card reachable at a path one of them
 has not heard of is a card that gets indexed.
 */
public enum GolfShare {
    public static let prefix = "/g"

    public static func url(token: String, origin: URL = PoolRef.default.origin) -> URL? {
        var base = origin.absoluteString
        while base.hasSuffix("/") { base.removeLast() }
        return URL(string: "\(base)\(prefix)/\(token)")
    }

    /// The inverse, for a link pasted back into the app. Nil for anything that is not a card.
    public static func token(in url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, "/\(parts[0])" == prefix else { return nil }
        return parts[1]
    }
}
