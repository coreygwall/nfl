// swift-tools-version:5.9
import PackageDescription

/**
 TallyKit is everything the iOS app and its widget extension both need: the API contract, the pool
 and sport abstractions, the rules that also live in `shared/` on the web, sign-in (device tokens,
 claim codes, passkeys), the Keychain, and the colour palette.

 It holds no screens, which is what lets it be unit-tested on a Mac without a simulator. The
 palette is the one piece of SwiftUI in here, and it earns its place: a widget extension cannot
 see the app target, so a palette that lived over there had to be copied — and the copy is how the
 Live Activity ended up with no dark mode.
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
