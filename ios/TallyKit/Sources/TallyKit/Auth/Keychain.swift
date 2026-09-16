import Foundation
import Security

/**
 The device token is the one secret on the phone: whoever holds it is you. It lives in the
 Keychain rather than UserDefaults, survives app updates and is never backed up to another
 device (a new phone signs in with Face ID or a code instead, which is the whole point of both).
 */
public struct Keychain: Sendable {
    public let service: String
    /**
     The shared access group, for the one item the widget extension also has to read.

     Nil for everything else, and that is load-bearing: a Keychain lookup is *scoped* by access
     group, so putting the app's existing session into a group would hide it from the app that
     wrote it and sign every install out on update. Only the widget's own copy names a group.
     */
    public let accessGroup: String?

    public static let shared = Keychain(service: "app.playtally.tally")

    public init(service: String, accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    private func query(_ key: String) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        if let accessGroup { q[kSecAttrAccessGroup as String] = accessGroup }
        return q
    }

    public func data(forKey key: String) -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        guard status == errSecSuccess else { return nil }
        return out as? Data
    }

    @discardableResult
    public func set(_ data: Data, forKey key: String) -> Bool {
        let base = query(key)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let update = SecItemUpdate(base as CFDictionary, attributes as CFDictionary)
        if update == errSecSuccess { return true }
        if update != errSecItemNotFound { return false }
        var add = base
        for (k, v) in attributes { add[k] = v }
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    public func remove(forKey key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }

    public func string(forKey key: String) -> String? {
        data(forKey: key).flatMap { String(data: $0, encoding: .utf8) }
    }

    @discardableResult
    public func set(_ string: String, forKey key: String) -> Bool {
        set(Data(string.utf8), forKey: key)
    }
}
