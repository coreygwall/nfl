import Foundation

/**
 Which of Apple's two push hosts this build can be reached on.

 There are two, they are not interchangeable, and getting it wrong fails silently — Apple accepts
 the push and nothing arrives. A build signed with a development profile can only be reached on the
 sandbox host; TestFlight and the App Store use the production one. The server cannot tell which is
 which from a token, so the app says so when it registers.
 */
public enum PushEnvironment: String, Sendable {
    case sandbox
    case production

    /**
     Read off the provisioning profile the app was actually signed with, rather than guessed at
     from the build configuration. `#if DEBUG` is right nearly always, and wrong in the one case
     that wastes an afternoon: a Release build installed from Xcode onto a device, which is
     development-signed and so only reachable on the sandbox host.
     */
    public static var current: PushEnvironment {
        if let value = provisionedApsEnvironment() {
            return value == "development" ? .sandbox : .production
        }
        #if DEBUG
        return .sandbox
        #else
        return .production
        #endif
    }

    /**
     The embedded provisioning profile is a signed blob with a plain XML property list inside it.
     Apps have read it this way for years; there is no API. A App Store build may not carry one at
     all, which is why the caller falls back.
     */
    private static func provisionedApsEnvironment() -> String? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.upperBound..<data.endIndex)
        else { return nil }
        let plist = data[start.lowerBound..<end.upperBound]
        guard let parsed = try? PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any],
              let entitlements = parsed["Entitlements"] as? [String: Any],
              let aps = entitlements["aps-environment"] as? String
        else { return nil }
        return aps
    }
}
