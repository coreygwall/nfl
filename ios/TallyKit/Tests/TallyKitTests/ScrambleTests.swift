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

/**
 What leaves the phone, and what the lock screen says while the round is still on.

 Both are readings of the same card, and both are the parts somebody else sees — the group chat at
 the end, and a glance from four feet away in between.
 */
final class RoundSharingTests: XCTestCase {
    private let corey = GolfPlayer(id: "c", name: "Corey")
    private let dan = GolfPlayer(id: "d", name: "Dan")
    private let pete = GolfPlayer(id: "p", name: "Pete")

    private func played() -> ScrambleCard {
        var c = ScrambleCard(name: "Saturday", course: "Blue Hill", players: [corey, dan, pete], pars: [4, 3, 5])
        // Hole 1, par 4: Corey drove, Dan's approach, Dan holed it. A birdie.
        c.record(.shot(by: "c"), on: 1); c.record(.shot(by: "d"), on: 1); c.record(.shot(by: "d"), on: 1)
        c.finish(hole: 1, tapIn: false)
        // Hole 2, par 3: Corey's tee shot, Corey's lag, tap-in. A par.
        c.record(.shot(by: "c"), on: 2); c.record(.shot(by: "c"), on: 2)
        c.finish(hole: 2, tapIn: true)
        // Corey 3 kept (2 off the tee), Dan 2 (1 holed), Pete none. Six strokes, one under.
        return c
    }

    // MARK: A stroke nobody is credited with, that is not a penalty

    func testNobodysBallCountsOnTheCardAndOnNobodysTally() {
        var c = played()
        c.record(.shot(by: "p"), on: 3)
        c.record(.unclaimed, on: 3)
        c.record(.shot(by: "p"), on: 3)
        c.finish(hole: 3, tapIn: true)

        XCTAssertEqual(c.entry(3)?.score, 4, "all four strokes are on the card")
        XCTAssertEqual(c.strokesTaken, 10, "six from the first two holes plus this one's four")
        let pete = ScrambleTally.rows(c).first { $0.id == "p" }
        XCTAssertEqual(pete?.kept, 2, "only the two that were somebody's")
        XCTAssertEqual(c.entry(3)?.strokes.map(\.kind), [.shot, .unclaimed, .shot, .tapIn])
    }

    func testAnUnclaimedStrokeBeforeTheFirstShotDoesNotBecomeTheDrive() {
        var c = ScrambleCard(name: "x", players: [corey, dan], pars: [4])
        c.record(.unclaimed, on: 1)
        c.record(.shot(by: "d"), on: 1)
        c.finish(hole: 1, tapIn: true)
        XCTAssertEqual(c.entry(1)?.drive?.playerId, "d")
        XCTAssertEqual(ScrambleTally.rows(c).first { $0.id == "d" }?.drives, 1)
    }

    func testAnUnclaimedStrokeSurvivesTheRoundTrip() throws {
        var c = ScrambleCard(name: "x", players: [corey], pars: [4])
        c.record(.unclaimed, on: 1)
        var catalog = CardCatalog.empty
        catalog.upsert(c)
        let back = try CardCatalog.decode(try catalog.encoded())
        XCTAssertEqual(back.card(c.id)?.entry(1)?.strokes.map(\.kind), [.unclaimed])
    }

    // MARK: The message

    func testTheSummaryReadsLikeSomethingYouWouldPaste() {
        let text = ScrambleTally.summary(played())
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)

        XCTAssertEqual(lines[0], "Saturday · Blue Hill")
        XCTAssertEqual(lines[1], "6 strokes, \(ScrambleTally.toParText(-1)) · through 2")
        XCTAssertTrue(text.contains("Shots kept"))
        // Corey kept three, two of them drives; Dan kept two and holed one; Pete has nothing to brag on.
        XCTAssertTrue(text.contains("1. Corey — 3 (2 off the tee)"), text)
        XCTAssertTrue(text.contains("2. Dan — 2 (1 holed)"), text)
        XCTAssertTrue(text.contains("3. Pete — 0"), text)
        XCTAssertTrue(text.hasSuffix("Kept with Tally"))
    }

    func testTheSummarySaysSoBeforeAnybodyHasHitAnything() {
        let card = ScrambleCard(name: "Saturday", players: [corey, dan], pars: [4, 4])
        let text = ScrambleTally.summary(card)
        XCTAssertTrue(text.contains("not started"), text)
        XCTAssertFalse(text.contains("Shots kept"), "nothing to rank yet")
    }

    func testACardWithNoCourseDoesNotTrailASeparator() {
        let card = ScrambleCard(name: "Saturday", players: [corey], pars: [4])
        XCTAssertEqual(ScrambleTally.summary(card).split(separator: "\n").first.map(String.init), "Saturday")
    }

    // MARK: The lock screen

    func testTheLockScreenStateFollowsTheHoleBeingPlayed() {
        var c = played()
        c.go(to: 3)
        c.record(.shot(by: "p"), on: 3)

        let state = RoundActivityAttributes.state(from: c)
        XCTAssertEqual(state.hole, 3)
        XCTAssertEqual(state.par, 5)
        XCTAssertEqual(state.strokesOnHole, 1)
        XCTAssertEqual(state.through, 2)
        XCTAssertEqual(state.strokes, 6)
        XCTAssertEqual(state.toPar, -1)
        XCTAssertFalse(state.done)
        XCTAssertEqual(state.statusLine(), "Hole 3, par 5 · 1 shot in.")
        XCTAssertEqual(state.leadLine(), "Corey leads with 3 kept.")
    }

    func testAFinishedHoleIsNotStrokesInProgress() {
        var c = played()
        c.go(to: 2)
        let state = RoundActivityAttributes.state(from: c)
        XCTAssertEqual(state.strokesOnHole, 0, "hole 2 is in; its strokes are not still being played")
        XCTAssertEqual(state.statusLine(), "Hole 2, par 3 · through 2.")
    }

    func testTheLockScreenSaysNothingAboutALeadNobodyHas() {
        let card = ScrambleCard(name: "x", players: [corey, dan], pars: [4])
        let state = RoundActivityAttributes.state(from: card)
        XCTAssertNil(state.leadLine())
        XCTAssertEqual(state.statusLine(), "Hole 1, par 4 · on the tee.")
    }

    func testATiedLeadNamesBothAndAgreesWithItself() {
        var c = ScrambleCard(name: "x", players: [corey, dan], pars: [4, 4])
        c.record(.shot(by: "c"), on: 1); c.finish(hole: 1, tapIn: true)
        c.record(.shot(by: "d"), on: 2); c.finish(hole: 2, tapIn: true)

        let state = RoundActivityAttributes.state(from: c)
        XCTAssertEqual(state.leaders, ["Corey", "Dan"])
        XCTAssertEqual(state.leadLine(), "Corey and Dan lead with 1 kept.")
        XCTAssertTrue(state.done)
        XCTAssertEqual(state.statusLine(), "That's the round. 4 strokes, \(ScrambleTally.toParText(-4)).")
    }

    func testTheLockScreenTrimsABigGroupToWhatItCanDraw() {
        let many = (1...8).map { GolfPlayer(id: "\($0)", name: "P\($0)") }
        let card = ScrambleCard(name: "x", players: many, pars: [4])
        XCTAssertEqual(RoundActivityAttributes.state(from: card).lines.count, 4)
    }
}

/// The two brags the share card puts under the leaderboard, and who they name.
final class HighlightTests: XCTestCase {
    private let corey = GolfPlayer(id: "c", name: "Corey")
    private let dan = GolfPlayer(id: "d", name: "Dan")
    private let pete = GolfPlayer(id: "p", name: "Pete")

    func testEachBragNamesEverybodyTiedForIt() {
        var c = ScrambleCard(name: "x", players: [corey, dan, pete], pars: [4, 4, 4])
        // Corey drives and Dan holes it; then Dan drives and Corey holes it; then Pete does both.
        c.record(.shot(by: "c"), on: 1); c.record(.shot(by: "d"), on: 1); c.finish(hole: 1, tapIn: false)
        c.record(.shot(by: "d"), on: 2); c.record(.shot(by: "c"), on: 2); c.finish(hole: 2, tapIn: false)
        c.record(.shot(by: "p"), on: 3); c.finish(hole: 3, tapIn: false)

        let h = ScrambleTally.highlights(c)
        XCTAssertEqual(h.mostKept?.count, 2)
        XCTAssertEqual(h.mostKept?.names, ["Corey", "Dan"])
        XCTAssertEqual(h.mostKept?.who, "Corey and Dan")
        XCTAssertEqual(h.offTheTee?.count, 1)
        XCTAssertEqual(Set(h.offTheTee?.names ?? []), ["Corey", "Dan", "Pete"])
        XCTAssertEqual(h.holed?.count, 1)
        XCTAssertEqual(Set(h.holed?.names ?? []), ["Corey", "Dan", "Pete"])
    }

    func testABragNobodyEarnedIsNotOnTheCard() {
        var c = ScrambleCard(name: "x", players: [corey, dan], pars: [4])
        // Every hole finished on a tap-in, so nothing was holed by anybody.
        c.record(.shot(by: "c"), on: 1)
        c.finish(hole: 1, tapIn: true)

        let h = ScrambleTally.highlights(c)
        XCTAssertEqual(h.mostKept?.names, ["Corey"])
        XCTAssertEqual(h.offTheTee?.names, ["Corey"])
        XCTAssertNil(h.holed, "nobody holed one, which is not a highlight")
    }

    func testACardNobodyHasHitOnHasNoHighlightsAtAll() {
        let c = ScrambleCard(name: "x", players: [corey, dan], pars: [4])
        let h = ScrambleTally.highlights(c)
        XCTAssertNil(h.mostKept)
        XCTAssertNil(h.offTheTee)
        XCTAssertNil(h.holed)
    }
}

/**
 The two bets beside the round.

 The whole feature turns on one fact that is easy to get wrong: *par decides where a contest
 runs*, and par is editable from the tee. So every case here is a case where the par moved, the
 contest was off, or the phone was carrying a card written before any of this existed.
 */
final class SideContestTests: XCTestCase {
    private let corey = GolfPlayer(id: "c", name: "Corey")
    private let dan = GolfPlayer(id: "d", name: "Dan")
    private let pete = GolfPlayer(id: "p", name: "Pete")

    /// Holes 1-6: par 4, 3, 5, 4, 3, 5. Both contests on unless told otherwise.
    private func card(
        contests: ContestRules = ContestRules(longestDrive: true, closestToPin: true),
        points: PointValues = .standard
    ) -> ScrambleCard {
        ScrambleCard(
            name: "Saturday",
            players: [corey, dan, pete],
            pars: [4, 3, 5, 4, 3, 5],
            contests: contests,
            points: points
        )
    }

    // MARK: Where a contest runs

    func testParDecidesWhichContestAHoleHosts() {
        let c = card()
        XCTAssertNil(c.contest(for: 1), "a par four hosts neither")
        XCTAssertEqual(c.contest(for: 2), .closestToPin)
        XCTAssertEqual(c.contest(for: 3), .longestDrive)
        XCTAssertEqual(c.contestHoles, [2, 3, 5, 6])
    }

    func testACardWithTheContestsOffHostsNothingAnywhere() {
        let c = card(contests: .off)
        XCTAssertNil(c.contest(for: 2))
        XCTAssertNil(c.contest(for: 3))
        XCTAssertEqual(c.contestHoles, [])
        XCTAssertTrue(ScrambleTally.contestResults(c).isEmpty)
    }

    func testOnlyTheContestThatIsSwitchedOnRuns() {
        let c = card(contests: ContestRules(longestDrive: false, closestToPin: true))
        XCTAssertNil(c.contest(for: 3), "the par fives are not in play")
        XCTAssertEqual(c.contest(for: 2), .closestToPin)
        XCTAssertEqual(c.contestHoles, [2, 5])
    }

    func testCorrectingAParFromTheTeeMovesTheContestWithIt() {
        var c = card()
        XCTAssertNil(c.contest(for: 4))
        c.setPar(3, on: 4)
        XCTAssertEqual(c.contest(for: 4), .closestToPin, "the fourth turned out to be a three")
    }

    // MARK: Claiming one

    func testAnAwardNamesTheWinnerAndTappingTheSameNameTakesItBack() {
        var c = card()
        c.award(.closestToPin, on: 2, to: dan.id)
        XCTAssertEqual(c.winner(of: .closestToPin, on: 2)?.id, dan.id)
        c.award(.closestToPin, on: 2, to: nil)
        XCTAssertNil(c.winner(of: .closestToPin, on: 2))
    }

    func testOneWinnerPerContestPerHole() {
        var c = card()
        c.award(.closestToPin, on: 2, to: dan.id)
        c.award(.closestToPin, on: 2, to: pete.id)
        XCTAssertEqual(c.entry(2)?.awards.count, 1)
        XCTAssertEqual(c.winner(of: .closestToPin, on: 2)?.id, pete.id)
    }

    func testANameThatIsNotOnTheCardCannotBeGivenAnything() {
        var c = card()
        c.award(.longestDrive, on: 3, to: "stranger")
        XCTAssertNil(c.winner(of: .longestDrive, on: 3))
        XCTAssertEqual(c.entry(3)?.awards ?? [], [])
    }

    /// An award changes no score, so unlike a stroke it is allowed on a hole that is already in —
    /// which is usually when the argument about who was closest gets settled.
    func testAFinishedHoleCanStillBeAwarded() {
        var c = card()
        c.record(.shot(by: corey.id), on: 2)
        c.record(.shot(by: dan.id), on: 2)
        c.finish(hole: 2, tapIn: true)
        c.award(.closestToPin, on: 2, to: corey.id)
        XCTAssertEqual(c.winner(of: .closestToPin, on: 2)?.id, corey.id)
        XCTAssertEqual(c.entry(2)?.score, 3, "awarding it changed nothing on the card")
    }

    /**
     The case the contest is stored on the award for.

     Hole 3 was a five and Dan took the long drive; somebody then notices the card says four. The
     award stops counting, because hole 3 hosts nothing now — but it is still on disk as a
     *longest drive*, so correcting the par back brings Dan's claim back rather than silently
     reinterpreting it as a closest to the pin.
     */
    func testAParCorrectionOrphansAnAwardWithoutDestroyingIt() {
        var c = card()
        c.award(.longestDrive, on: 3, to: dan.id)
        XCTAssertEqual(c.winner(of: .longestDrive, on: 3)?.id, dan.id)

        c.setPar(4, on: 3)
        XCTAssertNil(c.winner(of: .longestDrive, on: 3), "hole 3 hosts nothing now")
        XCTAssertNil(c.winner(of: .closestToPin, on: 3), "and it is certainly not a closest to the pin")
        XCTAssertEqual(c.entry(3)?.award(.longestDrive), dan.id, "the record survives the miscount")

        c.setPar(5, on: 3)
        XCTAssertEqual(c.winner(of: .longestDrive, on: 3)?.id, dan.id, "and comes back with the par")
    }

    func testSwitchingAContestOffKeepsWhatWasAlreadyClaimed() {
        var c = card()
        c.award(.longestDrive, on: 3, to: dan.id)
        c.contests.longestDrive = false
        XCTAssertNil(c.winner(of: .longestDrive, on: 3))
        c.contests.longestDrive = true
        XCTAssertEqual(c.winner(of: .longestDrive, on: 3)?.id, dan.id)
    }

    // MARK: What the screens read

    func testEveryContestHoleIsListedWhetherOrNotAnybodyHasClaimedIt() {
        var c = card()
        c.award(.closestToPin, on: 2, to: corey.id)
        let results = ScrambleTally.contestResults(c)
        XCTAssertEqual(results.map(\.hole), [2, 3, 5, 6])
        XCTAssertEqual(results.filter(\.claimed).count, 1)
        XCTAssertEqual(results.first { $0.hole == 5 }?.contest, .closestToPin)
        XCTAssertNil(results.first { $0.hole == 5 }?.winner)
    }

    // MARK: Points

    func testPointsAddUpAtTheCardsOwnValues() {
        var c = card(points: PointValues(enabled: true, perShotKept: 1, perLongestDrive: 10, perClosestToPin: 5))
        // Corey keeps three shots across two holes.
        c.record(.shot(by: corey.id), on: 1)
        c.record(.shot(by: corey.id), on: 1)
        c.finish(hole: 1, tapIn: true)
        c.record(.shot(by: corey.id), on: 2)
        c.finish(hole: 2, tapIn: true)
        c.award(.closestToPin, on: 2, to: corey.id)
        c.award(.longestDrive, on: 3, to: corey.id)

        let row = ScrambleTally.points(c).first { $0.id == corey.id }
        XCTAssertEqual(row?.kept, 3)
        XCTAssertEqual(row?.closestToPins, 1)
        XCTAssertEqual(row?.longestDrives, 1)
        XCTAssertEqual(row?.points, 3 + 5 + 10)
        XCTAssertEqual(row?.place, 1)
    }

    /// A group that only cares about the contests sets the shot to nothing, and the board is
    /// purely the bets. Zero is a real value, not an unset one.
    func testAShotWorthNothingMakesTheBoardPurelyTheContests() {
        var c = card(points: PointValues(enabled: true, perShotKept: 0, perLongestDrive: 10, perClosestToPin: 10))
        c.record(.shot(by: corey.id), on: 1)
        c.finish(hole: 1, tapIn: true)
        c.award(.longestDrive, on: 3, to: dan.id)

        let rows = ScrambleTally.points(c)
        XCTAssertEqual(rows.first { $0.id == corey.id }?.points, 0, "a kept shot is worth nothing here")
        XCTAssertEqual(rows.first { $0.id == dan.id }?.points, 10)
        XCTAssertEqual(rows.first?.id, dan.id)
    }

    func testATieOnPointsSharesAPlaceTheWayTheOtherBoardDoes() {
        var c = card(points: PointValues(enabled: true, perShotKept: 10, perLongestDrive: 10, perClosestToPin: 10))
        c.record(.shot(by: corey.id), on: 1)
        c.finish(hole: 1, tapIn: true)
        c.award(.longestDrive, on: 3, to: dan.id)

        let rows = ScrambleTally.points(c)
        XCTAssertEqual(rows.filter { $0.points == 10 }.map(\.place), [1, 1])
        XCTAssertEqual(rows.last?.place, 3, "the place skips past the tie, the way a leaderboard does")
        XCTAssertEqual(rows.last?.points, 0)
    }

    func testAnOrphanedAwardIsWorthNoPoints() {
        var c = card(points: PointValues(enabled: true))
        c.award(.longestDrive, on: 3, to: dan.id)
        XCTAssertEqual(ScrambleTally.points(c).first { $0.id == dan.id }?.points, 10)
        c.setPar(4, on: 3)
        XCTAssertEqual(ScrambleTally.points(c).first { $0.id == dan.id }?.points, 0)
    }

    /// The board is a reading of the card, not a setting — the screen decides whether to draw it.
    func testTheBoardIsBuiltEvenWhenNobodyIsCountingPoints() {
        var c = card(points: PointValues(enabled: false))
        c.award(.longestDrive, on: 3, to: dan.id)
        XCTAssertEqual(ScrambleTally.points(c).first { $0.id == dan.id }?.points, 10)
    }

    func testAValueOutsideTheRangeIsClampedRatherThanTrusted() {
        let v = PointValues(enabled: true, perShotKept: -4, perLongestDrive: 900, perClosestToPin: 10)
        XCTAssertEqual(v.perShotKept, 0)
        XCTAssertEqual(v.perLongestDrive, 50)
    }

    func testTheValuesLineOnlyMentionsWhatIsBeingPlayed() {
        let c = card(
            contests: ContestRules(longestDrive: false, closestToPin: true),
            points: PointValues(enabled: true, perShotKept: 1, perLongestDrive: 10, perClosestToPin: 7)
        )
        let line = ScrambleTally.pointsLine(c)
        XCTAssertTrue(line.contains("1 a shot kept"))
        XCTAssertTrue(line.contains("7 a closest"))
        XCTAssertFalse(line.contains("long drive"), "the par fives are not in play")
    }

    // MARK: The brags

    func testHighlightsNameTheContestWinnersAndStaySilentOtherwise() {
        var c = card()
        XCTAssertNil(ScrambleTally.highlights(c).closestToPin, "nobody has one yet")
        c.award(.closestToPin, on: 2, to: dan.id)
        c.award(.closestToPin, on: 5, to: dan.id)
        let h = ScrambleTally.highlights(c)
        XCTAssertEqual(h.closestToPin?.names, ["Dan"])
        XCTAssertEqual(h.closestToPin?.count, 2)
        XCTAssertNil(h.longestDrive, "on the card, but nobody has taken one")
    }

    func testAContestThatIsNotBeingPlayedIsNeverAHighlight() {
        var c = card(contests: ContestRules(longestDrive: false, closestToPin: true))
        c.award(.longestDrive, on: 3, to: dan.id)
        XCTAssertNil(ScrambleTally.highlights(c).longestDrive)
    }

    // MARK: The cards already on people's phones

    /**
     The one that would have cost every round anybody had ever kept.

     `contests`, `points` and `awards` all arrived after cards were on phones, and Swift's
     synthesised decoder throws on a missing key rather than falling back to the property's
     default. `CardCatalog.load` turns a throw into an empty catalogue — silently — so without the
     hand-written decoders this JSON would decode to nothing at all.
     */
    func testACardSavedBeforeAnyOfThisExistedStillDecodes() throws {
        let json = """
        {"cards":[{        "createdAt":"2025-09-06T15:00:00Z",        "currentHole":2,        "course":"Blue Hill",        "holes":[{"finished":true,"hole":1,"strokes":[        {"id":"s1","kind":"shot","playerId":"c"},        {"id":"s2","kind":"tapIn"}],"updatedAt":"2025-09-06T15:20:00Z"}],        "id":"card-1",        "name":"Saturday scramble",        "pars":[4,3,5],        "players":[{"id":"c","name":"Corey"},{"id":"d","name":"Dan"}]}]}
        """
        let catalog = try CardCatalog.decode(Data(json.utf8))
        let card = try XCTUnwrap(catalog.card("card-1"))

        XCTAssertEqual(card.name, "Saturday scramble")
        XCTAssertEqual(card.throughHole, 1, "the round that was kept is still there")
        XCTAssertEqual(card.entry(1)?.score, 2)
        XCTAssertEqual(card.entry(1)?.awards ?? [], [], "no awards, rather than no card")
        XCTAssertEqual(card.contests, .off, "a card from before the contests is not playing them")
        XCTAssertEqual(card.points, .standard)
        XCTAssertFalse(card.points.enabled)
        XCTAssertNil(card.contest(for: 2), "and its par threes host nothing")
    }

    /// The round trip, so a card written by this build reads back the same on the next launch.
    func testAwardsSurviveBeingWrittenAndReadBack() throws {
        var c = card(points: PointValues(enabled: true, perShotKept: 2, perLongestDrive: 15, perClosestToPin: 15))
        c.award(.longestDrive, on: 3, to: dan.id)
        var catalog = CardCatalog.empty
        catalog.upsert(c)

        let back = try XCTUnwrap(CardCatalog.decode(catalog.encoded()).card(c.id))
        XCTAssertEqual(back.winner(of: .longestDrive, on: 3)?.id, dan.id)
        XCTAssertEqual(back.contests, c.contests)
        XCTAssertEqual(back.points, c.points)
    }
}

/// The lock screen's tap target, and that tapping it lands back on the round it came from.
final class RoundDeepLinkTests: XCTestCase {
    func testTheLinkCarriesTheCardIdAndNothingElse() {
        let url = RoundActivityAttributes.deepLink(cardId: "abc-123")
        XCTAssertEqual(url?.absoluteString, "https://playtally.app/golf/abc-123")
        XCTAssertEqual(RoundActivityAttributes.cardId(in: url!), "abc-123")
    }

    func testAPoolLinkIsNotMistakenForACardLink() {
        let pool = URL(string: "https://playtally.app/p/high-five/board/week/3")!
        XCTAssertNil(RoundActivityAttributes.cardId(in: pool))
    }

    func testAnUnrelatedHostIsNeverTrusted() {
        let spoofed = URL(string: "https://not-playtally.app/golf/abc-123")!
        XCTAssertNil(RoundActivityAttributes.cardId(in: spoofed))
    }

    func testTheBareDomainIsNotACardLink() {
        let bare = URL(string: "https://playtally.app/golf")!
        XCTAssertNil(RoundActivityAttributes.cardId(in: bare))
    }
}
