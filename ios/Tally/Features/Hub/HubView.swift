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

 One construct, two fillings. Every card is the same four slots — the mark and the name, one line
 saying which week or which hole, the detail (five places per entry in a pool; the score and the
 leader on a card), and the thing to do — so a third kind of contest is a third filling rather
 than a third card. Attention is a state, not a style: `Hub.attention` decides, this only dresses.

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
        VStack(alignment: .leading, spacing: 22) {
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
            moreSection
        }
        // Every visit asks again (throttled inside), and a pool joined since last time is a new
        // key, so it is asked about at once rather than a minute later.
        .task(id: "\(model.pool.host)/\(model.pool.slug)#\(model.catalog.pools.count)") {
            await hub.refresh(model: model)
        }
    }

    /// What used to be the tail of the chip's menu: the ways to add somewhere to stand.
    private var moreSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashedDivider()
            Button { model.showPools = true } label: {
                Label("Join or start a pool", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.tally(.plain, size: .small))
            if model.golfCards {
                Button { golf.showNewCard = true } label: {
                    Label("New golf card", systemImage: "plus.circle")
                }
                .buttonStyle(.tally(.plain, size: .small))
            }
            Text("Paste a link a commissioner sent you, or see what else Tally plays.")
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

// MARK: Pools

/**
 One pool: whose picks are in, what they are, and where each entry stands.

 The whole card is the tap, and the tap goes where the card says: into the picks if any are owed
 (as the entry that owes them, when it is one of yours), otherwise onto the pool's own page. The
 button drawn at the bottom of an owing card is that same tap wearing a label — it takes no touch
 of its own, so there is one target and it cannot disagree with the card.
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
        Button(action: open) {
            VStack(alignment: .leading, spacing: 12) {
                header
                DashedDivider()
                content
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.cardPress)
        .card(fill: urgent ? .flagSoft : .surface, border: urgent ? .ink : .cardBorder)
        .contextMenu {
            if model.catalog.pools.count > 1 {
                Button(role: .destructive) { model.removePool(membership.id) } label: {
                    Label("Remove from this phone", systemImage: "minus.circle")
                }
            }
        }
        .accessibilityLabel("\(membership.name). \(headline). \(urgent ? "Opens your picks" : "Opens the pool")")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            Image("TallyMark")
                .resizable()
                .scaledToFit()
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(membership.name).display(18).lineLimit(1)
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
                .padding(.top, 4)
        }
    }

    @ViewBuilder private var content: some View {
        if let pool {
            if pool.snapshot.entries.isEmpty {
                Text("This phone isn't signed in here.").sans(13).foregroundStyle(Color.ink2)
            } else {
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
        } else if let error = status.error {
            // Silence is the only safe thing to say. "Your picks are in" off a request that
            // failed is the one sentence here that can cost someone their week.
            Text(error.code == "NO_SESSION" ? "Not signed in on this phone." : "Couldn't check this pool.")
                .sans(13, weight: .semibold).foregroundStyle(Color.ink2)
        } else {
            SkeletonLine(width: 180)
            SkeletonLine(width: 230, height: 26)
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

/// One golf card: where the round is, and who is ahead on shots kept. Tapping it stands on the
/// tee, whichever tab the card was last left on.
private struct GolfHubCard: View {
    @Environment(AppModel.self) private var model
    @Environment(GolfModel.self) private var golf
    let card: ScrambleCard

    private var attention: HubAttention { Hub.attention(card: card) }

    private var leader: TallyRow? {
        ScrambleTally.rows(card).first { $0.place == 1 && $0.kept > 0 }
    }

    private var subtitle: String {
        let line = Hub.headline(card: card)
        return card.course.isEmpty ? line : "\(card.course) · \(line)"
    }

    var body: some View {
        Button {
            Haptics.tap()
            golf.tab = .round
            model.switchToCard(card.id)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image("GolfMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.name).display(18).lineLimit(1)
                    Text(subtitle)
                        .sans(12, weight: .semibold).foregroundStyle(Color.ink2)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    if let leader {
                        Text("\(leader.player.name) leads · \(leader.kept) kept")
                            .sans(11).foregroundStyle(Color.ink3).lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                if attention != .waiting {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(ScrambleTally.toParText(card.toPar))
                            .font(TallyFont.display(26))
                            .monospacedDigit()
                        Text(attention == .done ? "FINAL" : "THRU \(card.throughHole)")
                            .font(TallyFont.sans(9, weight: .bold)).tracking(1)
                            .foregroundStyle(Color.ink3)
                    }
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.ink3)
                    .padding(.top, 4)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.cardPress)
        // A round under way sits up off the page the way the leader's row does on the tally.
        .card(hard: attention == .live)
        .accessibilityLabel("\(card.name). \(subtitle). Opens the round")
    }
}
