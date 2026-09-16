import XCTest
@testable import TallyKit

final class CodesTests: XCTestCase {
    func testNormalizeStripsDashSpacesAndCase() {
        XCTAssertEqual(Codes.normalize("q7mn-4pk2"), "Q7MN4PK2")
        XCTAssertEqual(Codes.normalize(" q7mn 4pk2 "), "Q7MN4PK2")
    }

    func testShape() {
        XCTAssertTrue(Codes.isCodeShaped("QRT4-9MKP"))
        XCTAssertFalse(Codes.isCodeShaped("QRT4-9MK"))
        // I, L, O, 0 and 1 are not in the alphabet.
        XCTAssertFalse(Codes.isCodeShaped("QRT4-9MK1"))
    }

    func testFormat() {
        XCTAssertEqual(Codes.format("qrt49mkp"), "QRT4-9MKP")
        XCTAssertEqual(Codes.formatWhileTyping("qrt"), "QRT")
        XCTAssertEqual(Codes.formatWhileTyping("qrt49"), "QRT4-9")
        XCTAssertEqual(Codes.formatWhileTyping("qrt49mkp2222"), "QRT4-9MKP")
    }
}

final class NamesTests: XCTestCase {
    func testValidation() {
        XCTAssertEqual(Names.validate("  Corey   W. ").name, "Corey W.")
        XCTAssertEqual(Names.validate("C").message, "Needs at least 2 characters.")
        XCTAssertNotNil(Names.validate(String(repeating: "a", count: 25)).message)
        XCTAssertNotNil(Names.validate("Bob <script>").message)
        XCTAssertNil(Names.validate("José O'Neil-Smith 2").message)
    }

    func testKeyIsCaseInsensitive() {
        XCTAssertEqual(Names.key("Corey"), Names.key("COREY "))
    }
}

final class DraftTests: XCTestCase {
    func testToggleSwapAndClear() {
        var d = Draft.empty
        d = d.toggling(gameId: "g1", team: "KC")
        d = d.toggling(gameId: "g2", team: "BUF")
        XCTAssertEqual(d.order, ["g1", "g2"])
        // Swapping sides keeps the game's place in the order.
        d = d.toggling(gameId: "g1", team: "LV")
        XCTAssertEqual(d.selections["g1"], "LV")
        XCTAssertEqual(d.order, ["g1", "g2"])
        // Tapping the chosen side again clears the game.
        d = d.toggling(gameId: "g1", team: "LV")
        XCTAssertNil(d.selections["g1"])
        XCTAssertEqual(d.order, ["g2"])
    }

    func testMove() {
        let d = Draft(selections: ["a": "KC", "b": "BUF", "c": "SF"], order: ["a", "b", "c"])
        XCTAssertEqual(d.moving(from: 2, to: 0).order, ["c", "a", "b"])
        XCTAssertEqual(d.moving(from: 0, to: 5).order, ["a", "b", "c"])
    }

    func testRoundTripsThroughDefaults() {
        let defaults = UserDefaults(suiteName: "tally-tests-\(UUID().uuidString)")!
        let d = Draft(selections: ["a": "KC"], order: ["a"])
        DraftStore.save(d, playerId: "p", week: 3, defaults: defaults)
        XCTAssertEqual(DraftStore.load(playerId: "p", week: 3, defaults: defaults), d)
        DraftStore.clear(playerId: "p", week: 3, defaults: defaults)
        XCTAssertNil(DraftStore.load(playerId: "p", week: 3, defaults: defaults))
    }

    /**
     The regression that made five saved picks look lost.

     Locking in clears the store and then resets the draft to empty, and that reset is itself a
     change the screen writes back. If an empty draft persists, the next load prefers it over the
     picks on the server and the tray comes back empty.
     */
    func testAnEmptyDraftClearsRatherThanPersisting() {
        let defaults = UserDefaults(suiteName: "tally-tests-\(UUID().uuidString)")!
        DraftStore.save(Draft(selections: ["a": "KC"], order: ["a"]), playerId: "p", week: 3, defaults: defaults)
        XCTAssertNotNil(DraftStore.load(playerId: "p", week: 3, defaults: defaults))

        DraftStore.save(.empty, playerId: "p", week: 3, defaults: defaults)
        XCTAssertNil(
            DraftStore.load(playerId: "p", week: 3, defaults: defaults),
            "an empty draft must read back as no draft, or it wins over the saved picks"
        )
    }

    func testADraftWithSelectionsButNoOrderIsAlsoNothing() {
        // Reachable while a pick is being swapped; there is nothing to restore from it either.
        let defaults = UserDefaults(suiteName: "tally-tests-\(UUID().uuidString)")!
        DraftStore.save(Draft(selections: ["a": "KC"], order: []), playerId: "p", week: 3, defaults: defaults)
        XCTAssertNil(DraftStore.load(playerId: "p", week: 3, defaults: defaults))
    }
}

final class ScoringTests: XCTestCase {
    func testPointsForRank() {
        XCTAssertEqual(Scoring.points(forRank: 1), 5)
        XCTAssertEqual(Scoring.points(forRank: 5), 1)
        XCTAssertEqual(Scoring.maxWeekPoints, 15)
    }

    func testOrdinal() {
        XCTAssertEqual(Scoring.ordinal(1), "1st")
        XCTAssertEqual(Scoring.ordinal(2), "2nd")
        XCTAssertEqual(Scoring.ordinal(3), "3rd")
        XCTAssertEqual(Scoring.ordinal(11), "11th")
        XCTAssertEqual(Scoring.ordinal(22), "22nd")
    }

    func testOutcomeFollowsWinner() {
        let now = Date()
        let game = Game(id: "g", season: 2026, week: 1, kickoffAt: now.addingTimeInterval(-3600), away: "KC", home: "BUF", neutral: false,
                        venue: nil, winner: "KC", awayScore: 24, homeScore: 20, locked: true, status: .final)
        XCTAssertEqual(Scoring.score(Pick(gameId: "g", team: "KC", rank: 1), game: game, now: now).points, 5)
        XCTAssertEqual(Scoring.score(Pick(gameId: "g", team: "BUF", rank: 1), game: game, now: now).outcome, .loss)
    }
}

final class PoolRefTests: XCTestCase {
    func testApiAndWebURLs() {
        let pool = PoolRef.default
        XCTAssertEqual(pool.apiURL("/weeks/3").absoluteString, "https://playtally.app/api/weeks/3")
        XCTAssertEqual(pool.webURL.absoluteString, "https://playtally.app/p/high-five")
        XCTAssertEqual(pool.webURL(path: "/board/week/2").absoluteString, "https://playtally.app/p/high-five/board/week/2")
    }

    func testParsesPoolLinks() throws {
        let parsed = try XCTUnwrap(PoolRef.parse(URL(string: "https://playtally.app/p/high-five/welcome?claim=abc&code=QRT49MKP")!))
        XCTAssertEqual(parsed.pool, PoolRef.default)
        XCTAssertEqual(parsed.path, "/welcome")
        XCTAssertEqual(parsed.query["claim"], "abc")
        XCTAssertEqual(parsed.query["code"], "QRT49MKP")
        XCTAssertNil(PoolRef.parse(URL(string: "https://playtally.app/")!))
        let other = try XCTUnwrap(PoolRef.parse(URL(string: "https://example.com/p/other")!))
        XCTAssertEqual(other.pool.host, "example.com")
        XCTAssertEqual(other.pool.slug, "other")
        XCTAssertEqual(other.path, "/")
    }

    func testCatalogOpensAndOrders() {
        var c = PoolCatalog.empty
        c.open(PoolRef.default, name: "High Five")
        c.open(PoolRef(origin: PoolRef.default.origin, slug: "survivor"), name: "Survivor")
        XCTAssertEqual(c.current?.ref.slug, "survivor")
        XCTAssertEqual(c.pools.count, 2)
        c.remove("playtally.app/survivor")
        XCTAssertEqual(c.current?.ref.slug, "high-five")
    }
}

final class Base64URLTests: XCTestCase {
    func testRoundTrip() {
        let data = Data([0xfb, 0xff, 0x00, 0x01, 0x7e])
        let s = Base64URL.encode(data)
        XCTAssertFalse(s.contains("+") || s.contains("/") || s.contains("="))
        XCTAssertEqual(Base64URL.decode(s), data)
    }
}

final class PoolHomeTests: XCTestCase {
    private func week(_ week: Int, final finalCount: Int, games gameCount: Int = 16) -> WeekSummary {
        WeekSummary(
            week: week,
            firstKickoff: Date(timeIntervalSince1970: 0),
            lastKickoff: Date(timeIntervalSince1970: 86_400),
            gameCount: gameCount,
            lockedCount: gameCount,
            finalCount: finalCount
        )
    }

    func testFeaturesTheLatestWeekWithEveryResultRecorded() {
        XCTAssertEqual(PoolHome.latestCompletedWeek([week(1, final: 16), week(2, final: 3), week(3, final: 16)]), 3)
        XCTAssertNil(PoolHome.latestCompletedWeek([week(1, final: 15), week(2, final: 0)]))
    }

    /// An empty week is trivially "all final" by arithmetic, and must not outrank a real one.
    func testAWeekWithNoGamesNeverCounts() {
        XCTAssertNil(PoolHome.latestCompletedWeek([week(1, final: 0, games: 0)]))
        XCTAssertEqual(PoolHome.latestCompletedWeek([week(1, final: 16), week(2, final: 0, games: 0)]), 1)
    }

    func testNoWeeksAtAll() {
        XCTAssertNil(PoolHome.latestCompletedWeek([]))
    }
}
