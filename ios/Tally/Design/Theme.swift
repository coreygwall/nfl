import CoreText
import SwiftUI
import UIKit

// The design system, ported from src/index.css: paper and ink, hard offset shadows, 2pt borders,
// a display face for anything that shouts and Inter for everything else.
//
// Every colour is a pair. The hex values are the same ones in `src/index.css`, and the reasoning
// behind the dark half lives there too — the short version is that paper-and-ink cannot be
// inverted. The shadow has its own colour and stays black in both themes, because a light shadow
// reads as a glow rather than as a card lying on a page; cards sit a step above a warm dark ground
// rather than being white; and anything *filled* with an accent keeps dark text on it.
//
// A card's outline is its own colour too (`cardBorder`), for the same reason pulled apart: in the
// dark theme it is a warm off-white a step down from `ink`, so an outline stays an outline instead
// of competing with the heading inside it. Buttons and chips still draw theirs in `ink`.

extension UIColor {
    fileprivate convenience init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        guard s.count == 6 else {
            self.init(white: 0.5, alpha: 1)
            return
        }
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension Color {
    init(hex: String) {
        self.init(uiColor: UIColor(hex: hex))
    }

    /// A colour that resolves against whatever theme the view is rendered in. Resolution happens at
    /// draw time, so `.preferredColorScheme` on the root — the app's own Light/Dark/Auto setting
    /// — reaches every one of these without a single call site knowing about it.
    init(light: String, dark: String) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }

    static let paper = Color(light: "#F6F1E8", dark: "#191611")
    static let paper2 = Color(light: "#EDE5D6", dark: "#2C261F")
    static let paper3 = Color(light: "#E3D9C6", dark: "#3A3229")
    static let ink = Color(light: "#14120F", dark: "#F4EFE6")
    static let ink2 = Color(light: "#5B554B", dark: "#B8AF9E")
    static let ink3 = Color(light: "#6B6456", dark: "#9C9384")
    static let line = Color(light: "#D9D0C0", dark: "#51483A")
    static let turf = Color(light: "#0B7A3B", dark: "#3FBF74")
    static let turf2 = Color(light: "#0F9A4C", dark: "#5AD48C")
    static let turfSoft = Color(light: "#DFF2E6", dark: "#16301F")
    static let flag = Color(light: "#FFD23F", dark: "#FFD23F")
    static let flagSoft = Color(light: "#FFF3C4", dark: "#3A2F10")
    static let danger = Color(light: "#D7263D", dark: "#FF6B7E")
    static let dangerSoft = Color(light: "#FDE2E6", dark: "#3A1720")
    static let sky = Color(light: "#2F80ED", dark: "#6FA8FF")
    static let skySoft = Color(light: "#E1ECFC", dark: "#16233A")
    static let bronze = Color(light: "#E9C9A6", dark: "#846444")

    /// Where the light theme said `.white`: the fill of a card, a button, a chip. It is a step
    /// lighter than the ground in the dark theme rather than white, or the cards shout.
    static let surface = Color(light: "#FFFFFF", dark: "#27221B")

    /// The outline of a card. Ink in the light theme, where it is the same black as the text; a
    /// warm off-white in the dark one, a step down from `ink` so an outline never competes with a
    /// heading for the eye. Only cards take it — buttons and chips keep drawing their border in
    /// `ink`, exactly as `.btn` and `.chip` do on the web.
    static let cardBorder = Color(light: "#14120F", dark: "#D8CFC0")

    /// The hard offset shadow. Black in both themes — it is what makes a card look lifted, and a
    /// light shadow is a glow.
    static let shadow = Color(light: "#14120F", dark: "#000000")

    /// Text that sits *on* a filled accent — a green button, a red one. White reads on the deep
    /// light-theme green; the lighter dark-theme green needs black, and so does the pink-red.
    static let onFill = Color(light: "#FFFFFF", dark: "#14120F")

    /// Text on the yellow flag, which is the same yellow in both themes and always wants black.
    static let onAccent = Color(hex: "#14120F")
}

enum TallyRadius {
    static let card: CGFloat = 20
    static let inner: CGFloat = 16
    static let badge: CGFloat = 12
}

/// The two families, by PostScript name (scripts/build-ios-fonts.py). If a font failed to
/// register the system's rounded face stands in, so a missing file never blanks a screen.
enum TallyFont {
    enum Weight { case semibold, bold, extraBold }

    static func display(_ size: CGFloat, weight: Weight = .extraBold) -> Font {
        let name: String
        let fallback: Font.Weight
        switch weight {
        case .semibold: name = "BricolageGrotesque-SemiBold"; fallback = .semibold
        case .bold: name = "BricolageGrotesque-Bold"; fallback = .bold
        case .extraBold: name = "BricolageGrotesque-ExtraBold"; fallback = .heavy
        }
        return FontRegistrar.available(name) ? .custom(name, size: size) : .system(size: size, weight: fallback, design: .rounded)
    }

    static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .heavy, .black, .bold: name = weight == .bold ? "Inter-Bold" : "Inter-ExtraBold"
        case .semibold, .medium: name = "Inter-SemiBold"
        default: name = "Inter-Regular"
        }
        return FontRegistrar.available(name) ? .custom(name, size: size) : .system(size: size, weight: weight)
    }
}

enum FontRegistrar {
    private static var checked: [String: Bool] = [:]

    /// Registers every .ttf in the bundle at launch; nothing in Info.plist to keep in step.
    static func registerBundledFonts() {
        let urls = (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
            + (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? [])
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    static func available(_ name: String) -> Bool {
        if let known = checked[name] { return known }
        let ok = UIFont(name: name, size: 12) != nil
        checked[name] = ok
        return ok
    }
}

extension View {
    func display(_ size: CGFloat, weight: TallyFont.Weight = .extraBold) -> some View {
        font(TallyFont.display(size, weight: weight))
    }

    func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> some View {
        font(TallyFont.sans(size, weight: weight))
    }
}
