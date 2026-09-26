import SwiftUI
import TallyKit

/// One game: two sides that each look like the button they are, and the kickoff between them.
struct GameCard: View {
    @Environment(AppModel.self) private var model
    let game: Game
    let locked: Bool
    let now: Date
    let selection: String?
    let frozenPick: Pick?
    let counts: PickCount?
    /// Five are already picked and this one is not among them. Still tappable, just quieter.
    let muted: Bool
    /// The team, and where its sticker was on screen when it was tapped — the tray flight's
    /// starting point (`PickFlights`).
    let onPick: (String, CGRect?) -> Void

    /// Each side's sticker in window coordinates, read only when one is tapped.
    @State private var stickers = FrameBox()

    private var imminent: Bool {
        let toKick = game.kickoffAt.timeIntervalSince(now)
        return !locked && toKick > 0 && toKick < 3600
    }

    var body: some View {
        HStack(spacing: 0) {
            side(game.away, count: counts?.away)
            VStack(spacing: 2) {
                Text(game.neutral ? "vs" : "@").font(TallyFont.display(16)).foregroundStyle(Color.ink3)
                if locked {
                    HStack(spacing: 2) {
                        Image(systemName: "lock.fill").font(.system(size: 8, weight: .bold))
                        Text(game.status == .final ? "Final" : "Live")
                    }
                    .sans(10, weight: .bold).foregroundStyle(Color.ink3)
                } else {
                    Text(imminent ? "locks in \(Format.countdown(to: game.kickoffAt, from: now))" : Format.slot(game.kickoffAt))
                        .sans(10, weight: .semibold)
                        .foregroundStyle(imminent ? Color.danger : Color.ink3)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(width: 78)
            side(game.home, count: counts?.home)
        }
        .padding(2)
        .cardFlat(fill: locked ? Color.paper2.opacity(0.7) : .surface)
        .background {
            if selection != nil, !locked {
                RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).fill(Color.ink).offset(x: 4, y: 4)
            }
        }
        .offset(y: selection != nil && !locked ? -1 : 0)
        .opacity(muted ? 0.45 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: selection)
        .animation(.easeOut(duration: 0.2), value: muted)
    }

    private func side(_ abbr: String, count: Int?) -> some View {
        let team = model.sport.teamOrPlaceholder(abbr)
        let sel = selection == abbr
        let dim = selection != nil && !sel
        let won = game.winner == abbr
        return Button {
            onPick(abbr, stickers.frames[abbr])
        } label: {
            VStack(spacing: 4) {
                TeamSticker(team: team, size: 50, selected: sel, dimmed: dim)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { stickers.frames[abbr] = $0 }
                Text(team.nickname)
                    .font(TallyFont.display(13.5))
                    .foregroundStyle(dim ? Color.ink3 : Color.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if won {
                    Text("WON").sans(10, weight: .bold).tracking(0.8).foregroundStyle(Color.turf)
                } else if let count {
                    Text("\(count) picked").sans(10, weight: .semibold).foregroundStyle(Color.ink2)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 6)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(sel ? Color(hex: team.primary).opacity(0.08) : locked ? Color.clear : Color.paper2.opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(locked ? Color.clear : sel ? Color.ink : Color.line, lineWidth: 2)
            )
            .overlay(alignment: .topLeading) {
                if sel, let frozenPick {
                    RankBadge(rank: frozenPick.rank, size: .small).padding(4)
                }
            }
            .padding(4)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(locked)
        .accessibilityLabel("Pick \(team.fullName)")
        .accessibilityAddTraits(sel ? .isSelected : [])
    }
}

/// `whileTap={{ scale: 0.96 }}`.
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// The five slots and the button, floating over the tab bar on glass.
struct PickTrayView: View {
    @Environment(AppModel.self) private var model
    @Environment(PickFlights.self) private var flights: PickFlights?
    let state: PickTrayState

    var body: some View {
        let count = state.merged.count
        let editable = state.merged.filter { !state.frozenIds.contains($0.gameId) }.count
        let full = count >= state.slots
        let label = count == 0 ? "Pick \(state.slots)" : full ? "Rank them →" : "Rank \(count) →"
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(0..<max(state.slots, 1), id: \.self) { i in
                    let pick = i < state.merged.count ? state.merged[i] : nil
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.paper2.opacity(0.6))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.line, style: StrokeStyle(lineWidth: 2, dash: [4, 3])))
                        // Held empty while its sticker is still in the air (`PickFlights`).
                        if let pick, !(flights?.landing.contains(pick.gameId) ?? false) {
                            let frozen = state.frozenIds.contains(pick.gameId)
                            Button {
                                if !frozen { state.onRemove(pick.gameId) }
                            } label: {
                                // 30 inside a 40pt slot: the slot's corner radius is 12, so a
                                // bigger square would have its corners hanging over the dashes.
                                TeamSticker(team: model.sport.teamOrPlaceholder(pick.team), size: PickFlightLayer.slotSticker, flat: true)
                                    .overlay(alignment: .bottomTrailing) {
                                        if frozen {
                                            Image(systemName: "lock.fill")
                                                .font(.system(size: 8, weight: .bold))
                                                .foregroundStyle(Color.paper)
                                                .padding(3)
                                                .background(Circle().fill(Color.ink))
                                                .offset(x: 2, y: 2)
                                        }
                                    }
                            }
                            .buttonStyle(PressScaleStyle())
                            .transition(.scale.combined(with: .opacity))
                            .accessibilityLabel(frozen ? "\(pick.team), locked" : "Remove \(pick.team)")
                        }
                    }
                    .frame(width: 40, height: 40)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { flights?.slots.frames["\(i)"] = $0 }
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: state.merged)
            Spacer(minLength: 4)
            Button(action: state.onNext) {
                Text(label)
                    .font(TallyFont.display(full ? 17 : 15, weight: .bold))
                    .foregroundStyle(full ? Color.onFill : Color.paper)
                    .padding(.horizontal, full ? 18 : 14)
                    .frame(minHeight: full ? 46 : 40)
                    .background(Capsule().fill(full ? Color.turf : Color.ink))
                    .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 2))
            }
            .buttonStyle(PressScaleStyle())
            .disabled(count == 0 || state.disabled || editable == 0)
            .opacity(count == 0 || state.disabled || editable == 0 ? 0.45 : 1)
        }
        .padding(8)
        .glassCard(cornerRadius: 24)
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.ink, lineWidth: 2))
        .shake(state.shake)
    }
}

/**
 The pick, and how its game is going.

 Before kickoff the second line is the matchup and the time. Once there is a score it is the score,
 from this pick's side — "Leading the Raiders 24–17" — because a row on a Sunday afternoon is read
 for exactly that, and a time that has already passed says nothing. When it is over it says how it
 ended. A live game whose score has not arrived yet keeps the matchup rather than inventing 0–0.
 */
struct MatchupText: View {
    @Environment(AppModel.self) private var model
    let pick: Pick
    let game: Game?
    var compact = false

    var body: some View {
        let team = model.sport.teamOrPlaceholder(pick.team)
        VStack(alignment: .leading, spacing: 2) {
            Text(team.nickname).font(TallyFont.display(15)).lineLimit(1)
            Text(detail).sans(12).foregroundStyle(Color.ink2).lineLimit(1)
        }
    }

    private var detail: String {
        guard let game else { return "" }
        let opp = model.sport.teamOrPlaceholder(game.opponent(of: pick.team))
        let name = compact ? opp.display : "the \(opp.nickname)"
        if let scores = scores(game) {
            let line = "\(scores.mine)–\(scores.theirs)"
            if let winner = game.winner {
                if winner == "TIE" { return "Tied \(name) \(line)" }
                return winner == pick.team ? "Won \(line) over \(name)" : "Lost \(line) to \(name)"
            }
            if scores.mine > scores.theirs { return "Leading \(name) \(line)" }
            if scores.mine < scores.theirs { return "Trailing \(name) \(line)" }
            return "Level with \(name) \(line)"
        }
        // Before kickoff it is a fixture, not a claim: "vs." at home, "@" away, the way a schedule reads.
        return "\(pick.team == game.home ? "vs." : "@") \(opp.display) · \(Format.time(game.kickoffAt))"
    }

    /// Both numbers, from this pick's side, once the game has one.
    private func scores(_ game: Game) -> (mine: Int, theirs: Int)? {
        guard let away = game.awayScore, let home = game.homeScore, game.status != .upcoming else { return nil }
        return pick.team == game.home ? (home, away) : (away, home)
    }
}

enum OutcomeStyle {
    static func fill(_ o: PickOutcome) -> Color {
        switch o {
        case .win: return .turfSoft
        case .loss: return .dangerSoft
        case .tie: return .paper2
        case .live: return .flagSoft
        case .pending: return .surface
        }
    }

    static func border(_ o: PickOutcome) -> Color {
        switch o {
        case .win: return .turf
        case .loss: return Color.danger.opacity(0.55)
        case .tie, .pending: return .line
        case .live: return .flag
        }
    }
}

struct OutcomeTag: View {
    let outcome: PickOutcome
    let points: Int

    var body: some View {
        switch outcome {
        case .win: Text("+\(points)").font(TallyFont.display(18)).foregroundStyle(Color.turf)
        case .loss: Text("0").font(TallyFont.display(18)).foregroundStyle(Color.danger)
        case .tie: Text("Tie").sans(12, weight: .bold).foregroundStyle(Color.ink2)
        case .live: Text("Live").sans(12, weight: .bold).foregroundStyle(Color.ink2)
        case .pending: Text("Not yet").sans(12, weight: .bold).foregroundStyle(Color.ink3)
        }
    }
}

/**
 Drag to reorder without a `List`: the whole screen scrolls as one, so the rows are laid out by
 hand and a drag lifts a row and slides it past its neighbours. Two ways to lift one: the grip
 lifts at once, and anywhere else on the card lifts after a press and hold — people reach for the
 card, not the grip, and a card that scrolls the page when it is pulled reads as broken. The hold
 is what keeps a scroll a scroll: a finger that moves first is scrolling and the sequence never
 starts, one that stays is lifting and the scroll view lets it go. The chevrons do the same thing
 one step at a time, for anyone who would rather tap.

 The badges answer the drag while it is happening. A row held over another already wears the
 points it would be worth if you let go there, and the rows it pushes aside wear theirs — digits
 rolling, a tick in the hand at every slot crossed — so "how sure am I about this one" is read off
 the number as you move it, not found out after you drop it.
 */
struct ReorderList: View {
    @Environment(AppModel.self) private var model
    let order: [String]
    let availableRanks: [Int]
    let selections: [String: String]
    let gamesById: [String: Game]
    let onOrder: ([String]) -> Void

    @State private var dragging: String?
    @State private var dragOffset: CGFloat = 0
    /// Each row's height as it actually laid out. The slots used to be a constant 70pt, which
    /// stopped being true the day the chevrons grew to 44pt apiece: a row is ~110pt tall, so each
    /// card was drawn over the bottom of the one above it, the first over the subtitle and the last
    /// over the footnote. Measured, the slots follow the row — chevrons, Dynamic Type and all.
    @State private var heights: [String: CGFloat] = [:]
    private let gap: CGFloat = 8

    private var rowHeight: CGFloat { order.compactMap { heights[$0] }.max() ?? 70 }

    var body: some View {
        ZStack(alignment: .top) {
            ForEach(Array(order.enumerated()), id: \.element) { i, gameId in
                let isDragging = dragging == gameId
                let shift = shiftFor(index: i)
                let slot = projected(index: i)
                RankRow(
                    gameId: gameId,
                    team: selections[gameId] ?? "",
                    rank: slot < availableRanks.count ? availableRanks[slot] : Scoring.maxPicks,
                    game: gamesById[gameId],
                    canUp: i > 0,
                    canDown: i < order.count - 1,
                    lifted: isDragging,
                    onUp: { onOrder(Draft(selections: selections, order: order).moving(from: i, to: i - 1).order) },
                    onDown: { onOrder(Draft(selections: selections, order: order).moving(from: i, to: i + 1).order) },
                    drag: drag(index: i, gameId: gameId),
                    hold: LongPressGesture(minimumDuration: 0.25)
                        .onEnded { _ in
                            if dragging == nil { dragging = gameId; dragOffset = 0; Haptics.tap() }
                        }
                        .sequenced(before: drag(index: i, gameId: gameId))
                        .onEnded { value in
                            // Held and let go without moving: the drag never began, so nothing
                            // else will put the row back down.
                            if case .second(_, nil) = value { dragging = nil; dragOffset = 0 }
                        }
                )
                .fixedSize(horizontal: false, vertical: true)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { heights[gameId] = $0 }
                .frame(height: rowHeight)
                .offset(y: CGFloat(i) * (rowHeight + gap) + (isDragging ? dragOffset : shift))
                .zIndex(isDragging ? 10 : 0)
                .animation(isDragging ? nil : .spring(response: 0.3, dampingFraction: 0.8), value: shift)
            }
        }
        .frame(height: CGFloat(order.count) * (rowHeight + gap) - gap, alignment: .top)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: order)
        // A tick for every slot the held row crosses: the detent a physical list would have.
        .onChange(of: target) { old, new in
            if old != nil, new != nil, old != new { Haptics.tap() }
        }
    }

    /// Where the held row would land if it were let go now.
    private var target: Int? {
        guard let dragging, let from = order.firstIndex(of: dragging) else { return nil }
        return max(0, min(order.count - 1, from + Int((dragOffset / (rowHeight + gap)).rounded())))
    }

    /// Which slot row `i` would be in if the held row were let go now — its own index when
    /// nothing is held.
    private func projected(index i: Int) -> Int {
        guard let dragging, let from = order.firstIndex(of: dragging), let target else { return i }
        if order[i] == dragging { return target }
        if from < i, i <= target { return i - 1 }
        if target <= i, i < from { return i + 1 }
        return i
    }

    /// The drag itself, shared by the grip and the held card: lift on the first movement, drop
    /// into whichever slot the row is nearest when the finger lets go.
    private func drag(index i: Int, gameId: String) -> some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .onChanged { value in
                if dragging == nil { dragging = gameId; Haptics.tap() }
                dragOffset = value.translation.height
            }
            .onEnded { _ in
                let target = max(0, min(order.count - 1, i + Int((dragOffset / (rowHeight + gap)).rounded())))
                if target != i { onOrder(Draft(selections: selections, order: order).moving(from: i, to: target).order); Haptics.tap() }
                dragging = nil
                dragOffset = 0
            }
    }

    /// How far a resting row moves aside while another is dragged over it.
    private func shiftFor(index i: Int) -> CGFloat {
        guard let dragging, dragging != order[i] else { return 0 }
        return CGFloat(projected(index: i) - i) * (rowHeight + gap)
    }
}

struct RankRow<G: Gesture, H: Gesture>: View {
    @Environment(AppModel.self) private var model
    let gameId: String
    let team: String
    let rank: Int
    let game: Game?
    let canUp: Bool
    let canDown: Bool
    let lifted: Bool
    let onUp: () -> Void
    let onDown: () -> Void
    /// The grip's: lifts on the first movement.
    let drag: G
    /// The card's: a press and hold, then the same drag. The chevrons and the grip sit inside it
    /// and take the touch first, so a tap on either is still a tap.
    let hold: H

    var body: some View {
        HStack(spacing: 12) {
            // The digits roll and the badge gives a little pop when the rank changes — while
            // the row is being dragged as much as when it is dropped (`ReorderList`).
            RankBadge(rank: rank)
                .keyframeAnimator(initialValue: CGFloat(1), trigger: rank) { badge, scale in
                    badge.scaleEffect(scale)
                } keyframes: { _ in
                    KeyframeTrack {
                        CubicKeyframe(1.16, duration: 0.08)
                        SpringKeyframe(1, duration: 0.3, spring: .bouncy)
                    }
                }
                .animation(Motion.snap, value: rank)
            TeamSticker(team: model.sport.teamOrPlaceholder(team), size: 48, flat: true)
            MatchupText(pick: Pick(gameId: gameId, team: team, rank: rank), game: game, compact: true)
            Spacer()
            // 44pt each and not touching. These were 19x25 and flush against one another, which on
            // a list whose whole purpose is ordering meant a mis-tap moved the pick the wrong way.
            VStack(spacing: 2) {
                Button(action: onUp) { Image(systemName: "chevron.up").font(.system(size: 14, weight: .bold)) }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                    .buttonStyle(.plain).disabled(!canUp).opacity(canUp ? 1 : 0.3)
                    .accessibilityLabel("Move up")
                Button(action: onDown) { Image(systemName: "chevron.down").font(.system(size: 14, weight: .bold)) }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                    .buttonStyle(.plain).disabled(!canDown).opacity(canDown ? 1 : 0.3)
                    .accessibilityLabel("Move down")
            }
            .foregroundStyle(Color.ink2)
            // Announced as a drag affordance but operable only by dragging, which VoiceOver cannot
            // do — so it is hidden from it. The two buttons above are the accessible path, and they
            // are labelled. An announced control that cannot be activated is worse than none.
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color.ink3)
                .padding(10)
                .contentShape(Rectangle())
                .gesture(drag)
                .accessibilityHidden(true)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .gesture(hold)
        .background {
            ZStack {
                if lifted { RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).fill(Color.ink).offset(x: 6, y: 6) }
                RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).fill(Color.surface)
                RoundedRectangle(cornerRadius: TallyRadius.card, style: .continuous).strokeBorder(Color.ink, lineWidth: 2)
            }
        }
        .scaleEffect(lifted ? 1.03 : 1)
    }
}
