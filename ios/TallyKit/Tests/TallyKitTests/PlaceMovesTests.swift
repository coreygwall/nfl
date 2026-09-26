import XCTest
@testable import TallyKit

final class PlaceMovesTests: XCTestCase {
    private func row(_ id: String, _ place: Int) -> WeekRow {
        WeekRow(playerId: id, name: id, isMe: false, mine: nil, place: place, points: 0, correct: 0,
                fives: 0, picksMade: 0, possible: 0, picks: [], hiddenRanks: nil)
    }

    func testUpIsPositiveAndDownIsNegative() {
        let before = [row("a", 1), row("b", 2), row("c", 3)]
        let after = [row("c", 1), row("a", 2), row("b", 3)]
        XCTAssertEqual(PlaceMoves.between(before, after), ["c": 2, "a": -1, "b": -1])
    }

    func testNobodyWhoStayedPutIsMentioned() {
        let board = [row("a", 1), row("b", 2)]
        XCTAssertEqual(PlaceMoves.between(board, board), [:])
    }

    func testSomebodyNewHasNoBeforeAndSomebodyGoneHasNoAfter() {
        let before = [row("a", 1), row("gone", 2)]
        let after = [row("new", 1), row("a", 2)]
        XCTAssertEqual(PlaceMoves.between(before, after), ["a": -1])
    }

    func testATieForAPlaceIsNotAMove() {
        // Two level on points share second; neither moved.
        let before = [row("a", 1), row("b", 2), row("c", 2)]
        let after = [row("a", 1), row("c", 2), row("b", 2)]
        XCTAssertEqual(PlaceMoves.between(before, after), [:])
    }
}
