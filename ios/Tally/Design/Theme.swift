import CoreText
import SwiftUI
import TallyKit
import UIKit

// The design system, ported from src/index.css: paper and ink, hard offset shadows, 2pt borders,
// a display face for anything that shouts and Inter for everything else.
//
// The colours themselves are in `TallyKit/Design/Palette.swift`, because the widget extension
// draws in them too and cannot see this target. These are the names the app says out loud —
// `Color.paper` rather than `TallyPalette.paper` — pointing at that one definition, so a call site
// here reads the same as it always did and there is still only one place a hex lives.

extension Color {
    static let paper = TallyPalette.paper
    static let paper2 = TallyPalette.paper2
    static let paper3 = TallyPalette.paper3
    static let ink = TallyPalette.ink
    static let ink2 = TallyPalette.ink2
    static let ink3 = TallyPalette.ink3
    static let line = TallyPalette.line
    static let turf = TallyPalette.turf
    static let turf2 = TallyPalette.turf2
    static let turfSoft = TallyPalette.turfSoft
    static let rank5 = TallyPalette.rank5
    static let rank4 = TallyPalette.rank4
    static let rank3 = TallyPalette.rank3
    static let rank2 = TallyPalette.rank2
    static let rank1 = TallyPalette.rank1
    static let flag = TallyPalette.flag
    static let flagSoft = TallyPalette.flagSoft
    static let danger = TallyPalette.danger
    static let dangerSoft = TallyPalette.dangerSoft
    static let sky = TallyPalette.sky
    static let skySoft = TallyPalette.skySoft
    static let bronze = TallyPalette.bronze
    static let surface = TallyPalette.surface
    static let cardBorder = TallyPalette.cardBorder
    static let shadow = TallyPalette.shadow
    static let onFill = TallyPalette.onFill
    static let onAccent = TallyPalette.onAccent
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
