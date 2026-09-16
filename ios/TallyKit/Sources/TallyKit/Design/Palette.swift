import Foundation
import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/**
 The palette, once, for everything that draws.

 It used to live in the app's `Theme.swift`, which was fine until the widget extension needed it
 too — a widget cannot see the app target, so it grew a private `Tone` enum holding seven of the
 same colours as flat light-theme hexes. That is how the Live Activity ended up with no dark mode
 at all: not by decision, but because the copy it was drawing from had never had one.

 So the values live here, in the one place both targets already link, and the app and the widget
 read the same constants. `themeParity.test.ts` checks this file against `src/index.css`, which
 makes the web a third reader of the same palette and drift a test failure rather than a habit.

 The reasoning behind the dark half is in `src/index.css`; the short version is that paper-and-ink
 cannot be inverted. Ink draws text *and* borders, so flipping it would turn every hard offset
 shadow white — `shadow` is its own colour and stays black. Cards sit a step above a warm dark
 ground rather than being white. Anything filled with an accent keeps dark text on it.
 */
public enum TallyPalette {
    public static let paper = Color(light: "#F6F1E8", dark: "#191611")
    public static let paper2 = Color(light: "#EDE5D6", dark: "#2C261F")
    public static let paper3 = Color(light: "#E3D9C6", dark: "#3A3229")
    public static let ink = Color(light: "#14120F", dark: "#F4EFE6")
    public static let ink2 = Color(light: "#5B554B", dark: "#B8AF9E")
    public static let ink3 = Color(light: "#6B6456", dark: "#9C9384")
    public static let line = Color(light: "#D9D0C0", dark: "#51483A")
    public static let turf = Color(light: "#0B7A3B", dark: "#3FBF74")
    public static let turf2 = Color(light: "#0F9A4C", dark: "#5AD48C")
    public static let turfSoft = Color(light: "#DFF2E6", dark: "#16301F")

    /// How sure you are, as one hue in five steps. The five-pointer is the solid green and the
    /// rest fade towards paper — in the dark theme the ramp runs the other way, because the most
    /// prominent thing on a dark ground is the brightest. Gold is deliberately not in here: it is
    /// reserved for *place*, the winner of a week or the leader of the season, so a rank and a
    /// result never read as the same thing. Rank 5 takes `onFill`; 4 through 1 take `ink`.
    public static let rank5 = Color(light: "#0B7A3B", dark: "#3FBF74")
    public static let rank4 = Color(light: "#9AD3B0", dark: "#2A7A4C")
    public static let rank3 = Color(light: "#B9E0C8", dark: "#21603C")
    public static let rank2 = Color(light: "#D3ECDD", dark: "#1B4A2F")
    public static let rank1 = Color(light: "#E9F5EE", dark: "#16301F")

    /// The badge fill for a rank, 1 being the most confident pick and worth 5.
    public static func rank(_ rank: Int) -> Color {
        switch rank {
        case 1: rank5
        case 2: rank4
        case 3: rank3
        case 4: rank2
        default: rank1
        }
    }

    /// What is legible on `rank(_:)`. Only the solid five-pointer takes the filled-accent label.
    public static func onRank(_ rank: Int) -> Color { rank == 1 ? onFill : ink }
    public static let flag = Color(light: "#FFD23F", dark: "#FFD23F")
    public static let flagSoft = Color(light: "#FFF3C4", dark: "#3A2F10")
    public static let danger = Color(light: "#D7263D", dark: "#FF6B7E")
    public static let dangerSoft = Color(light: "#FDE2E6", dark: "#3A1720")
    public static let sky = Color(light: "#2F80ED", dark: "#6FA8FF")
    public static let skySoft = Color(light: "#E1ECFC", dark: "#16233A")
    public static let bronze = Color(light: "#E9C9A6", dark: "#846444")

    /// Where the light theme said `.white`: the fill of a card, a button, a chip. A step lighter
    /// than the ground in the dark theme rather than white, or the cards shout.
    public static let surface = Color(light: "#FFFFFF", dark: "#27221B")

    /// The outline of a card. Ink in the light theme, where it is the same black as the text; a
    /// warm off-white in the dark one, a step down from `ink` so an outline never competes with a
    /// heading for the eye. Only cards take it — buttons and chips keep drawing theirs in `ink`.
    public static let cardBorder = Color(light: "#14120F", dark: "#D8CFC0")

    /// The hard offset shadow. Black in both themes — it is what makes a card look lifted, and a
    /// light shadow is a glow.
    public static let shadow = Color(light: "#14120F", dark: "#000000")

    /// Text that sits *on* a filled accent — a green button, a red one. White reads on the deep
    /// light-theme green; the lighter dark-theme green needs black, and so does the pink-red.
    public static let onFill = Color(light: "#FFFFFF", dark: "#14120F")

    /// Text on the yellow flag, which is the same yellow in both themes and always wants black.
    public static let onAccent = Color(hex: "#14120F")
}

extension Color {
    public init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        guard s.count == 6 else {
            self = Color(white: 0.5)
            return
        }
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }

    /**
     A colour that resolves against whatever theme it is drawn in.

     Resolution happens at draw time, which is the whole trick: `.preferredColorScheme` on the
     app's root — its own Light/Dark/Auto setting — reaches every one of these without a single
     call site knowing, and a widget picks up the system appearance the same way.

     The AppKit branch exists only so `swift test` compiles this package on a Mac. Nothing in the
     tests draws.
     */
    public init(light: String, dark: String) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { traits in
            UIColor(tallyHex: traits.userInterfaceStyle == .dark ? dark : light)
        })
        #elseif canImport(AppKit)
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(tallyHex: isDark ? dark : light)
        })
        #else
        self.init(hex: light)
        #endif
    }
}

/// The hex parse, per platform, so the dynamic providers above have something to return.
private func tallyComponents(_ hex: String) -> (r: Double, g: Double, b: Double) {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    var value: UInt64 = 0
    Scanner(string: s).scanHexInt64(&value)
    guard s.count == 6 else { return (0.5, 0.5, 0.5) }
    return (
        Double((value >> 16) & 0xFF) / 255,
        Double((value >> 8) & 0xFF) / 255,
        Double(value & 0xFF) / 255
    )
}

#if canImport(UIKit)
extension UIColor {
    fileprivate convenience init(tallyHex hex: String) {
        let c = tallyComponents(hex)
        self.init(red: c.r, green: c.g, blue: c.b, alpha: 1)
    }
}
#elseif canImport(AppKit)
extension NSColor {
    fileprivate convenience init(tallyHex hex: String) {
        let c = tallyComponents(hex)
        self.init(srgbRed: c.r, green: c.g, blue: c.b, alpha: 1)
    }
}
#endif
