import XCTest
@testable import TallyKit

/// The one rule the app's home runs on: which contest wants you, and how it says so.
final class HubTests: XCTestCase {
    private let noon = Date(timeIntervalSince1970: 1_758_196_800) // 2025-09-18 12:00 UTC
    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private let clock = HubClock(kickoff: { "K\(Int($0.timeIntervalSince1970))" }, time: { "T\(Int($0.timeIntervalSince1970))" })

    private func entry(_ name: String, slots: [WeekActivity.Slot], place: Int? = nil, field: Int? = nil) -> WidgetEntry {
        WidgetEntry(
            id: name.lowercased(), name: name, slots: slots, points: 0, possible: 0, place: place, field: field,
            nextKickoffEpoch: nil, weekTop: [], seasonPlace: nil, seasonPoints: nil, seasonField: nil, seasonTop: [], seasonStarted: false
        )
    }

    private func five(_ state: WeekActivity.State = .waiting) -> [WeekActivity.Slot] {
        Scoring.allRanks.map { WeekActivity.Slot(rank: $0, team: "KC", state: state) }
    }

    private func pool(_ entries: [WidgetEntry], games: Int = 16, locked: Int = 0, final: Int = 0, kickoff: Date? = nil) -> HubPool {
        let snapshot = WidgetSnapshot(
            poolName: "High Five", poolSlug: "high-five", origin: URL(string: "https://playtally.app")!,
            week: 3, updatedAt: noon, entries: entries, seasonStartsAt: 2
        )
        let week = WeekSummary(
            week: 3, firstKickoff: kickoff ?? noon.addingTimeInterval(3 * 86_400), lastKickoff: noon.addingTimeInterval(5 * 86_400),
            gameCount: games, lockedCount: locked, finalCount: final
        )
        return HubPool(snapshot: snapshot, week: week)
    }

    // MARK: Attention

    func testOwingPicksWithGamesOpenNeedsYou() {
        let p = pool([entry("Corey", slots: Array(five().prefix(3)))])
        XCTAssertEqual(Hub.attention(pool: p), .needsYou)
    }

    func testOwingPicksWithEveryGameLockedIsAMissedWeekNotATask() {
        let p = pool([entry("Corey", slots: [])], locked: 16)
        XCTAssertNotEqual(Hub.attention(pool: p), .needsYou)
        XCTAssertEqual(Hub.attention(pool: p), .waiting)
    }

    func testAnyLiveGameIsLive() {
        var slots = five()
        slots[2] = WeekActivity.Slot(rank: 3, team: "BUF", state: .live)
        let p = pool([entry("Corey", slots: slots)], locked: 4)
        XCTAssertEqual(Hub.attention(pool: p), .live)
    }

    func testOwingBeatsLiveWhileGamesAreStillOpen() {
        // One entry is on, the other has not picked and could still pick the late games.
        var live = five()
        live[0] = WeekActivity.Slot(rank: 1, team: "KC", state: .live)
        let p = pool([entry("Corey", slots: live), entry("Parker", slots: [])], locked: 4)
        XCTAssertEqual(Hub.attention(pool: p), .needsYou)
    }

    func testEveryGameFinalIsDone() {
        let p = pool([entry("Corey", slots: five(.won))], locked: 16, final: 16)
        XCTAssertEqual(Hub.attention(pool: p), .done)
    }

    func testPicksInAndNothingStartedIsWaiting() {
        XCTAssertEqual(Hub.attention(pool: pool([entry("Corey", slots: five())])), .waiting)
    }

    func testTiersSortNeedsYouFirstAndDoneLast() {
        XCTAssertLessThan(HubAttention.needsYou, .live)
        XCTAssertLessThan(HubAttention.live, .waiting)
        XCTAssertLessThan(HubAttention.waiting, .done)
    }

    // MARK: Deadline wording

    func testDeadlineSaysTonightForAnEveningKickoffToday() {
        let kickoff = noon.addingTimeInterval(8 * 3600) // 20:00 UTC today
        let p = pool([entry("Corey", slots: [])], kickoff: kickoff)
        XCTAssertEqual(Hub.deadline(pool: p, now: noon, calendar: utc, clock: clock), "due tonight · T\(Int(kickoff.timeIntervalSince1970))")
    }

    func testDeadlineSaysTodayForAnAfternoonKickoff() {
        let kickoff = noon.addingTimeInterval(1 * 3600) // 13:00 UTC
        let p = pool([entry("Corey", slots: [])], kickoff: kickoff)
        XCTAssertTrue(Hub.deadline(pool: p, now: noon, calendar: utc, clock: clock)!.hasPrefix("due today · "))
    }

    func testDeadlineSaysTomorrow() {
        let kickoff = noon.addingTimeInterval(30 * 3600)
        let p = pool([entry("Corey", slots: [])], kickoff: kickoff)
        XCTAssertTrue(Hub.deadline(pool: p, now: noon, calendar: utc, clock: clock)!.hasPrefix("due tomorrow · "))
    }

    func testDeadlineNamesTheDayFurtherOut() {
        let kickoff = noon.addingTimeInterval(3 * 86_400)
        let p = pool([entry("Corey", slots: [])], kickoff: kickoff)
        XCTAssertEqual(Hub.deadline(pool: p, now: noon, calendar: utc, clock: clock), "due K\(Int(kickoff.timeIntervalSince1970))")
    }

    func testDeadlineCountsOpenGamesOnceSomeHaveStarted() {
        let p = pool([entry("Corey", slots: [])], locked: 13)
        XCTAssertEqual(Hub.deadline(pool: p, now: noon, calendar: utc, clock: clock), "3 games still open")
        XCTAssertEqual(Hub.deadline(pool: pool([entry("Corey", slots: [])], locked: 15), now: noon, calendar: utc, clock: clock), "1 game still open")
    }

    func testNoDeadlineOnceEverythingHasKickedOff() {
        XCTAssertNil(Hub.deadline(pool: pool([entry("Corey", slots: [])], locked: 16), now: noon, calendar: utc, clock: clock))
    }

    func testHeadlineLeadsWithTheWeek() {
        let owing = pool([entry("Corey", slots: [])], kickoff: noon.addingTimeInterval(30 * 3600))
        XCTAssertTrue(Hub.headline(pool: owing, now: noon, calendar: utc, clock: clock).hasPrefix("Week 3 · picks due tomorrow"))
        XCTAssertEqual(Hub.headline(pool: pool([entry("Corey", slots: five(.won))], locked: 16, final: 16), now: noon, calendar: utc, clock: clock), "Week 3 · final")
        XCTAssertEqual(Hub.headline(pool: pool([entry("Corey", slots: five())], locked: 9, final: 6), now: noon, calendar: utc, clock: clock), "Week 3 · 6 of 16 final")
    }

    // MARK: Who owes

    func testOwingLineMatchesTheFamilySize() {
        XCTAssertNil(Hub.owingLine(pool: pool([entry("Corey", slots: five())])))
        XCTAssertEqual(Hub.owingLine(pool: pool([entry("Corey", slots: [])])), "Your picks aren't in yet.")
        XCTAssertEqual(
            Hub.owingLine(pool: pool([entry("Corey", slots: []), entry("Declan", slots: []), entry("Parker", slots: [])])),
            "None of your 3 entries have picked yet."
        )
        XCTAssertEqual(
            Hub.owingLine(pool: pool([entry("Corey", slots: five()), entry("Declan", slots: []), entry("Parker", slots: [])])),
            "Declan and Parker still need picks."
        )
        XCTAssertEqual(
            Hub.owingLine(pool: pool([entry("Corey", slots: five()), entry("Declan", slots: Array(five().prefix(4)))])),
            "Declan still needs picks."
        )
    }

    // MARK: Slots back to places

    func testPickSlotsAlwaysDrawFivePlaces() {
        let slots = [
            WeekActivity.Slot(rank: 1, team: "KC", state: .won),
            WeekActivity.Slot(rank: 2, team: nil, state: .waiting),
            WeekActivity.Slot(rank: 4, team: "BUF", state: .lost),
        ]
        let places = Hub.pickSlots(slots)
        XCTAssertEqual(places.count, 5)
        XCTAssertEqual(places.map(\.rank), [1, 2, 3, 4, 5])
        guard case .taken(let won) = places[0] else { return XCTFail("rank 1 should be taken") }
        XCTAssertEqual(won.outcome, .win)
        XCTAssertEqual(won.points, 5)
        guard case .hidden(let hiddenRank) = places[1] else { return XCTFail("rank 2 should be hidden") }
        XCTAssertEqual(hiddenRank, 2)
        guard case .empty = places[2] else { return XCTFail("rank 3 should be empty") }
        guard case .taken(let lost) = places[3] else { return XCTFail("rank 4 should be taken") }
        XCTAssertEqual(lost.outcome, .loss)
        XCTAssertEqual(lost.points, 0)
    }

    // MARK: Cards

    func testCardTiers() {
        var card = ScrambleCard(name: "Saturday", players: [GolfPlayer(name: "Corey"), GolfPlayer(name: "Dan")], pars: Array(repeating: 4, count: 9))
        XCTAssertEqual(Hub.attention(card: card), .waiting)
        XCTAssertEqual(Hub.headline(card: card), "Not started · 2 players")

        card.record(.shot(by: card.players[0].id), on: 1)
        XCTAssertEqual(Hub.attention(card: card), .live)
        XCTAssertEqual(Hub.headline(card: card), "Playing hole 1")

        card.finish(hole: 1, tapIn: true)
        card.advance()
        XCTAssertEqual(Hub.headline(card: card), "Through 1 of 9 · \(ScrambleTally.toParText(-2))")

        for hole in 2...9 {
            card.record(.shot(by: card.players[1].id), on: hole)
            card.finish(hole: hole, tapIn: false)
        }
        XCTAssertEqual(Hub.attention(card: card), .done)
        XCTAssertTrue(Hub.headline(card: card).hasPrefix("Final · "))
    }
}
