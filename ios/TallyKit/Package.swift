// swift-tools-version:5.9
import PackageDescription

/**
 TallyKit is everything in the iOS app that is not a screen: the API contract, the pool and sport
 abstractions, the rules that also live in `shared/` on the web, sign-in (device tokens, claim
 codes, passkeys) and the Keychain. It has no SwiftUI in it, so it can be unit-tested on a Mac
 without a simulator and reused by a widget or a watch app later.
 */
let package = Package(
    name: "TallyKit",
    // macOS is listed so `swift test` runs on a Mac without a simulator; the app itself is iOS.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TallyKit", targets: ["TallyKit"]),
    ],
    targets: [
        .target(name: "TallyKit", path: "Sources/TallyKit"),
        .testTarget(name: "TallyKitTests", dependencies: ["TallyKit"], path: "Tests/TallyKitTests"),
    ],
    swiftLanguageVersions: [.v5]
)
