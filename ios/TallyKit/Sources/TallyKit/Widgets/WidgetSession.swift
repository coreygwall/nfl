import Foundation

/**
 What a widget needs to speak to the server on its own.

 The snapshot alone would leave a widget frozen on whatever the app last saw, so the timeline also
 refreshes — and a refresh needs the same credential the app uses. That credential is the one real
 secret on the phone, so it stays in the Keychain; a shared **access group** is how two targets of
 the same app are allowed to read one item.

 This is deliberately a *second, separate* item rather than moving the app's own session into the
 group. A Keychain lookup is scoped by access group, so re-homing the existing item would make it
 invisible to the app that wrote it — every signed-in install silently signed out on update. This
 is written alongside, and if it is missing the widget still draws from the snapshot and simply
 does not refresh. The degradation is a slightly older number, never a blank widget.
 */
public struct WidgetSession: Codable, Hashable, Sendable {
    /// The whole origin rather than a bare host: a pool is keyed by origin, and a host string
    /// alone drops the scheme and the port, which is exactly what a dev build runs on.
    public let origin: URL
    public let slug: String
    /// The account's device token.
    public let token: String
    /// The managed entry to ask as, when the account is picking for somebody else.
    public let entryId: String?

    public init(origin: URL, slug: String, token: String, entryId: String?) {
        self.origin = origin
        self.slug = slug
        self.token = token
        self.entryId = entryId
    }

    public var pool: PoolRef { PoolRef(origin: origin, slug: slug) }
    public var headers: AuthHeaders { AuthHeaders(token: token, entryId: entryId) }
}

public enum WidgetSessionStore {
    /**
     The shared Keychain access group.

     The prefix is the Apple Team ID, which is not a secret — every app using associated domains
     publishes it in its `apple-app-site-association` file, and this one is already in
     `wrangler.jsonc` and `CLAUDE.md`. It is here because a Keychain access group has to be named
     literally at the call site; the entitlement on each target names the same string.
     */
    public static let accessGroup = "8445LWRG3B.app.playtally.shared"

    private static let key = "widget.session.v1"

    private static var keychain: Keychain { Keychain(service: "app.playtally.tally", accessGroup: accessGroup) }

    public static func read() -> WidgetSession? {
        guard let data = keychain.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSession.self, from: data)
    }

    public static func write(_ session: WidgetSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        keychain.set(data, forKey: key)
    }

    public static func clear() {
        keychain.remove(forKey: key)
    }
}
