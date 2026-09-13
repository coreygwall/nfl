import Foundation
import Security

/**
 The device token is the one secret on the phone: whoever holds it is you. It lives in the
 Keychain rather than UserDefaults, survives app updates and is never backed up to another
 device (a new phone signs in with Face ID or a code instead, which is the whole point of both).
 */
public struct Keychain: Sendable {
    public let service: String

    public static let shared = Keychain(service: "app.playtally.tally")

    public init(service: String) {
        self.service = service
    }

    private func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
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
