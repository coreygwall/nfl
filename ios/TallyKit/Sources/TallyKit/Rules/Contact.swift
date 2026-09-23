import Foundation

/**
 Where to write when something is wrong.

 The Swift half of `shared/contact.ts`; `contactParity.test.ts` fails if the two drift. A Swift
 build cannot see the TypeScript, and the cost of disagreement is somebody in the app writing to
 an address nobody reads — which looks exactly like being ignored.

 Not a secret, and published on purpose: the App Store listing needs a support contact, the
 privacy policy needs one, and a settings page with no way to get help sends people to whoever
 runs their pool for things that are not their pool's fault.
 */
public enum Contact {
    public static let supportEmail = "cwall800@gmail.com"
    public static let supportSubject = "Tally support"

    /// `mailto:` with the subject already filled in, so the inbox can sort it without being asked.
    public static func supportMailto(subject: String = supportSubject) -> URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = supportEmail
        components.queryItems = [URLQueryItem(name: "subject", value: subject)]
        return components.url
    }
}
