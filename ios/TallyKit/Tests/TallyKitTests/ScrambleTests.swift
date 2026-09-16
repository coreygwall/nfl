import XCTest
@testable import TallyKit

/**
 The rules of a scramble card, pinned before any screen draws them.

 The whole feature is one idea — a stroke is somebody's, the score is the count — and the edge of
 that idea is the putt: the fifty-footer earns a mark, the tap-in earns nobody one, and both are a
 stroke on the card. Every test here is a case somebody would argue about in the cart.
 */
final class ScrambleTests: XCTestCase {
    private let corey = GolfPlayer(id: "c", name: "Corey")
    private let dan = GolfPlayer(id: "d", name: "Dan")
    private let pete = GolfPlayer(id: "p", name: "Pete")
    private let sam = GolfPlayer(id: "s", name: "Sam")

    private func card(pars: [Int] = Array(repeating: 4, count: 18)) -> ScrambleCard {
        ScrambleCard(name: "Saturday", players: [corey, dan, pete, sam], pars: pars)
    }

    // MARK: The score is the count

    func testEveryStrokeCountsOnTheCardWhoeverItBelongedTo() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.record(.penalty, on: 1)
        c.record(.shot(by: "d"), on: 1)
        c.record(.shot(by: "p"), on: 1)
        c.finish(hole: 1, tapIn: true)

        XCTAssertEqual(c.entry(1)?.score, 5)
        XCTAssertEqual(c.toPar, 1)
        XCTAssertEqual(c.throughHole, 1)
        XCTAssertEqual(ScrambleTally.label(score: 5, par: 4), "bogey")
    }

    func testAnOpenHoleIsNotYetUnderPar() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.record(.shot(by: "d"), on: 1)
        XCTAssertEqual(c.toPar, 0, "two strokes on an unfinished par four are not a two")
        XCTAssertEqual(c.throughHole, 0)
        XCTAssertEqual(c.strokesTaken, 0)
    }

    // MARK: Who gets the mark

    func testTheTapInCountsAndCreditsNobody() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)   // drive
        c.record(.shot(by: "d"), on: 1)   // approach
        c.record(.shot(by: "p"), on: 1)   // the lag to an inch — that one earns its mark
        c.finish(hole: 1, tapIn: true)

        let rows = ScrambleTally.rows(c)
        XCTAssertEqual(c.entry(1)?.score, 4)
        XCTAssertNil(c.entry(1)?.holedBy)
        XCTAssertTrue(c.entry(1)?.endedWithTapIn ?? false)
        XCTAssertEqual(rows.map(\.kept).reduce(0, +), 3, "the tap-in is on the card and on nobody's tally")
        XCTAssertEqual(rows.first { $0.id == "p" }?.between, 1)
    }

    func testHoledItCreditsTheLastShot() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.record(.shot(by: "d"), on: 1)
        c.record(.shot(by: "p"), on: 1)   // the fifty-footer
        c.finish(hole: 1, tapIn: false)

        XCTAssertEqual(c.entry(1)?.score, 3)
        XCTAssertEqual(c.entry(1)?.holedBy, "p")
        let pete = ScrambleTally.rows(c).first { $0.id == "p" }
        XCTAssertEqual(pete?.holed, 1)
        XCTAssertEqual(pete?.between, 0)
        XCTAssertEqual(ScrambleTally.label(score: 3, par: 4), "birdie")
    }

    func testTheDriveIsTheFirstShotEvenAfterAPenalty() {
        var c = card()
        c.record(.penalty, on: 1)          // everybody found the water
        c.record(.shot(by: "s"), on: 1)    // the re-tee that was kept
        c.record(.shot(by: "c"), on: 1)
        c.finish(hole: 1, tapIn: true)

        XCTAssertEqual(c.entry(1)?.drive?.playerId, "s")
        XCTAssertEqual(ScrambleTally.rows(c).first { $0.id == "s" }?.drives, 1)
    }

    func testAHoleInOneIsADriveAndAHoledShotAndNothingInBetween() {
        var c = card(pars: [3] + Array(repeating: 4, count: 17))
        c.record(.shot(by: "d"), on: 1)
        c.finish(hole: 1, tapIn: false)

        let dan = ScrambleTally.rows(c).first { $0.id == "d" }
        XCTAssertEqual(dan?.kept, 1)
        XCTAssertEqual(dan?.drives, 1)
        XCTAssertEqual(dan?.holed, 1)
        XCTAssertEqual(dan?.between, 0)
        XCTAssertEqual(ScrambleTally.label(score: 1, par: 3), "ace")
    }

    // MARK: Finishing and taking it back

    func testAHoleNobodyHitOnCannotBeFinished() {
        var c = card()
        c.finish(hole: 1, tapIn: true)
        XCTAssertNil(c.entry(1))
        c.finish(hole: 1, tapIn: false)
        XCTAssertNil(c.entry(1))
    }

    func testAFinishedHoleIgnoresAStrayTap() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.finish(hole: 1, tapIn: false)
        c.record(.shot(by: "d"), on: 1)
        XCTAssertEqual(c.entry(1)?.score, 1, "a tap after 'holed it' must not turn the score over")
    }

    func testUndoReversesWhateverTheLastActWas() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.record(.shot(by: "d"), on: 1)
        c.finish(hole: 1, tapIn: true)
        XCTAssertEqual(c.entry(1)?.score, 3)

        c.undo(hole: 1)   // the tap-in comes off and the hole reopens
        XCTAssertEqual(c.entry(1)?.score, 2)
        XCTAssertFalse(c.entry(1)?.finished ?? true)

        c.finish(hole: 1, tapIn: false)
        c.undo(hole: 1)   // "holed it" is taken back; the shot itself stays
        XCTAssertEqual(c.entry(1)?.score, 2)
        XCTAssertFalse(c.entry(1)?.finished ?? true)

        c.undo(hole: 1)
        c.undo(hole: 1)
        c.undo(hole: 1)   // nothing left to take back is fine
        XCTAssertEqual(c.entry(1)?.score, 0)
    }

    // MARK: Moving round the course

    func testAdvanceSkipsFinishedHolesAndWrapsToOneThatWasMissed() {
        var c = card(pars: Array(repeating: 4, count: 9))
        c.go(to: 3)
        for hole in 3...9 {
            c.record(.shot(by: "c"), on: hole)
            c.finish(hole: hole, tapIn: true)
        }
        c.go(to: 9)
        c.advance()
        XCTAssertEqual(c.currentHole, 1, "holes 1 and 2 were skipped, so the round is not over")
        XCTAssertFalse(c.isComplete)
        XCTAssertEqual(c.throughHole, 7)

        c.record(.shot(by: "c"), on: 1); c.finish(hole: 1, tapIn: true)
        c.record(.shot(by: "c"), on: 2); c.finish(hole: 2, tapIn: true)
        c.go(to: 2)
        c.advance()
        XCTAssertEqual(c.currentHole, 2, "nothing left to play: stay put")
        XCTAssertTrue(c.isComplete)
    }

    func testGoingToAHoleOffTheCardDoesNothing() {
        var c = card(pars: Array(repeating: 4, count: 9))
        c.go(to: 12)
        XCTAssertEqual(c.currentHole, 1)
        c.record(.shot(by: "c"), on: 12)
        XCTAssertNil(c.entry(12))
    }

    // MARK: The leaderboard

    func testTheTallyIsSortedByShotsKeptAndTiesSharePlace() {
        var c = card()
        // Corey 3, Dan 3, Pete 1, Sam 0.
        c.record(.shot(by: "c"), on: 1); c.record(.shot(by: "d"), on: 1); c.finish(hole: 1, tapIn: true)
        c.record(.shot(by: "d"), on: 2); c.record(.shot(by: "c"), on: 2); c.finish(hole: 2, tapIn: true)
        c.record(.shot(by: "c"), on: 3); c.record(.shot(by: "d"), on: 3); c.record(.shot(by: "p"), on: 3); c.finish(hole: 3, tapIn: false)

        let rows = ScrambleTally.rows(c)
        XCTAssertEqual(rows.map(\.kept), [3, 3, 1, 0])
        XCTAssertEqual(rows.map(\.place), [1, 1, 3, 4])
        // Both kept three; Corey drove twice to Dan's once, which orders the tie without breaking it.
        XCTAssertEqual(rows.map(\.id), ["c", "d", "p", "s"])
        XCTAssertEqual(rows[0].drives, 2)
        XCTAssertEqual(rows[2].holed, 1)
    }

    func testEveryPlayerHasARowBeforeAnythingIsKept() {
        let rows = ScrambleTally.rows(card())
        XCTAssertEqual(rows.count, 4)
        XCTAssertEqual(Set(rows.map(\.place)), [1])
    }

    // MARK: Initials

    func testInitialsGrowOnlyWhereTwoNamesCollide() {
        let players = [GolfPlayer(id: "1", name: "Corey"), GolfPlayer(id: "2", name: "Chris"), GolfPlayer(id: "3", name: "Dan")]
        let initials = ScrambleTally.initials(players)
        XCTAssertEqual(initials["1"], "CO")
        XCTAssertEqual(initials["2"], "CH")
        XCTAssertEqual(initials["3"], "D")
    }

    func testToParReadsLikeAGolfer() {
        XCTAssertEqual(ScrambleTally.toParText(0), "E")
        XCTAssertEqual(ScrambleTally.toParText(-2), "−2")
        XCTAssertEqual(ScrambleTally.toParText(3), "+3")
    }

    // MARK: The catalogue

    func testTheCatalogueRoundTripsThroughJSON() throws {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.finish(hole: 1, tapIn: true)
        var catalog = CardCatalog.empty
        catalog.upsert(c)

        let data = try catalog.encoded()
        let back = try CardCatalog.decode(data)
        // ISO 8601 keeps whole seconds, so the dates are compared after a second trip rather than
        // against the originals; everything else has to come back exactly.
        XCTAssertEqual(try back.encoded(), data)
        XCTAssertEqual(back.cards.map(\.id), catalog.cards.map(\.id))
        XCTAssertEqual(back.card(c.id)?.players, c.players)
        XCTAssertEqual(back.card(c.id)?.pars, c.pars)
        XCTAssertEqual(back.card(c.id)?.entry(1)?.score, 2)
        XCTAssertEqual(back.card(c.id)?.entry(1)?.strokes.map(\.kind), [.shot, .tapIn])
        XCTAssertTrue(back.card(c.id)?.entry(1)?.finished ?? false)

        // The wire shape is plain JSON: an ISO date, holes as a list, strokes with a kind.
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(json.contains("\"kind\":\"tapIn\""))
        XCTAssertTrue(json.contains("\"createdAt\":\""))
    }

    func testUpsertReplacesAndKeepsNewestFirst() {
        let older = ScrambleCard(name: "Old", createdAt: Date(timeIntervalSince1970: 1_000), players: [corey], pars: [4])
        var newer = ScrambleCard(name: "New", createdAt: Date(timeIntervalSince1970: 2_000), players: [corey], pars: [4])
        var catalog = CardCatalog.empty
        catalog.upsert(older)
        catalog.upsert(newer)
        newer.name = "Newer"
        catalog.upsert(newer)

        XCTAssertEqual(catalog.cards.map(\.name), ["Newer", "Old"])
        catalog.remove(older.id)
        XCTAssertEqual(catalog.cards.count, 1)
    }
}

/**
 The two things the round screen learned after somebody imagined a Saturday with it.

 Par is guessed at setup and corrected on the tee, and the hole you just finished is the one you
 need to reach when the screen has already moved on.
 */
final class RoundCorrectionTests: XCTestCase {
    private let corey = GolfPlayer(id: "c", name: "Corey")
    private let dan = GolfPlayer(id: "d", name: "Dan")

    private func card() -> ScrambleCard {
        ScrambleCard(name: "Saturday", players: [corey, dan], pars: Array(repeating: 4, count: 9))
    }

    func testCorrectingParChangesTheScoreItIsMeasuredAgainst() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        c.record(.shot(by: "d"), on: 1)
        c.record(.shot(by: "c"), on: 1)
        c.finish(hole: 1, tapIn: false)
        XCTAssertEqual(c.toPar, -1, "three on the par four the setup sheet guessed")

        c.setPar(3, on: 1)
        XCTAssertEqual(c.par(1), 3)
        XCTAssertEqual(c.toPar, 0, "the hole was always a par three; the card just said otherwise")
        XCTAssertEqual(ScrambleTally.label(score: 3, par: c.par(1)), "par")
        XCTAssertEqual(c.totalPar, 35)
    }

    func testParStaysInsideTheRangeAGolfCourseUses() {
        var c = card()
        c.setPar(1, on: 1)
        XCTAssertEqual(c.par(1), 3)
        c.setPar(9, on: 1)
        XCTAssertEqual(c.par(1), 6)
        c.setPar(5, on: 99)
        XCTAssertEqual(c.pars.count, 9, "a hole off the card cannot grow one")
    }

    func testTheLastFinishedHoleIsTheLastOneFinishedRatherThanTheHighestNumbered() {
        var c = card()
        for hole in [1, 2, 3] {
            c.record(.shot(by: "c"), on: hole)
            c.finish(hole: hole, tapIn: true)
        }
        XCTAssertEqual(c.lastFinished?.hole, 3)

        // The group skipped 4 for a group ahead, played 5, then came back to 4.
        c.record(.shot(by: "d"), on: 5)
        c.finish(hole: 5, tapIn: true)
        c.record(.shot(by: "d"), on: 4)
        c.finish(hole: 4, tapIn: true)
        XCTAssertEqual(c.lastFinished?.hole, 4, "by when it was written, not by its number")
    }

    func testThereIsNoLastFinishedHoleBeforeAnythingIsIn() {
        var c = card()
        c.record(.shot(by: "c"), on: 1)
        XCTAssertNil(c.lastFinished, "a hole in progress is not a hole that is in")
    }
}
