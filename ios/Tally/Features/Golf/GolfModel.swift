import Foundation
import Observation
import TallyKit

enum GolfTab: Hashable {
    /// Home is the app's — the same tab the pool shell puts first — and Round is where a card
    /// lands: the tee you are standing on, and the four names.
    case home, round, tally, scorecard, account
}

/**
 The golf cards on this phone, and the one being played.

 Deliberately not part of `AppModel`: that object is the pool — its session, its bootstrap, its
 week — and a scramble card has none of those. `AppModel.context` says *which* card the app is
 standing in; this owns the cards themselves and every change to them. Every mutation goes through
 `mutate`, which writes the catalogue back on each stroke, because a phone in a cart gets put down,
 locked and dropped, and a stroke that was tapped has to be a stroke that was kept.
 */
@MainActor
@Observable
final class GolfModel {
    private(set) var catalog: CardCatalog
    var tab: GolfTab = .round
    /// The setup sheet for a new card. Presented from the root so the menu can open it on any tab.
    var showNewCard = false
    /// The setup sheet over an existing card: names, pars, the card's name.
    var editing: ScrambleCard?
    /// The card being shared, snapshotted at the moment the button was tapped — a poster is a
    /// picture of a round at a time, so it should not redraw under somebody mid-send.
    var sharing: ScrambleCard?

    /// The lock screen for whichever round is going. Driven from here, because every change to a
    /// card goes through `save` and there is no other source of truth to race with.
    let activity = RoundActivityService()

    /// The Worker, for cards that have been shared. Needs no session: the link is the credential.
    private let sharing = GolfService()
    /// One pending push per card, so a burst of taps is one request rather than four.
    private var pushes: [String: Task<Void, Never>] = [:]
    /// Cards whose last push or pull failed. The screen says so rather than pretending.
    private(set) var unsynced: Set<String> = []

    init() {
        catalog = CardCatalog.load()
        activity.adoptExisting()
    }

    var cards: [ScrambleCard] { catalog.cards }

    func card(_ id: String) -> ScrambleCard? { catalog.card(id) }

    func save(_ card: ScrambleCard) {
        catalog.upsert(card)
        catalog.save()
        Task { await activity.sync(card) }
        schedulePush(card)
    }

    // MARK: A card that has been shared

    /**
     Put this card on the Worker and keep the link it comes back with.

     Safe to call whenever the share sheet opens: the route is idempotent by the card's id, so a
     second tap returns the first link rather than minting a second one. What comes back is
     *merged*, because the phone may be behind — somebody opened the link and played two holes
     while it was in a pocket.
     */
    @discardableResult
    func publish(cardId: String) async -> String? {
        guard let card = catalog.card(cardId) else { return nil }
        do {
            let response = try await sharing.publish(card)
            absorb(response, into: cardId)
            unsynced.remove(cardId)
            return response.token
        } catch {
            unsynced.insert(cardId)
            return nil
        }
    }

    /**
     Take whatever everybody else has done since we last looked.

     Called when a shared card comes on screen and on a slow timer while it is, which is the one
     case a push cannot cover: a phone sitting in a cart holder while three other people play.
     */
    func refresh(cardId: String) async {
        guard let card = catalog.card(cardId), let token = card.shareToken else { return }
        // A push in flight already carries this phone's copy and will answer with the merge, so
        // pulling underneath it would only race with a better answer.
        guard pushes[cardId] == nil else { return }
        do {
            absorb(try await sharing.fetch(token: token), into: cardId)
            unsynced.remove(cardId)
        } catch let error as APIError where error.status == 404 {
            // The card is gone from the server. The local copy is still a perfectly good round;
            // it simply is not shared any more, and pretending otherwise would keep retrying.
            mutate(cardId) { $0.shareToken = nil }
            unsynced.remove(cardId)
        } catch {
            unsynced.insert(cardId)
        }
    }

    /// Coalesced, and only for a card that has a link. A local card never touches the network.
    private func schedulePush(_ card: ScrambleCard) {
        guard card.shareToken != nil else { return }
        pushes[card.id]?.cancel()
        pushes[card.id] = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            await self?.pushNow(cardId: card.id)
        }
    }

    private func pushNow(cardId: String) async {
        defer { pushes[cardId] = nil }
        guard let card = catalog.card(cardId), let token = card.shareToken else { return }
        do {
            absorb(try await sharing.push(card, token: token), into: cardId)
            unsynced.remove(cardId)
        } catch {
            // The change is still on disk, so the next tap carries it. Saying nothing here is the
            // point: a round played out of signal must not become a round full of error banners.
            unsynced.insert(cardId)
        }
    }

    /**
     Fold the server's answer into the local card.

     Deliberately *not* through `save`: that would schedule another push, and a push whose own
     answer schedules a push is a loop that never settles. The Live Activity is updated by hand
     here for the same reason.
     */
    private func absorb(_ response: SharedCardResponse, into cardId: String) {
        guard var local = catalog.card(cardId) else { return }
        local.shareToken = response.token
        let merged = local.merging(response.card)
        catalog.upsert(merged)
        catalog.save()
        Task { await activity.sync(merged) }
    }

    func delete(_ id: String) {
        catalog.remove(id)
        catalog.save()
        Task { await activity.discard(cardId: id) }
    }

    private func mutate(_ id: String, _ change: (inout ScrambleCard) -> Void) {
        guard var card = catalog.card(id) else { return }
        change(&card)
        save(card)
    }

    // MARK: The round

    func record(_ stroke: Stroke, card id: String) {
        mutate(id) { $0.record(stroke, on: $0.currentHole) }
    }

    /// The hole is done. Returns the finished entry so the screen can say what it was. With
    /// `advance` off the card stays on the hole, for a screen that wants to stamp it before
    /// moving on (`advance(card:from:)` is the second half).
    @discardableResult
    func finishHole(card id: String, tapIn: Bool, advance: Bool = true) -> HoleEntry? {
        var finished: HoleEntry?
        mutate(id) {
            let hole = $0.currentHole
            $0.finish(hole: hole, tapIn: tapIn)
            finished = $0.entry(hole)
            if finished?.finished == true, advance { $0.advance() }
        }
        return finished?.finished == true ? finished : nil
    }

    /// On to the next hole still to play — but only if the card is still standing on `hole`, so
    /// a stamp that lands after somebody has already moved on does not move them twice.
    func advance(card id: String, from hole: Int) {
        mutate(id) { if $0.currentHole == hole { $0.advance() } }
    }

    func undo(card id: String) {
        mutate(id) { $0.undo(hole: $0.currentHole) }
    }

    /// A stroke was somebody else's — or nobody's. Same hole the card is standing on.
    func reassign(strokeId: String, card id: String, to kind: StrokeKind, playerId: String? = nil) {
        mutate(id) { $0.reassign(strokeId: strokeId, on: $0.currentHole, to: kind, playerId: playerId) }
    }

    /// One stroke too many, and not the last one.
    func remove(strokeId: String, card id: String) {
        mutate(id) { $0.remove(strokeId: strokeId, on: $0.currentHole) }
    }

    func go(card id: String, to hole: Int) {
        mutate(id) { $0.go(to: hole) }
    }

    func setPar(_ par: Int, card id: String, hole: Int) {
        mutate(id) { $0.setPar(par, on: hole) }
    }

    /// Name who took a hole's side contest, or clear it with nil. Goes through `mutate` like
    /// every other change, so the lock screen and the catalogue see it at the same moment.
    func award(_ contest: SideContest, card id: String, hole: Int, to playerId: String?) {
        mutate(id) { $0.award(contest, on: hole, to: playerId) }
    }
}
