import SwiftUI
import TallyKit

// MARK: Cards

/// `.card` and `.card-flat` from the web: white, 2pt ink border, 20pt corners, and (hard) the
/// offset shadow that gives the whole app its sticker-on-paper look.
struct TallyCard: ViewModifier {
    var hard: Bool
    var fill: Color
    var border: Color
    var radius: CGFloat
    var dashed: Bool

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    if hard {
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .fill(Color.ink)
                            .offset(x: 4, y: 4)
                    }
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(fill)
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(border, style: StrokeStyle(lineWidth: 2, dash: dashed ? [6, 5] : []))
                }
            }
    }
}

extension View {
    func card(hard: Bool = true, fill: Color = .white, border: Color = .ink, radius: CGFloat = TallyRadius.card, dashed: Bool = false) -> some View {
        modifier(TallyCard(hard: hard, fill: fill, border: border, radius: radius, dashed: dashed))
    }

    func cardFlat(fill: Color = .white, border: Color = .ink, radius: CGFloat = TallyRadius.card, dashed: Bool = false) -> some View {
        modifier(TallyCard(hard: false, fill: fill, border: border, radius: radius, dashed: dashed))
    }
}

// MARK: Buttons

/// `.btn`: a pill with a 2pt border and a 2pt hard shadow that the button sinks into when pressed.
struct TallyButtonStyle: ButtonStyle {
    enum Kind { case plain, primary, turf, flag, ghost, danger }
    enum Size { case regular, small }

    var kind: Kind = .plain
    var size: Size = .regular
    var fullWidth = false

    @Environment(\.isEnabled) private var isEnabled

    private var background: Color {
        switch kind {
        case .plain: return .white
        case .primary: return .ink
        case .turf: return .turf
        case .flag: return .flag
        case .ghost: return .clear
        case .danger: return .danger
        }
    }

    private var foreground: Color {
        switch kind {
        case .primary: return .paper
        case .turf, .danger: return .white
        default: return .ink
        }
    }

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let ghost = kind == .ghost
        return configuration.label
            .font(TallyFont.display(size == .small ? 15 : 17, weight: .bold))
            .foregroundStyle(foreground)
            .padding(.horizontal, size == .small ? 14 : 20)
            .frame(minHeight: size == .small ? 38 : 48)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background {
                ZStack {
                    if !ghost {
                        Capsule().fill(Color.ink).offset(x: pressed ? 0 : 2, y: pressed ? 0 : 2)
                    }
                    Capsule().fill(background)
                    if !ghost { Capsule().strokeBorder(Color.ink, lineWidth: 2) }
                }
            }
            .offset(x: pressed && !ghost ? 2 : 0, y: pressed && !ghost ? 2 : 0)
            .opacity(isEnabled ? 1 : 0.45)
            .animation(.easeOut(duration: 0.12), value: pressed)
            .contentShape(Capsule())
    }
}

extension ButtonStyle where Self == TallyButtonStyle {
    static var tally: TallyButtonStyle { TallyButtonStyle() }
    static func tally(_ kind: TallyButtonStyle.Kind, size: TallyButtonStyle.Size = .regular, fullWidth: Bool = false) -> TallyButtonStyle {
        TallyButtonStyle(kind: kind, size: size, fullWidth: fullWidth)
    }
}

/// An inline text button: bold, underlined, the colour of ink.
struct LinkButton: View {
    let title: String
    var color: Color = .ink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).underline().sans(14, weight: .bold).foregroundStyle(color)
        }
        .buttonStyle(.plain)
    }
}

// MARK: Chips and badges

/// How much room a capsule has to leave at its ends.
///
/// A line of text can sit close to a capsule's edge because text is short in the middle of the
/// pill, where the cap has not started curving yet. A logo cannot: it is a square, and its corners
/// land exactly where the cap curves away, so with text-sized padding they hang outside the
/// outline. These are the numbers that keep a square clear of the curve — worked out once here
/// rather than guessed at each chip.
enum PillFit {
    /// Height of a capsule holding `content`-tall content with `vertical` padding and a border.
    static func height(content: CGFloat, vertical: CGFloat, border: CGFloat = 2) -> CGFloat {
        content + vertical * 2 + border * 2
    }

    /// Leading/trailing padding that keeps a `content` x `content` square inside the cap, with a
    /// little air so it reads as deliberate rather than as a near miss.
    static func end(content: CGFloat, vertical: CGFloat, border: CGFloat = 2, air: CGFloat = 2) -> CGFloat {
        let r = content / 2 + vertical + border
        let half = content / 2
        let bite = r - (r * r - half * half).squareRoot()
        return (bite + air).rounded()
    }

    /// The pick and empty chips share these so that five of them, in any mix, line up.
    enum Chip {
        static let logo: CGFloat = 24
        static let badge: CGFloat = 18
        static let vertical: CGFloat = 3
        static let gap: CGFloat = 3
        static var leading: CGFloat { PillFit.end(content: logo, vertical: vertical) }
        static var trailing: CGFloat { PillFit.end(content: badge, vertical: (logo - badge) / 2 + vertical) }
    }
}


struct Chip: View {
    let text: String
    var fill: Color = .white
    var display = false
    var size: CGFloat = 12.5

    var body: some View {
        Text(text)
            .font(display ? TallyFont.display(size, weight: .extraBold) : TallyFont.sans(size, weight: .bold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            .lineLimit(1)
    }
}

/// The points a rank is worth, in a square: gold for the 5, muted once it is locked.
struct RankBadge: View {
    enum Size { case small, medium, large }
    let rank: Int
    var size: Size = .medium
    var muted = false

    private var side: CGFloat {
        switch size { case .small: return 28; case .medium: return 40; case .large: return 56 }
    }

    var body: some View {
        let points = Scoring.points(forRank: rank)
        VStack(spacing: 1) {
            Text("\(points)")
                .font(TallyFont.display(size == .large ? 24 : size == .small ? 12 : 16))
                .monospacedDigit()
            if size != .small {
                Text("PTS").font(TallyFont.sans(8, weight: .bold)).foregroundStyle(Color.ink2).tracking(0.8)
            }
        }
        .foregroundStyle(muted ? Color.ink3 : Color.ink)
        .frame(width: side, height: side)
        .background(RoundedRectangle(cornerRadius: TallyRadius.badge, style: .continuous).fill(muted ? Color.paper2 : rank == 1 ? Color.flag : Color.white))
        .overlay(RoundedRectangle(cornerRadius: TallyRadius.badge, style: .continuous).strokeBorder(Color.ink, lineWidth: 2))
        .accessibilityLabel("Rank \(rank), \(points) points")
    }
}

/// Standing on the board. Gold, silver, bronze — muted until something has been scored.
struct PlaceBadge: View {
    let place: Int
    var small = false
    var muted = false

    var body: some View {
        let tone: Color = muted ? .paper2 : place == 1 ? .flag : place == 2 ? .paper3 : place == 3 ? .bronze : .white
        Text("\(place)")
            .font(TallyFont.display(small ? 12 : 14))
            .monospacedDigit()
            .foregroundStyle(muted ? Color.ink3 : Color.ink)
            .frame(width: small ? 28 : 36, height: small ? 28 : 36)
            .background(Circle().fill(tone))
            .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
    }
}

/// The "LOCKED IN" stamp: heavy, uppercase, a thick border, and a tilt.
struct Stamp: View {
    let text: String
    var color: Color = .turf

    var body: some View {
        Text(text.uppercased())
            .font(TallyFont.display(30))
            .tracking(2)
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color, lineWidth: 4))
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(TallyFont.display(11))
            .tracking(1.2)
            .foregroundStyle(Color.ink3)
    }
}

struct DashedDivider: View {
    var body: some View {
        Line().stroke(Color.line, style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
            .frame(height: 2)
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return p
        }
    }
}

// MARK: States

struct Spinner: View {
    var label = "Loading…"
    @State private var spinning = false

    var body: some View {
        VStack(spacing: 12) {
            Circle()
                .strokeBorder(Color.ink, lineWidth: 4)
                .overlay(
                    Circle().trim(from: 0, to: 0.25)
                        .stroke(Color.flag, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .padding(2)
                )
                .frame(width: 36, height: 36)
                .rotationEffect(.degrees(spinning ? 360 : 0))
                .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: spinning)
            Text(label).sans(14, weight: .semibold).foregroundStyle(Color.ink3)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 56)
        .onAppear { spinning = true }
    }
}

struct ErrorState: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 6) {
            Text("Hmm, that didn't load.").display(20)
            Text(message).sans(14).foregroundStyle(Color.ink2).multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry).buttonStyle(.tally(.plain, size: .small)).padding(.top, 10)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .card()
        .padding(.vertical, 24)
    }
}

struct EmptyState<Action: View>: View {
    let title: String
    let body_: String?
    let action: Action

    init(title: String, body: String? = nil, @ViewBuilder action: () -> Action) {
        self.title = title
        self.body_ = body
        self.action = action()
    }

    var body: some View {
        VStack(spacing: 6) {
            Text(title).display(18)
            if let body_ { Text(body_).sans(14).foregroundStyle(Color.ink2).multilineTextAlignment(.center) }
            action.padding(.top, 10)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 28)
        .frame(maxWidth: .infinity)
        .cardFlat(fill: Color.paper2.opacity(0.6), border: .ink, dashed: true)
    }
}

extension EmptyState where Action == EmptyView {
    init(title: String, body: String? = nil) {
        self.init(title: title, body: body) { EmptyView() }
    }
}

// MARK: Controls

/// Two or three options in a bordered track, with an ink pill sliding under the active one.
struct TallySegmented<T: Hashable>: View {
    @Binding var value: T
    let options: [(T, String)]
    @Namespace private var pill

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let active = option.0 == value
                Button {
                    if !active { Haptics.tap() }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { value = option.0 }
                } label: {
                    Text(option.1)
                        .font(TallyFont.display(13, weight: .bold))
                        .foregroundStyle(active ? Color.paper : Color.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background {
                            if active {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color.ink)
                                    .matchedGeometryEffect(id: "pill", in: pill)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .cardFlat()
    }
}

/// `.card-flat` around a text field, the way every input on the site is drawn.
struct TallyFieldStyle: ViewModifier {
    var centered = false
    var font: Font = TallyFont.sans(17)

    func body(content: Content) -> some View {
        content
            .font(font)
            .multilineTextAlignment(centered ? .center : .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .background(RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous).strokeBorder(Color.ink, lineWidth: 2))
    }
}

extension View {
    func tallyField(centered: Bool = false, font: Font = TallyFont.sans(17)) -> some View {
        modifier(TallyFieldStyle(centered: centered, font: font))
    }
}

/// A sideways shake for a rejected input. Bump the trigger to shake again.
struct ShakeEffect: GeometryEffect {
    var travel: CGFloat = 8
    var shakes: CGFloat = 3
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: travel * sin(animatableData * .pi * shakes), y: 0))
    }
}

extension View {
    func shake(_ trigger: Int) -> some View {
        modifier(ShakeEffect(animatableData: CGFloat(trigger)))
            .animation(.linear(duration: 0.35), value: trigger)
    }
}

/// The fixed max width for reading content, like `max-w-[760px]` on the site.
extension View {
    func readable(_ width: CGFloat = 760) -> some View {
        frame(maxWidth: width).frame(maxWidth: .infinity)
    }
}
