import XCTest
@testable import TallyKit

/// The JSON here is what the Worker sends today. If a field changes shape on the server, this
/// is the test that should go red before a phone does.
final class DecodingTests: XCTestCase {
    func testBootstrap() throws {
        let json = """
        {"now":"2026-09-13T20:00:00.000Z","build":"abc123","season":2026,"poolName":"High Five","currentWeek":2,"boardWeek":1,
         "weeks":[{"week":1,"firstKickoff":"2026-09-10T00:20:00.000Z","lastKickoff":"2026-09-15T00:15:00.000Z","gameCount":16,"lockedCount":16,"finalCount":16}],
         "players":[{"id":"p1","name":"Corey","claimed":true},{"id":"p2","name":"Sam","claimed":false}],
         "me":{"id":"p1","name":"Corey"},"account":{"id":"p1","name":"Corey"},"myEntries":[{"id":"p1","name":"Corey"},{"id":"p3","name":"Parker"}],
         "myCode":"QRT49MKP","myPasskeys":1}
        """
        let boot = try ISO8601Parsing.decoder.decode(BootstrapResponse.self, from: Data(json.utf8))
        XCTAssertEqual(boot.currentWeek, 2)
        XCTAssertEqual(boot.players.count, 2)
        XCTAssertEqual(boot.me?.name, "Corey")
        XCTAssertEqual(boot.myEntries?.count, 2)
        XCTAssertEqual(boot.myPasskeys, 1)
        XCTAssertEqual(boot.weeks[0].gameCount, 16)
    }

    func testAnonymousBootstrapHasNulls() throws {
        let json = """
        {"now":"2026-09-13T20:00:00Z","build":"abc","season":2026,"poolName":"High Five","currentWeek":2,"boardWeek":1,
         "weeks":[],"players":[],"me":null,"account":null,"myEntries":[],"myPasskeys":0}
        """
        let boot = try ISO8601Parsing.decoder.decode(BootstrapResponse.self, from: Data(json.utf8))
        XCTAssertNil(boot.me)
        XCTAssertNil(boot.myCode)
    }

    func testWeekAndPicks() throws {
        let json = """
        {"now":"2026-09-13T20:00:00.000Z","week":2,
         "games":[{"id":"2026_02_KC_BUF","season":2026,"week":2,"kickoffAt":"2026-09-20T20:25:00.000Z","away":"KC","home":"BUF","neutral":false,"venue":"Highmark Stadium",
                   "winner":null,"awayScore":null,"homeScore":null,"locked":false,"status":"upcoming"}],
         "myPicks":[{"gameId":"2026_02_KC_BUF","team":"KC","rank":1}],
         "pickCounts":{"2026_02_KC_BUF":{"away":3,"home":5}},"submitted":8}
        """
        let week = try ISO8601Parsing.decoder.decode(WeekResponse.self, from: Data(json.utf8))
        XCTAssertEqual(week.games[0].status, .upcoming)
        XCTAssertNil(week.games[0].winner)
        XCTAssertEqual(week.pickCounts["2026_02_KC_BUF"]?.total, 8)
        XCTAssertEqual(week.myPicks[0].rank, 1)
    }

    func testWeekRowSlotsFillFiveplaces() throws {
        let json = """
        {"now":"2026-09-13T20:00:00.000Z","week":1,"gameCount":16,"finalCount":2,"lockedCount":4,
         "rows":[{"playerId":"p1","name":"Dillon","isMe":false,"place":7,"points":9,"correct":2,"fives":1,"picksMade":5,"possible":15,
                  "hiddenRanks":[4],
                  "picks":[{"gameId":"a","team":"PIT","rank":1,"points":5,"outcome":"win"},
                           {"gameId":"b","team":"JAX","rank":2,"points":4,"outcome":"win"},
                           {"gameId":"c","team":"LAC","rank":3,"points":0,"outcome":"pending"},
                           {"gameId":"d","team":"PHI","rank":5,"points":0,"outcome":"pending"}]}]}
        """
        let board = try ISO8601Parsing.decoder.decode(WeekBoardResponse.self, from: Data(json.utf8))
        let slots = board.rows[0].pickSlots
        // Always five, always in rank order, and the hidden one holds its own place.
        XCTAssertEqual(slots.count, 5)
        XCTAssertEqual(slots.map(\.rank), [1, 2, 3, 4, 5])
        XCTAssertEqual(slots.map(\.points), [5, 4, 3, 2, 1])
        if case .hidden(let rank) = slots[3] { XCTAssertEqual(rank, 4) } else { XCTFail("rank 4 should be hidden") }
        if case .taken(let pick) = slots[0] { XCTAssertEqual(pick.team, "PIT") } else { XCTFail("rank 1 should be taken") }
    }

    func testWeekRowWithoutHiddenRanksStillDecodes() throws {
        let json = """
        {"now":"2026-09-13T20:00:00.000Z","week":1,"gameCount":16,"finalCount":0,"lockedCount":0,
         "rows":[{"playerId":"p1","name":"Sam","isMe":false,"place":1,"points":0,"correct":0,"fives":0,"picksMade":0,"possible":0,"picks":[]}]}
        """
        let board = try ISO8601Parsing.decoder.decode(WeekBoardResponse.self, from: Data(json.utf8))
        XCTAssertEqual(board.rows[0].pickSlots.count, 5)
        XCTAssertTrue(board.rows[0].pickSlots.allSatisfy { if case .empty = $0 { return true } else { return false } })
    }

    func testSeasonRowByWeekKeys() throws {
        let json = """
        {"now":"2026-09-13T20:00:00.000Z","season":2026,"fromWeek":2,"throughWeek":1,
         "rows":[{"playerId":"p1","name":"Corey","isMe":true,"place":1,"points":9,"correct":3,"fives":1,"possible":9,"weeksPlayed":1,
                  "bestWeek":{"week":1,"points":9},"byWeek":{"1":9}}]}
        """
        let board = try ISO8601Parsing.decoder.decode(SeasonBoardResponse.self, from: Data(json.utf8))
        XCTAssertEqual(board.rows[0].points(inWeek: 1), 9)
        XCTAssertEqual(board.rows[0].points(inWeek: 2), 0)
        XCTAssertEqual(board.seasonStartsAt, 2)
    }

    func testErrorEnvelopeWithDetails() throws {
        let json = """
        {"error":{"code":"GAME_LOCKED","message":"That game has already kicked off","details":{"gameIds":["a","b"],"kickoffs":{"a":"2026-09-13T17:00:00.000Z"}}}}
        """
        let body = try ISO8601Parsing.decoder.decode(ApiErrorBody.self, from: Data(json.utf8))
        XCTAssertEqual(body.error.code, "GAME_LOCKED")
        XCTAssertEqual(body.error.details?["gameIds"]?.stringArray, ["a", "b"])
    }

    func testPasskeyOptions() throws {
        let json = """
        {"challengeId":"c1","options":{"challenge":"YWJj","rp":{"name":"Tally","id":"playtally.app"},"user":{"id":"cDE","name":"Corey","displayName":"Corey"},
          "pubKeyCredParams":[{"alg":-7,"type":"public-key"}],"timeout":60000,"attestation":"none","excludeCredentials":[{"id":"ZXhpc3Rpbmc","type":"public-key","transports":["internal"]}],
          "authenticatorSelection":{"residentKey":"required","userVerification":"preferred","requireResidentKey":true},"extensions":{"credProps":true}}}
        """
        let res = try ISO8601Parsing.decoder.decode(PasskeyRegistrationOptionsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(res.options.rp.id, "playtally.app")
        XCTAssertEqual(res.options.excludeCredentials?.first?.id, "ZXhpc3Rpbmc")
        XCTAssertEqual(Base64URL.decode(res.options.user.id).map { String(decoding: $0, as: UTF8.self) }, "p1")
    }

    func testSetResultEncodesNullWinner() throws {
        let data = try ISO8601Parsing.encoder.encode(SetResultRequest(winner: nil))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "{\"winner\":null}")
    }
}
