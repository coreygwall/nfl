import XCTest
@testable import TallyKit

/**
 What the home screen is handed.

 A widget is the least inspectable surface in the app: it renders for a fraction of a second, in a
 process nobody attaches to, from data written by a different process. So the shape of that data,
 and the rules that turn a board into it, are tested here rather than discovered on somebody's home
 screen in December.
 */
final class WidgetSnapshotTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_760_000_000)

    private func slot(_ rank: Int, _ team: String?, _ state: WeekActivity.State) -> WeekActivity.Slot {
        WeekActivity.Slot(rank: rank, team: team, state: state)
    }

    private func entry(
        id: String = "me",
        slots: [WeekActivity.Slot] = [],
        points: Int = 0,
        possible: Int = 0,
        place: Int? = nil,
        field: Int? = nil,
        nextKickoffEpoch: Int? = nil
    ) -> WidgetEntry {
        WidgetEntry(
            id: id,
            name: "Parker",
            slots: slots,
            points: points,
            possible: possible,
            place: place,
            field: field,
            nextKickoffEpoch: nextKickoffEpoch,
            weekTop: [],
            seasonPlace: nil,
            seasonPoints: nil,
            seasonField: nil,
            seasonTop: [],
            seasonStarted: false
        )
    }

    private func snapshot(entries: [WidgetEntry], updatedAt: Date? = nil) -> WidgetSnapshot {
        WidgetSnapshot(
            poolName: "High Five",
            poolSlug: "high-five",
            origin: URL(string: "https://playtally.app")!,
            week: 3,
            updatedAt: updatedAt ?? now,
            entries: entries,
            seasonStartsAt: 2
        )
    }

    // MARK: Choosing an entry

    func testAnUnknownEntryFallsBackToTheFirstRatherThanNothing() {
        // A widget pinned to an entry that has since been removed must not go blank on the home
        // screen — it shows the household's first entry, which is at least true.
        let shot = snapshot(entries: [entry(id: "a"), entry(id: "b")])
        XCTAssertEqual(shot.entry(id: "gone")?.id, "a")
        XCTAssertEqual(shot.entry(id: nil)?.id, "a")
        XCTAssertEqual(shot.entry(id: "b")?.id, "b")
    }

    // MARK: Staleness

    func testASnapshotGoesStaleAfterThreeHours() {
        let shot = snapshot(entries: [entry()])
        XCTAssertFalse(shot.isStale(now: now.addingTimeInterval(2 * 3600)))
        XCTAssertTrue(shot.isStale(now: now.addingTimeInterval(4 * 3600)))
    }

    // MARK: What is still to play for

    func testOutstandingCountsOnlyWhatHasNotSettled() {
        let week = entry(slots: [
            slot(1, "BUF", .won),
            slot(2, "KC", .lost),
            slot(3, "SF", .live),
            slot(4, "DAL", .waiting),
            slot(5, "NYJ", .tied),
        ])
        // Ranks 3 and 4 are worth 3 and 2.
        XCTAssertEqual(week.outstanding.games, 2)
        XCTAssertEqual(week.outstanding.points, 5)
        XCTAssertEqual(week.liveCount, 1)
        XCTAssertFalse(week.picksSettled)
    }

    func testAFullySettledWeekHasNothingOutstanding() {
        let week = entry(slots: [slot(1, "BUF", .won), slot(2, "KC", .lost)])
        XCTAssertTrue(week.picksSettled)
        XCTAssertEqual(week.outstanding.points, 0)
    }

    // MARK: The wire

    /// The snapshot crosses a process boundary, so it has to survive a round trip exactly — a
    /// dropped field here is a widget that renders wrong with nothing to say why.
    func testASnapshotSurvivesARoundTrip() throws {
        let original = snapshot(entries: [
            entry(
                slots: [slot(1, "BUF", .won), slot(2, nil, .waiting)],
                points: 5,
                possible: 4,
                place: 2,
                field: 12,
                nextKickoffEpoch: 1_760_003_600
            )
        ])
        let data = try JSONEncoder.tally.encode(original)
        let decoded = try JSONDecoder.tally.decode(WidgetSnapshot.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.entries.first?.nextKickoff, Date(timeIntervalSince1970: 1_760_003_600))
        // A hidden pick keeps its rank and loses its team, exactly as the board sends it.
        XCTAssertNil(decoded.entries.first?.slots.last?.team)
    }

    /**
     Writing the same week twice must not count as a change.

     Every write asks WidgetKit to redraw, and the app publishes whenever it goes to the
     background. Comparing on the timestamp too would mean a home screen redrawing every time
     somebody glanced at the app, all afternoon, for nothing.
     */
    func testTheTimestampAloneIsNotAChange() {
        let a = snapshot(entries: [entry(points: 5)])
        let b = snapshot(entries: [entry(points: 5)], updatedAt: now.addingTimeInterval(600))
        XCTAssertTrue(a.sameContent(as: b))

        let c = snapshot(entries: [entry(points: 8)], updatedAt: now.addingTimeInterval(600))
        XCTAssertFalse(a.sameContent(as: c))
    }

    // MARK: Turning a board row into five slots

    func testABoardRowBecomesFiveSlotsWithHiddenPicksHoldingTheirPlace() {
        let row = WeekRow(
            playerId: "other",
            name: "Sam",
            isMe: false,
            mine: nil,
            place: 1,
            points: 8,
            correct: 2,
            fives: 1,
            picksMade: 3,
            possible: 10,
            picks: [
                ScoredPick(gameId: "a", team: "BUF", rank: 1, points: 5, outcome: .win),
                ScoredPick(gameId: "b", team: "KC", rank: 2, points: 0, outcome: .loss),
                ScoredPick(gameId: "c", team: "SF", rank: 3, points: 0, outcome: .pending),
            ],
            hiddenRanks: [4]
        )
        let slots = WidgetRefresh.slotsFromBoardForTesting(row)
        XCTAssertEqual(slots.map(\.rank), [1, 2, 3, 4])
        XCTAssertEqual(slots.map(\.state), [.won, .lost, .live, .waiting])
        // Rank 5: nobody picked there. It is not a slot — "you have not shown me yet" and "you
        // left this one" are different facts and the row should not pretend otherwise.
        XCTAssertFalse(slots.contains { $0.rank == 5 })
        XCTAssertNil(slots.last?.team)
    }
}
