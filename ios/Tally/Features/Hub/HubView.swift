import SwiftUI
import TallyKit

/**
 The app's home: every pool and every card on the phone, one card each, the ones that want you
 first and dressed to say so.

 This is the switcher now. It used to be a menu behind the chip in the navigation bar, which
 could list names and nothing else — a phone with three pools had to open each to learn that
 Thursday's picks were still owed in one of them. A card can say that, and a tab can wear the
 count. It is the first tab in both shells and the one screen both draw, which makes it, with the
 design system and Account, the whole of the surface the two families share.

 **One shell, two fillings.** `ContestCard` is the whole of a card's shape — the badge, the name,
 the line under it, the divider, the chevron, the padding, and what the card does when tapped —
 and a family supplies only what goes in the body. A pool fills it with its entries; a card fills
 it with its players. That is why a golf card and a pool read as the same kind of object on this
 screen even though one is a season and the other is an afternoon, and it is why a third family
 costs a body rather than a card. Attention is a state, not a style: `Hub.attention` decides and
 the shell dresses, in one place, so nothing can be urgent-looking without being urgent.

 Under the cards are the two things you can do that are not about a contest you are already in:
 start one, from a row you push through with your thumb, or join one with the code somebody said
 out loud. Neither used to be here — they were a pair of buttons that opened the same sheet.

 A launch does not land here. The pool you were in last night is the pool you are in this morning,
 on the tab you left; this is one tap to the left, with a badge if anything is owed.
 */
struct HubView: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    @Environment(HubModel.self) private var hub

    private var showsCards: Bool { model.golfCards && !golf.cards.isEmpty }

    /// Pools then cards, in the order the phone keeps them, then stably by what each one wants —
    /// so two pools that both need picks stay in the order they were opened.
    private var items: [HubItem] {
        var all: [HubItem] = model.catalog.pools.map { membership in
            HubItem.pool(membership, hub.status(membership.id).value.map { Hub.attention(pool: $0) } ?? .waiting)
        }
        if model.golfCards {
            all += golf.cards.map { HubItem.card($0, Hub.attention(card: $0)) }
        }
        return all.enumerated()
            .sorted { ($0.element.attention.rawValue, $0.offset) < ($1.element.attention.rawValue, $1.offset) }
            .map(\.element)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: showsCards ? "Your pools and cards" : "Your pools")
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    switch item {
                    case .pool(let membership, _):
                        PoolHubCard(membership: membership, status: hub.status(membership.id))
                            .dealt(index)
                    case .card(let card, _):
                        GolfHubCard(card: card)
                            .dealt(index)
                    }
                }
            }
            startSection
        }
        // Every visit asks again (throttled inside), and a pool joined since last time is a new
        // key, so it is asked about at once rather than a minute later.
        .task(id: "\(model.pool.host)/\(model.pool.slug)#\(model.catalog.pools.count)") {
            await hub.refresh(model: model)
        }
    }

    /// What there is to start, and the one way in that needs no link.
    private var startSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Start something new")
            StartCarousel()
            DashedDivider()
            Button { model.showJoin = true } label: {
                Label("Join a pool", systemImage: "person.badge.plus")
            }
            .buttonStyle(.tally(.plain, size: .small))
            Text("Someone running a pool can give you its code, or send you its link.")
                .sans(12).foregroundStyle(Color.ink2)
        }
    }
}

private enum HubItem: Identifiable {
    case pool(PoolMembership, HubAttention)
    case card(ScrambleCard, HubAttention)

    var id: String {
        switch self {
        case .pool(let membership, _): return "pool:\(membership.id)"
        case .card(let card, _): return "card:\(card.id)"
        }
    }

    var attention: HubAttention {
        switch self {
        case .pool(_, let attention), .card(_, let attention): return attention
        }
    }
}

// MARK: The shell

/**
 The floor under every card's body.

 A floor rather than a fixed height, which is the one concession this screen makes to content: a
 pool with four entries genuinely has more to say than a card nobody has teed off on, and clipping
 it to match would throw away the thing the card exists for. Everything else — the header, the
 divider, the padding, where the chevron sits — is identical, so cards with the ordinary amount to
 say (one entry, one round) come out the same size, and the ones that differ differ for a reason
 you can see.
 */
private let contestBodyMinHeight: CGFloat = 86

/**
 One contest on the home tab, whichever kind it is.

 Takes the badge, the name, the line under it and what the tap does; the body is the family's.
 The whole card is the tap — a button inside it would be a second target that could disagree with
 the first — so anything drawn in the body that looks like a button has its hit testing off and is
 the same tap wearing a label.
 */
private struct ContestCard<Content: View>: View {
    /// An asset in the app's catalogue: the family's badge, never the app's own mark.
    let mark: String
    let title: String
    /// One line: which week, which hole, what is owed.
    let headline: String
    let attention: HubAttention
    let accessibility: String
    let action: () -> Void
    @ViewBuilder let content: Content

    private var urgent: Bool { attention == .needsYou }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                header
                DashedDivider()
                content
                    .frame(maxWidth: .infinity, minHeight: contestBodyMinHeight, alignment: .topLeading)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.cardPress)
        // The one place attention becomes a look. Something owed wears the flag and a hard
        // shadow; something happening sits up off the page without shouting; the rest lie flat.
        .card(
            hard: attention == .needsYou || attention == .live,
            fill: urgent ? .flagSoft : .surface,
            border: urgent ? .ink : .cardBorder
        )
        .accessibilityLabel(accessibility)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(mark)
                .resizable()
                .scaledToFit()
                .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).display(18).lineLimit(1)
                Text(headline)
                    .sans(12, weight: .semibold)
                    .foregroundStyle(urgent ? Color.ink : Color.ink2)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color.ink3)
                .padding(.top, 6)
        }
    }
}

// MARK: Pools

/**
 One pool: whose picks are in, what they are, and where each entry stands.

 The tap goes where the card says: into the picks if any are owed (as the entry that owes them,
 when it is one of yours), otherwise onto the pool's own page.
 */
private struct PoolHubCard: View {
    @Environment(AppModel.self) private var model
    let membership: PoolMembership
    let status: Loadable<HubPool>

    private var pool: HubPool? { status.value }
    private var attention: HubAttention { pool.map { Hub.attention(pool: $0) } ?? .waiting }
    private var urgent: Bool { attention == .needsYou }

    private var clock: HubClock { HubClock(kickoff: Format.kickoff, time: Format.time) }

    private var headline: String {
        guard let pool else { return membership.poolType }
        return Hub.headline(pool: pool, now: model.now, clock: clock)
    }

    private var cta: String {
        guard let pool else { return "Make your picks" }
        let owing = Hub.owing(pool)
        return owing.count == 1 && pool.snapshot.entries.count > 1 ? "Make \(owing[0].name)'s picks" : "Make your picks"
    }

    var body: some View {
        ContestCard(
            mark: "FootballMark",
            title: membership.name,
            headline: headline,
            attention: attention,
            accessibility: "\(membership.name). \(headline). \(urgent ? "Opens your picks" : "Opens the pool")",
            action: open
        ) {
            content
        }
        .contextMenu {
            if model.catalog.pools.count > 1 {
                Button(role: .destructive) { model.removePool(membership.id) } label: {
                    Label("Remove from this phone", systemImage: "minus.circle")
                }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let pool {
            if pool.snapshot.entries.isEmpty {
                Text("This phone isn't signed in here.").sans(13).foregroundStyle(Color.ink2)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    if let owing = Hub.owingLine(pool: pool) {
                        Text(owing).sans(14, weight: .semibold)
                    }
                    ForEach(pool.snapshot.entries) { entry in
                        HubEntryRow(entry: entry, named: pool.snapshot.entries.count > 1)
                    }
                    if urgent {
                        Button(cta) {}
                            .buttonStyle(.tally(.primary, size: .small))
                            .allowsHitTesting(false)
                            .padding(.top, 2)
                    }
                }
            }
        } else if let error = status.error {
            // Silence is the only safe thing to say. "Your picks are in" off a request that
            // failed is the one sentence here that can cost someone their week.
            Text(error.code == "NO_SESSION" ? "Not signed in on this phone." : "Couldn't check this pool.")
                .sans(13, weight: .semibold).foregroundStyle(Color.ink2)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                SkeletonLine(width: 180)
                SkeletonLine(width: 230, height: 26)
            }
        }
    }

    private func open() {
        Haptics.tap()
        let samePool = membership.ref == model.pool
        // Also the way out of a card; a no-op when this pool is the one already held.
        model.switchPool(membership.ref)
        if urgent, samePool, let pool, let first = Hub.owing(pool).first, first.id != model.player?.id {
            model.switchTo(first.id)
        }
        model.tab = urgent ? .picks : .pool
    }
}

/// One entry's week on a pool card: the five places, and the number beside the name.
private struct HubEntryRow: View {
    let entry: WidgetEntry
    /// Only a family needs the names; one person knows their own.
    let named: Bool

    private var owing: Bool { entry.slots.count < Scoring.maxPicks }

    /// Points and place once anything has kicked off; before that, a zero on a board where
    /// everyone is first is a boast about a race that has not started.
    private var line: String {
        var parts: [String] = []
        let started = entry.slots.contains { $0.state != .waiting }
        if started, let place = entry.place, let field = entry.field {
            parts.append("\(entry.points) pts · \(Format.ordinal(place)) of \(field)")
        } else if !owing {
            parts.append("Picks in")
        }
        if entry.seasonStarted, let place = entry.seasonPlace {
            parts.append("season \(Format.ordinal(place))")
        }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if named {
                    Text(entry.name).font(TallyFont.display(14)).lineLimit(1)
                }
                if owing {
                    Chip(text: "needs picks", fill: .flag, size: 10, label: .onAccent)
                }
                Spacer(minLength: 4)
                if !line.isEmpty {
                    Text(line).sans(11, weight: .semibold).foregroundStyle(Color.ink2).lineLimit(1)
                }
            }
            PickSlotRow(slots: Hub.pickSlots(entry.slots))
        }
    }
}

// MARK: Cards

/**
 One golf card: where the round is, who is ahead on shots kept, and who else is out there.

 The body is the pool card's body with golf in it — a line about the contest, then a row per
 person — rather than a different arrangement of the same facts. It used to be one dense header
 with the score hanging off the right-hand edge, which is how a card two taps from a pool came to
 look like a different app's idea of a list row.
 */
private struct GolfHubCard: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard

    private var attention: HubAttention { Hub.attention(card: card) }
    private var started: Bool { attention == .live || attention == .done }
    private var rows: [TallyRow] { ScrambleTally.rows(card) }

    var body: some View {
        ContestCard(
            mark: "GolfMark",
            title: card.name,
            headline: Hub.headline(card: card),
            attention: attention,
            accessibility: "\(card.name). \(Hub.headline(card: card)). Opens the round",
            action: open
        ) {
            VStack(alignment: .leading, spacing: 8) {
                if started { scoreStrip }
                if !card.course.isEmpty {
                    Text(card.course).sans(13, weight: .semibold).foregroundStyle(Color.ink2).lineLimit(1)
                }
                ForEach(rows) { row in
                    GolfPlayerRow(row: row, started: started)
                }
            }
        }
    }

    /// What the round is at, in the one place a glance goes first.
    private var scoreStrip: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(ScrambleTally.toParText(card.toPar))
                .font(TallyFont.display(26))
                .monospacedDigit()
            Text(attention == .done ? "FINAL" : "THRU \(card.throughHole)")
                .font(TallyFont.sans(9, weight: .bold)).tracking(1)
                .foregroundStyle(Color.ink3)
            Spacer(minLength: 0)
            Text("\(card.strokesTaken) strokes").sans(11, weight: .semibold).foregroundStyle(Color.ink2)
        }
    }

    private func open() {
        Haptics.tap()
        golf.tab = .round
        model.switchToCard(card.id)
    }
}

/// One player on a card: their name, and the only number a scramble keeps about a person.
private struct GolfPlayerRow: View {
    let row: TallyRow
    let started: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text(row.player.name).font(TallyFont.display(14)).lineLimit(1)
            if started, row.place == 1, row.kept > 0 {
                Chip(text: "leading", fill: .flag, size: 10, label: .onAccent)
            }
            Spacer(minLength: 4)
            if started {
                Text(row.kept == 1 ? "1 kept" : "\(row.kept) kept")
                    .sans(11, weight: .semibold).foregroundStyle(Color.ink2)
            }
        }
    }
}

// MARK: Starting something

/**
 What there is to start, as a row you push through with your thumb.

 A carousel rather than a list because this is browsing: the question is "what else could we
 play", and the answer is a handful of things best looked at one at a time. It pages by card —
 the next one peeks past the edge, so the row says it continues without a row of dots saying it.

 Every tile wears a drawn symbol rather than one of the three marks, and that is deliberate. The
 marks say which *family* a contest you are standing in belongs to; here nothing has been started
 yet, so there is no family to name — and a pool played over four days of golf would otherwise
 have to wear the football, which is the whole mistake the marks were split up to avoid.

 A type that cannot be started yet says so instead of offering a button that apologises. Today
 that is everything except a golf card: pools are still made by whoever runs the Worker.
 */
private struct StartCarousel: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf

    private var options: [StartOption] {
        var all: [StartOption] = []
        if model.golfCards {
            all.append(
                StartOption(
                    id: "golf-card",
                    symbol: "figure.golf",
                    name: "Golf card",
                    tagline: "Keep a scramble on one phone. Every shot has a name on it.",
                    sports: ["Golf"],
                    start: { Haptics.tap(); golf.showNewCard = true }
                )
            )
        }
        all += PoolTypes.all.map { type in
            StartOption(
                id: type.slug,
                symbol: StartOption.symbol(for: type.slug),
                name: type.name,
                tagline: type.tagline,
                sports: type.sports,
                // Nobody can start a pool from the app yet: the Worker that serves one is the
                // thing that creates it. Saying so is better than a button that cannot work.
                start: nil
            )
        }
        return all
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(options) { option in
                    StartTile(option: option)
                }
            }
            .scrollTargetLayout()
            // The page's own gutter, put back inside the scroll view so the first tile lines up
            // with everything above it and the last one can still be pushed clear of the edge.
            .padding(.horizontal, 16)
            // Room for the hard shadow, which is drawn outside the tile's bounds.
            .padding(.vertical, 4)
            .padding(.trailing, 6)
        }
        .scrollTargetBehavior(.viewAligned)
        // Undo the gutter this screen sits in, so the row runs edge to edge and the next tile
        // peeks. A carousel that stops short of the edge reads as a list that was cut off.
        .padding(.horizontal, -16)
    }
}

private struct StartOption: Identifiable {
    let id: String
    /// Drawn, not an asset: see `StartCarousel`.
    let symbol: String
    let name: String
    let tagline: String
    let sports: [String]
    /// nil when this type cannot be started yet.
    let start: (() -> Void)?

    static func symbol(for slug: String) -> String {
        switch slug {
        case "high-five": return "football.fill"
        case "survivor": return "flame.fill"
        case "brackets": return "list.bullet.indent"
        case "majors": return "rosette"
        default: return "trophy.fill"
        }
    }
}

/// One tile in the carousel. Same size whatever it holds, for the same reason the cards above are.
private struct StartTile: View {
    let option: StartOption

    private var tile: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                FlagMark(size: 30, corner: 9) {
                    Image(systemName: option.symbol).font(.system(size: 14, weight: .black))
                }
                Text(option.name).display(17).lineLimit(1)
            }
            Text(option.tagline)
                .sans(12)
                .foregroundStyle(Color.ink2)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            // Which sport it is played in, which is the first thing anyone browsing wants: a type
            // is a shape of contest, and the shape alone does not say whether it is your weekend.
            Text(option.sports.joined(separator: " · "))
                .sans(11, weight: .semibold)
                .foregroundStyle(Color.ink3)
                .lineLimit(1)
            if option.start != nil {
                Text("New card")
                    .font(TallyFont.display(13))
                    .foregroundStyle(Color.onFill)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Capsule().fill(Color.turf))
            } else {
                Text("COMING SOON")
                    .font(TallyFont.display(10)).tracking(0.8)
                    .foregroundStyle(Color.ink2)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(Color.paper2))
                    .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1.5))
            }
        }
        .padding(12)
        .frame(width: 208, height: 168, alignment: .topLeading)
    }

    var body: some View {
        if let start = option.start {
            Button(action: start) { tile.contentShape(Rectangle()) }
                .buttonStyle(.cardPress)
                .card()
                .accessibilityLabel("Start a \(option.name). \(option.tagline)")
        } else {
            tile
                .cardFlat()
                .opacity(0.85)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(option.name), coming soon. \(option.tagline)")
        }
    }
}
