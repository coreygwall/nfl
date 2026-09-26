import SwiftUI
import TallyKit

// MARK: Cards

/// `.card` and `.card-flat` from the web: a surface fill, 2pt ink border, 20pt corners, and (hard)
/// the offset shadow that gives the whole app its sticker-on-paper look. The shadow is `.shadow`
/// rather than `.ink` because `ink` is light in the dark theme, and a light shadow is a glow.
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
                            .fill(Color.shadow)
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
    func card(hard: Bool = true, fill: Color = .surface, border: Color = .cardBorder, radius: CGFloat = TallyRadius.card, dashed: Bool = false) -> some View {
        modifier(TallyCard(hard: hard, fill: fill, border: border, radius: radius, dashed: dashed))
    }

    func cardFlat(fill: Color = .surface, border: Color = .cardBorder, radius: CGFloat = TallyRadius.card, dashed: Bool = false) -> some View {
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
    /// Overrides the kind's own label colour, the way `Chip` does. It exists for the one shape the
    /// fills cannot say: a button that is a *real* button — surface, border, hard shadow — whose
    /// word is red. A solid `.danger` fill is the app's word for irreversible, and spending it on
    /// something reversible (signing out, which leaves every pick on the board) teaches people to
    /// ignore it where it matters.
    var label: Color? = nil

    @Environment(\.isEnabled) private var isEnabled

    private var background: Color {
        switch kind {
        case .plain: return .surface
        case .primary: return .ink
        case .turf: return .turf
        case .flag: return .flag
        case .ghost: return .clear
        case .danger: return .danger
        }
    }

    private var foreground: Color {
        if let label { return label }
        switch kind {
        case .primary: return .paper
        case .turf, .danger: return .onFill
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
                        Capsule().fill(Color.shadow).offset(x: pressed ? 0 : 2, y: pressed ? 0 : 2)
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
    static func tally(
        _ kind: TallyButtonStyle.Kind,
        size: TallyButtonStyle.Size = .regular,
        fullWidth: Bool = false,
        label: Color? = nil
    ) -> TallyButtonStyle {
        TallyButtonStyle(kind: kind, size: size, fullWidth: fullWidth, label: label)
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
    var fill: Color = .surface
    var display = false
    var size: CGFloat = 12.5
    /// The label's colour. Defaults to ink; a yellow chip passes `.onAccent`, because the flag is
    /// the same yellow in both themes and ink is white in the dark one. The parity test insists.
    var label: Color = .ink

    var body: some View {
        Text(text)
            .font(display ? TallyFont.display(size, weight: .extraBold) : TallyFont.sans(size, weight: .bold))
            .foregroundStyle(label)
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

    /**
     One green in five steps: the five-pointer solid, the rest fading towards paper.

     Gold used to mark rank 1 and is deliberately gone from here — it is reserved for *place*, the
     winner of a week or the leader of the season, so a confident pick and a result never read as
     the same thing. It was also the dark-mode bug in the screenshot: a yellow fill under `ink`,
     which is near-white in the dark theme. The ramp's label colour comes from the palette with
     the fill, so the two cannot be paired wrong again.

     The "PTS" label takes the same colour as the number. A second, dimmer colour would be a second
     contrast pair to keep legal on every step, and size already carries the hierarchy.
     */
    var body: some View {
        let points = Scoring.points(forRank: rank)
        VStack(spacing: 1) {
            Text("\(points)")
                .font(TallyFont.display(size == .large ? 24 : size == .small ? 12 : 16))
                .monospacedDigit()
                // Rolls up or down with the change, wherever the caller animates one.
                .contentTransition(.numericText(value: Double(points)))
            if size != .small {
                Text("PTS").font(TallyFont.sans(8, weight: .bold)).tracking(0.8)
            }
        }
        .foregroundStyle(muted ? Color.ink3 : TallyPalette.onRank(rank))
        .frame(width: side, height: side)
        .background(RoundedRectangle(cornerRadius: TallyRadius.badge, style: .continuous).fill(muted ? Color.paper2 : TallyPalette.rank(rank)))
        .overlay(RoundedRectangle(cornerRadius: TallyRadius.badge, style: .continuous).strokeBorder(Color.ink, lineWidth: 2))
        .accessibilityLabel("Rank \(rank), \(points) points")
    }
}

/**
 A yellow mark with something drawn on it — a step number, a trophy, a tick.

 This is the one place the flag is used as a fill *under* text, so it is the one place that text's
 colour lives: black in both themes, because the flag is the same yellow in both and `ink` is
 near-white in the dark one. Every yellow-with-a-glyph used to be drawn by hand at its call site,
 and every one of them inherited `ink` — which is how four screens shipped white-on-yellow in dark
 mode without anybody noticing. `themeParity.test.ts` fails on a raw flag fill outside this file.
 */
struct FlagMark<Content: View>: View {
    var size: CGFloat = 36
    /// Nil draws a circle.
    var corner: CGFloat? = nil
    var bordered = true
    @ViewBuilder let content: Content

    var body: some View {
        let glyph = content
            .foregroundStyle(Color.onAccent)
            .frame(width: size, height: size)
        if let corner {
            let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
            glyph
                .background(shape.fill(Color.flag))
                .overlay(shape.strokeBorder(Color.ink, lineWidth: bordered ? 2 : 0))
        } else {
            glyph
                .background(Circle().fill(Color.flag))
                .overlay(Circle().strokeBorder(Color.ink, lineWidth: bordered ? 2 : 0))
        }
    }
}

/// Standing on the board. Gold, silver, bronze — muted until something has been scored.
struct PlaceBadge: View {
    let place: Int
    var small = false
    var muted = false
    /// Won it, rather than merely leading it. The number gives way to a trophy — the place is the
    /// same either way, and at the end of a week the result is the more interesting fact.
    var crowned = false

    var body: some View {
        let tone: Color = muted ? .paper2 : place == 1 ? .flag : place == 2 ? .paper3 : place == 3 ? .bronze : .surface
        Group {
            if crowned {
                Image(systemName: "trophy.fill")
                    .font(.system(size: small ? 12 : 16, weight: .bold))
                    .foregroundStyle(Color.ink)
            } else {
                Text("\(place)")
                    .font(TallyFont.display(small ? 12 : 14))
                    .monospacedDigit()
                    .foregroundStyle(muted ? Color.ink3 : Color.ink)
            }
        }
        .frame(width: small ? 28 : 36, height: small ? 28 : 36)
        .background(Circle().fill(tone))
        .overlay(Circle().strokeBorder(Color.ink, lineWidth: 2))
        .accessibilityLabel(crowned ? "Winner" : "Place \(place)")
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

/**
 The name at the top of a page: the mark and, in display type, where you are.

 It is content, not a toolbar item, and that is the whole point. It was a chip in the navigation
 bar's leading slot, and on iOS 26 the bar wraps each item in Liquid Glass and sizes that glass to
 what it feels like proposing — which for a truncatable name was a circle with room for one letter.
 A row at the top of the scroll view is laid out by the same rules as everything under it, so the
 name is the width of the page and the bar keeps only the buttons that belong there.
 */
/**
 Where you are, and — for a contest that has controls — what you can do about it, on one line.

 The name is still page content rather than a navigation-bar title: iOS 26 wraps a leading toolbar
 item in glass sized to its own idea of the width, which for a pool's name was one letter. So the
 pool's *controls* came down to the name instead of the name going up to them, and the bar is
 hidden. That buys back a whole strip at the top of every tab, and the two things a header is for
 — saying where you are and offering what belongs here — finally sit together.

 `trailing` is empty for a family that has no controls (the app's own home, a golf card), which is
 what the second initialiser is for.
 */
struct ScreenHeader<Trailing: View>: View {
    let mark: String
    let title: String
    private let trailing: Trailing

    init(mark: String, title: String, @ViewBuilder trailing: () -> Trailing) {
        self.mark = mark
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 10) {
                Image(mark)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 32, height: 32)
                Text(title)
                    .font(TallyFont.display(26))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    // Lower than it was, because the name shares its line now. A long pool name
                    // shrinks rather than pushing the controls off the right edge.
                    .minimumScaleFactor(0.6)
            }
            // Only the name is the heading. Combining the whole row would swallow the controls,
            // which are the reason the row exists.
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
        .padding(.bottom, 12)
    }
}

extension ScreenHeader where Trailing == EmptyView {
    init(mark: String, title: String) {
        self.init(mark: mark, title: title) { EmptyView() }
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

/**
 Kept as the name every screen already calls, so the app has one wait rather than two. What it
 draws is `TallyLoader` — the mark, not a ring.
 */
struct Spinner: View {
    var label: String? = "Loading…"

    var body: some View { TallyLoader(label: label) }
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
        .cardFlat(fill: Color.paper2.opacity(0.6), border: .cardBorder, dashed: true)
    }
}

extension EmptyState where Action == EmptyView {
    init(title: String, body: String? = nil) {
        self.init(title: title, body: body) { EmptyView() }
    }
}

// MARK: Gestures

extension View {
    /**
     Pinch does nothing here.

     Tally has no zoomable content — no maps, no photographs, nothing you would ever want closer
     than the layout puts it — so a pinch that scales the page is always an accident, and one that
     leaves it scaled *and* panned is a screen with no obvious way back. A gesture that recognises
     the pinch and does nothing with it keeps anything underneath from acting on it. Scrolling is a
     one-finger gesture and is untouched.
     */
    func noZoom() -> some View {
        highPriorityGesture(MagnifyGesture(minimumScaleDelta: 0))
    }
}

// MARK: Controls

/// Two or three options in a bordered track, with an ink pill sliding under the active one.
///
/// An option can be a glyph instead of words (`symbols:`), which is how the board's list/grid
/// toggle wears the same track, pill and height as Week/Season beside it. `fill: false` lets a
/// control like that sit at its own width rather than stretching across the row.
struct TallySegmented<T: Hashable>: View {
    @Binding var value: T
    private let options: [(value: T, label: String, symbol: String?)]
    private let fill: Bool
    @Namespace private var pill

    init(value: Binding<T>, options: [(T, String)], fill: Bool = true) {
        _value = value
        self.options = options.map { (value: $0.0, label: $0.1, symbol: nil) }
        self.fill = fill
    }

    /// Glyph options: `(value, SF Symbol, what VoiceOver says)`.
    init(value: Binding<T>, symbols: [(T, String, String)], fill: Bool = false) {
        _value = value
        self.options = symbols.map { (value: $0.0, label: $0.2, symbol: $0.1) }
        self.fill = fill
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let active = option.value == value
                Button {
                    if !active { Haptics.tap() }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { value = option.value }
                } label: {
                    label(for: option, active: active)
                        .frame(maxWidth: fill ? .infinity : nil)
                        .padding(.horizontal, fill ? 0 : 14)
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
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(4)
        .cardFlat()
    }

    @ViewBuilder
    private func label(for option: (value: T, label: String, symbol: String?), active: Bool) -> some View {
        let font = TallyFont.display(13, weight: .bold)
        if let symbol = option.symbol {
            // A hidden line of text in the same font sizes the glyph's slot, so a glyph option is
            // exactly as tall as a worded one, at every Dynamic Type size.
            Text("Ag").font(font).hidden()
                .overlay {
                    Image(systemName: symbol)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(active ? Color.paper : Color.ink2)
                }
        } else {
            Text(option.label)
                .font(font)
                .foregroundStyle(active ? Color.paper : Color.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
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
            .background(RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous).fill(Color.surface))
            // A field is a card you type into — on the web it literally wears `.card-flat` — so it
            // takes the card outline rather than the ink one buttons use.
            .overlay(RoundedRectangle(cornerRadius: TallyRadius.inner, style: .continuous).strokeBorder(Color.cardBorder, lineWidth: 2))
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

/**
 `flex-wrap`, as a layout.

 SwiftUI has no wrapping stack, and the usual workaround — chunking the items into fixed rows of
 four — guesses at a width it cannot know, so it leaves a gap on a big phone and clips on a small
 one. This measures instead: items go along the row until the next one would not fit, then start a
 new one. Used for the past-week chips on Home, where by December there are seventeen.
 */
struct FlowRow: Layout {
    var spacing: CGFloat = 8
    var rowSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = layout(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.reduce(0) { $0 + $1.height } + rowSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in layout(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += row.height + rowSpacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func layout(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needs = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            if !row.indices.isEmpty, needs > width {
                rows.append(row)
                row = Row()
                row.indices = [index]
                row.width = size.width
                row.height = size.height
            } else {
                row.indices.append(index)
                row.width = needs
                row.height = max(row.height, size.height)
            }
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}
