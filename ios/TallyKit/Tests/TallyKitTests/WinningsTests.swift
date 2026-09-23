import XCTest
@testable import TallyKit

final class WinningsTests: XCTestCase {
    func testTheDollarSignAlwaysLeadsAndTrailingZerosNeverAppear() {
        XCTAssertEqual(Winnings.label(18), "$18")
        XCTAssertEqual(Winnings.label(6), "$6")
        XCTAssertEqual(Winnings.label(0), "$0")
    }

    func testACleanSplitKeepsBothDecimals() {
        XCTAssertEqual(Winnings.label(4.5), "$4.50")
        XCTAssertEqual(Winnings.label(12.75), "$12.75")
    }

    func testThePotAmountsMatchTheRules() {
        XCTAssertEqual(Winnings.weeklyPot, 18)
        XCTAssertEqual(Winnings.seasonPot, 51)
    }
}
