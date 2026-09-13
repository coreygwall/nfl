import CoreText
import SwiftUI
import UIKit

// The design system, ported from src/index.css: paper and ink, hard offset shadows, 2pt borders,
// a display face for anything that shouts and Inter for everything else. Single-look (light),
// as the site is; the paper is the background everywhere.

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r, g, b: Double
        if s.count == 6 {
            r = Double((value >> 16) & 0xFF) / 255
            g = Double((value >> 8) & 0xFF) / 255
            b = Double(value & 0xFF) / 255
        } else {
            r = 0.5; g = 0.5; b = 0.5
        }
        self.init(red: r, green: g, blue: b)
    }

    static let paper = Color(hex: "#F6F1E8")
    static let paper2 = Color(hex: "#EDE5D6")
    static let paper3 = Color(hex: "#E3D9C6")
    static let ink = Color(hex: "#14120F")
    static let ink2 = Color(hex: "#5B554B")
    static let ink3 = Color(hex: "#8A8377")
    static let line = Color(hex: "#D9D0C0")
    static let turf = Color(hex: "#0B7A3B")
    static let turf2 = Color(hex: "#0F9A4C")
    static let turfSoft = Color(hex: "#DFF2E6")
    static let flag = Color(hex: "#FFD23F")
    static let flagSoft = Color(hex: "#FFF3C4")
    static let danger = Color(hex: "#D7263D")
    static let dangerSoft = Color(hex: "#FDE2E6")
    static let sky = Color(hex: "#2F80ED")
    static let skySoft = Color(hex: "#E1ECFC")
    static let bronze = Color(hex: "#E9C9A6")
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

