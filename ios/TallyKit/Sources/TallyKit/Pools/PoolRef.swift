import Foundation

/**
 Where a pool lives. Today there is one pool per Worker and its API sits under `/api`; the README
 names `/api/pools/<slug>` as the shape once there are many. Every request in the app goes
 through `apiURL(_:)`, so that move is one line here and nothing in a screen.

 A pool is an *instance* (this season's High Five) of a *type* (High Five) on a *host* (Tally).
 Identity belongs to the host — a Tally account is one name across every pool it plays in — which
 is why sessions are keyed by `origin`, and pools by `origin` + `slug`.
 */
public struct PoolRef: Codable, Hashable, Sendable {
    public let origin: URL
    public let slug: String

    public init(origin: URL, slug: String) {
        self.origin = origin
        self.slug = slug
    }

    /// The pool everyone is in this season. A link to any other pool adds it to the catalogue.
    public static let `default` = PoolRef(origin: URL(string: "https://playtally.app")!, slug: "high-five")
    /// The demo pool: its own Worker and database on its own host (`wrangler.jsonc` → `env.demo`),
    /// full of made-up players, so looking around never puts a stranger on a real group's board.
    public static let demo = PoolRef(origin: URL(string: "https://demo.playtally.app")!, slug: "demo")

    public var host: String { origin.host ?? "" }

    /// The pool's own page, for sharing and for sign-in links.
    public var webURL: URL { webURL(path: "") }

    /// A page inside the pool: `webURL(path: "/board/week/3")`.
    public func webURL(path: String) -> URL {
        var base = origin.absoluteString
        while base.hasSuffix("/") { base.removeLast() }
        return URL(string: "\(base)/p/\(slug)\(path)") ?? origin
    }

    /// Single-pool today. When the Worker serves many, this becomes `/api/pools/<slug>` + path.
    public func apiURL(_ path: String) -> URL {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        let query = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        components.path = "/api" + String(query[0])
        if query.count > 1 { components.percentEncodedQuery = String(query[1]) }
        return components.url!
    }

    /// Parses a pool link — `https://playtally.app/p/high-five/board/week/3?view=grid` — into
    /// the pool and the path inside it. Anything else (the landing page, another site) is nil.
    public static func parse(_ url: URL) -> (pool: PoolRef, path: String, query: [String: String])? {
        guard let scheme = url.scheme, scheme == "https" || scheme == "http", let host = url.host else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 2, parts[0] == "p" else { return nil }
        var originComponents = URLComponents()
        originComponents.scheme = scheme
        originComponents.host = host
        originComponents.port = url.port
        guard let origin = originComponents.url else { return nil }
        let rest = parts.dropFirst(2)
        let path = "/" + rest.joined(separator: "/")
        var query: [String: String] = [:]
        for item in URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [] {
            query[item.name] = item.value ?? ""
        }
        return (PoolRef(origin: origin, slug: parts[1]), path, query)
    }
}

/// A pool this device has opened. The name is what the pool called itself last time we asked.
public struct PoolMembership: Codable, Hashable, Sendable, Identifiable {
    public let ref: PoolRef
    public var name: String
    public var poolType: String
    public var lastOpened: Date
    public var id: String { "\(ref.host)/\(ref.slug)" }

    public init(ref: PoolRef, name: String, poolType: String = "High Five", lastOpened: Date = Date()) {
        self.ref = ref; self.name = name; self.poolType = poolType; self.lastOpened = lastOpened
    }
}

/// The pools on this phone, most recent first. One entry until someone taps a second pool link.
public struct PoolCatalog: Codable, Sendable {
    public var pools: [PoolMembership]
    public var currentId: String?

    public static let empty = PoolCatalog(pools: [], currentId: nil)

    public var current: PoolMembership? {
        pools.first { $0.id == currentId } ?? pools.first
    }

    public mutating func open(_ ref: PoolRef, name: String? = nil, poolType: String? = nil) {
        let id = "\(ref.host)/\(ref.slug)"
        if let i = pools.firstIndex(where: { $0.id == id }) {
            if let name { pools[i].name = name }
            if let poolType { pools[i].poolType = poolType }
            pools[i].lastOpened = Date()
        } else {
            pools.append(PoolMembership(ref: ref, name: name ?? PoolTypes.bySlug(ref.slug)?.name ?? ref.slug, poolType: poolType ?? "High Five"))
        }
        pools.sort { $0.lastOpened > $1.lastOpened }
        currentId = id
    }

    public mutating func remove(_ id: String) {
        pools.removeAll { $0.id == id }
        if currentId == id { currentId = pools.first?.id }
    }

    private static let key = "tally.pools.v1"

    public static func load(defaults: UserDefaults = .standard) -> PoolCatalog {
        guard let data = defaults.data(forKey: key), let c = try? JSONDecoder().decode(PoolCatalog.self, from: data) else {
            return .empty
        }
        return c
    }

    public func save(defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: PoolCatalog.key) }
    }
}
