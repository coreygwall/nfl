import Foundation

/// A name this device can pick as, and the token that proves it. Mirrors `src/lib/identity.ts`.
public struct Identity: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public var name: String
    /// The device token. Absent only for an entry that rides on its account's token.
    public var token: String?
    /// Account whose credential controls this entry (the account's own id for the account itself).
    public var accountId: String?
    /// True when the commissioner put this person on this device.
    public var managed: Bool

    public init(id: String, name: String, token: String? = nil, accountId: String? = nil, managed: Bool = false) {
        self.id = id; self.name = name; self.token = token; self.accountId = accountId; self.managed = managed
    }

    public init(player: Player, token: String? = nil, accountId: String? = nil, managed: Bool = false) {
        self.init(id: player.id, name: player.name, token: token, accountId: accountId, managed: managed)
    }

    public var player: Player { Player(id: id, name: name) }

    /// "A name my account picks for", as opposed to the account itself.
    public var isManagedEntry: Bool {
        if let accountId { return accountId != id }
        return false
    }
}

/**
 Everyone this device can pick as, and who it is picking as right now. Usually one person; more
 when a parent picks for the family. Stored as one Keychain item per host, because an identity
 belongs to Tally on that host, not to a single pool.
 */
public struct SessionStore: Codable, Hashable, Sendable {
    public var activeId: String?
    public var people: [Identity]

    public static let empty = SessionStore(activeId: nil, people: [])

    public init(activeId: String?, people: [Identity]) {
        self.activeId = activeId
        self.people = people
    }

    /// Who this device is picking as right now.
    public var active: Identity? {
        people.first { $0.id == activeId } ?? people.first
    }

    /// The headers every request carries for the active identity.
    public var authHeaders: AuthHeaders {
        guard let p = active else { return AuthHeaders() }
        return AuthHeaders(token: p.token, entryId: p.isManagedEntry ? p.id : nil)
    }

    /// Adds or refreshes an identity and makes it the active one.
    public mutating func save(_ identity: Identity) {
        var merged = identity
        if let existing = people.first(where: { $0.id == identity.id }) {
            if merged.token == nil { merged.token = existing.token }
            if merged.accountId == nil { merged.accountId = existing.accountId }
        }
        people.removeAll { $0.id == identity.id }
        people.append(merged)
        activeId = identity.id
    }

    public mutating func setActive(_ id: String) {
        activeId = people.contains { $0.id == id } ? id : people.first?.id
    }

    /// Signs this device out of one name.
    public mutating func forget(_ id: String) {
        people.removeAll { $0.id == id }
        if activeId == id { activeId = people.first?.id }
    }

    /// Refresh this account's entries without changing which one is selected.
    public mutating func syncAccountEntries(accountId: String, entries: [Player], token: String?) {
        let ids = Set(entries.map(\.id))
        let kept = people.filter { $0.accountId != accountId && !ids.contains($0.id) }
        let fresh = entries.map { Identity(player: $0, token: token, accountId: accountId, managed: $0.id != accountId) }
        people = kept + fresh
        if let activeId, !people.contains(where: { $0.id == activeId }) {
            self.activeId = people.first?.id
        }
    }

    // MARK: Persistence

    private static func key(for host: String) -> String { "session.v1.\(host)" }

    public static func load(host: String, keychain: Keychain = .shared) -> SessionStore {
        guard let data = keychain.data(forKey: key(for: host)),
              let store = try? JSONDecoder().decode(SessionStore.self, from: data) else { return .empty }
        return store
    }

    public func persist(host: String, keychain: Keychain = .shared) {
        if people.isEmpty {
            keychain.remove(forKey: SessionStore.key(for: host))
        } else if let data = try? JSONEncoder().encode(self) {
            keychain.set(data, forKey: SessionStore.key(for: host))
        }
    }
}
