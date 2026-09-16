import XCTest
@testable import TallyKit

/// The lock screen's five slots. The app works these out and the widget only draws them, so a
/// mistake here is a mistake nobody can see in a preview.
final class WeekActivityTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_760_000_000)

    private func game(_ id: String, _ away: String, _ home: String, winner: String? = nil, kickoff: TimeInterval = -3600) -> Game {
        Game(
            id: id, season: 2026, week: 5, kickoffAt: now.addingTimeInterval(kickoff),
            away: away, home: home, neutral: false, venue: nil, winner: winner,
            awayScore: nil, homeScore: nil, locked: kickoff <= 0, status: winner != nil ? .final : kickoff <= 0 ? .live : .upcoming
        )
    }

    func testScoresOnlyTheGamesThatAreDone() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [
                Pick(gameId: "a", team: "BUF", rank: 1),
                Pick(gameId: "b", team: "KC", rank: 2),
                Pick(gameId: "c", team: "NE", rank: 3),
            ],
            games: [
                game("a", "BUF", "HOU", winner: "BUF"),
                game("b", "KC", "DEN", winner: "DEN"),
                game("c", "NE", "CLE", kickoff: 7200),
            ],
            now: now
        )
        // Rank 1 won and is worth 5. Rank 2 lost. Rank 3 has not kicked off, so it is still live
        // for 3 — which is the number that makes the thing worth watching.
        XCTAssertEqual(state.points, 5)
        XCTAssertEqual(state.possible, 3)
        XCTAssertEqual(state.slots.map(\.state), [.won, .lost, .waiting])
        XCTAssertFalse(state.picksSettled)
    }

    func testAGameUnderWayIsLiveRatherThanWaiting() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1)],
            games: [game("a", "BUF", "HOU", kickoff: -600)],
            now: now
        )
        XCTAssertEqual(state.slots.first?.state, .live)
        XCTAssertEqual(state.possible, 5)
    }

    func testATieEarnsNothingAndEndsTheSlot() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1)],
            games: [game("a", "BUF", "HOU", winner: "TIE")],
            now: now
        )
        XCTAssertEqual(state.slots.first?.state, .tied)
        XCTAssertEqual(state.points, 0)
        XCTAssertEqual(state.possible, 0)
        XCTAssertTrue(state.picksSettled)
    }

    func testAHiddenPickHoldsItsPlaceWithoutNamingTheTeam() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1)],
            games: [game("a", "BUF", "HOU", winner: "BUF")],
            hiddenRanks: [3],
            now: now
        )
        XCTAssertEqual(state.slots.map(\.rank), [1, 3])
        XCTAssertNil(state.slots.last?.team)
        XCTAssertEqual(state.slots.last?.state, .waiting)
        // The rank is public even while the team is not, so its stake counts towards what is left.
        XCTAssertEqual(state.possible, 3)
    }

    func testRanksNobodyTookAreNotSlots() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 2)],
            games: [game("a", "BUF", "HOU")],
            now: now
        )
        XCTAssertEqual(state.slots.count, 1)
        XCTAssertEqual(state.slots.first?.rank, 2)
        XCTAssertEqual(state.slots.first?.stake, 4)
    }

    func testDisplayOrderPutsTheSurestPickFirst() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [
                Pick(gameId: "c", team: "NE", rank: 3),
                Pick(gameId: "a", team: "BUF", rank: 1),
                Pick(gameId: "b", team: "KC", rank: 2),
            ],
            games: [game("a", "BUF", "HOU"), game("b", "KC", "DEN"), game("c", "NE", "CLE")],
            now: now
        )
        XCTAssertEqual(state.inDisplayOrder.map(\.stake), [5, 4, 3])
    }

    func testTheSummaryFitsWhereFiveSlotsWillNot() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [
                Pick(gameId: "a", team: "BUF", rank: 1),
                Pick(gameId: "b", team: "KC", rank: 2),
                Pick(gameId: "c", team: "NE", rank: 3),
            ],
            games: [
                game("a", "BUF", "HOU", winner: "BUF"),
                game("b", "KC", "DEN", winner: "DEN"),
                game("c", "NE", "CLE", kickoff: 7200),
            ],
            now: now
        )
        XCTAssertEqual(state.summary, "1/2 · 5 pts")
    }

    // MARK: The five phases

    /**
     The phase is the whole design of the lock screen: it picks the sentence under the row, and
     two of its five values exist because an earlier build did not have them and took the activity
     down at the exact moments somebody wanted it. These are the regression tests for that.
     */

    func testNothingKickedOffIsLocked() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1), Pick(gameId: "b", team: "KC", rank: 2)],
            games: [game("a", "BUF", "HOU", kickoff: 3600), game("b", "KC", "DEN", kickoff: 7200)],
            now: now
        )
        XCTAssertEqual(state.phase, .locked)
        XCTAssertEqual(state.possible, 9)
        // The countdown names their own next game, not the league's next game.
        XCTAssertEqual(state.nextKickoffEpoch, Int(now.addingTimeInterval(3600).timeIntervalSince1970))
    }

    func testAGameOnNowIsLive() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1), Pick(gameId: "b", team: "KC", rank: 2)],
            games: [game("a", "BUF", "HOU", winner: "BUF"), game("b", "KC", "DEN", kickoff: -600)],
            now: now
        )
        XCTAssertEqual(state.phase, .live)
    }

    /// Half past three on a Sunday: the early games are in, the late ones are not on yet. The old
    /// rule saw nothing live and nothing finished and had no name for it.
    func testTheGapBetweenSlatesIsItsOwnPhase() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [
                Pick(gameId: "early", team: "BUF", rank: 1),
                Pick(gameId: "late", team: "KC", rank: 2),
            ],
            games: [
                game("early", "BUF", "HOU", winner: "BUF"),
                game("late", "KC", "DEN", kickoff: 3600),
            ],
            now: now
        )
        XCTAssertEqual(state.phase, .between)
        XCTAssertFalse(state.picksSettled)
        XCTAssertEqual(state.outstanding.games, 1)
        XCTAssertEqual(state.outstanding.points, 4)
        XCTAssertEqual(state.nextKickoffEpoch, Int(now.addingTimeInterval(3600).timeIntervalSince1970))
    }

    /**
     Their five are done and the week is not. This is the one that matters most: points are fixed,
     position is not, and the old rule ended the activity here — at four o'clock, with seven hours
     of other people's football still to move them up and down the board.
     */
    func testAllFiveSettledWithTheWeekStillRunningIsWatching() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1)],
            games: [
                game("a", "BUF", "HOU", winner: "BUF"),
                // Somebody else's game, still to come. It is what keeps the week open.
                game("z", "SF", "SEA", kickoff: 7200),
            ],
            now: now,
            place: 2,
            field: 12
        )
        XCTAssertTrue(state.picksSettled)
        XCTAssertFalse(state.weekFinal)
        XCTAssertEqual(state.phase, .watching)
        XCTAssertEqual(state.outstanding.games, 0)
        XCTAssertNil(state.nextKickoff)
    }

    func testTheWeekBeingOverIsFinal() {
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "a", team: "BUF", rank: 1)],
            games: [game("a", "BUF", "HOU", winner: "BUF"), game("z", "SF", "SEA", winner: "SF")],
            now: now,
            place: 1,
            field: 12
        )
        XCTAssertTrue(state.weekFinal)
        XCTAssertEqual(state.phase, .final)
    }

    /// A week the app has no schedule for must not announce itself as finished; `allSatisfy` on an
    /// empty list is true, which is exactly the trap.
    func testAnEmptyScheduleIsNotAFinishedWeek() {
        let state = WeekActivityAttributes.ContentState.from(picks: [], games: [], now: now)
        XCTAssertFalse(state.weekFinal)
        XCTAssertNotEqual(state.phase, .final)
    }

    func testItSurvivesAPickWhoseGameIsMissing() {
        // The week response and the picks can disagree for a moment after a switch of entry.
        let state = WeekActivityAttributes.ContentState.from(
            picks: [Pick(gameId: "gone", team: "BUF", rank: 1)],
            games: [],
            now: now
        )
        XCTAssertEqual(state.slots.map(\.state), [.waiting])
        XCTAssertEqual(state.points, 0)
    }

    /// One wording for the lock screen and the picks tab, so the two never disagree about a Sunday.
    func testTheStatusLineAnswersEachPhase() {
        let clock: (Date) -> String = { _ in "4:05 PM" }
        let picks = [Pick(gameId: "a", team: "BUF", rank: 1), Pick(gameId: "b", team: "KC", rank: 2)]

        let locked = WeekActivityAttributes.ContentState.from(
            picks: picks, games: [game("a", "BUF", "HOU", kickoff: 3600), game("b", "KC", "DEN", kickoff: 7200)], now: now
        )
        XCTAssertEqual(locked.statusLine(clock: clock), "Picks are in — first game 4:05 PM.")

        let live = WeekActivityAttributes.ContentState.from(
            picks: picks, games: [game("a", "BUF", "HOU"), game("b", "KC", "DEN", kickoff: 7200)], now: now
        )
        XCTAssertEqual(live.statusLine(clock: clock), "1 game on now · 9 still to play for.")

        let between = WeekActivityAttributes.ContentState.from(
            picks: picks, games: [game("a", "BUF", "HOU", winner: "BUF"), game("b", "KC", "DEN", kickoff: 7200)], now: now
        )
        XCTAssertEqual(between.statusLine(clock: clock), "Back at 4:05 PM · 1 game left, worth 4.")

        let watching = WeekActivityAttributes.ContentState.from(
            picks: picks,
            games: [game("a", "BUF", "HOU", winner: "BUF"), game("b", "KC", "DEN", winner: "DEN"), game("c", "NE", "CLE")],
            now: now
        )
        XCTAssertEqual(watching.statusLine(clock: clock), "All five in. Your place can still move.")

        let won = WeekActivityAttributes.ContentState.from(
            picks: picks, games: [game("a", "BUF", "HOU", winner: "BUF"), game("b", "KC", "DEN", winner: "KC")],
            now: now, place: 1, field: 12
        )
        XCTAssertEqual(won.statusLine(clock: clock), "You won the week on 9 points.")
        XCTAssertEqual(won.statusLine(stale: true, clock: clock), "Scores may be behind.")
    }
}
