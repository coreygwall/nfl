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
        XCTAssertFalse(state.isFinished)
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
        XCTAssertTrue(state.isFinished)
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
}
