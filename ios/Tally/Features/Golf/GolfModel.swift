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

    /// The hole is done. Returns the finished entry so the screen can say what it was.
    @discardableResult
    func finishHole(card id: String, tapIn: Bool) -> HoleEntry? {
        var finished: HoleEntry?
        mutate(id) {
            let hole = $0.currentHole
            $0.finish(hole: hole, tapIn: tapIn)
            finished = $0.entry(hole)
            if finished?.finished == true { $0.advance() }
        }
        return finished?.finished == true ? finished : nil
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
