import XCTest
@testable import TallyKit

/// Deciding when the phone should buzz. Getting this wrong is worse than not having it: a
/// celebration that repeats, or fires for something that did not happen, is an app people mute.
final class MilestoneTests: XCTestCase {
    private func watch(
        outcomes: [String: String] = [:],
        points: Int = 0,
        place: Int = 1,
        finished: Bool = false,
        field: Int = 4,
        sharedFirst: Bool = false
    ) -> WeekWatch {
        WeekWatch(week: 5, outcomes: outcomes, points: points, place: place, finished: finished, field: field, sharedFirst: sharedFirst)
    }

    private let teams = ["a": "BUF", "b": "KC", "c": "NE"]
    /// Rank 1 is worth 5, rank 2 is worth 4, rank 3 is worth 3.
    private let ranks = ["a": 1, "b": 2, "c": 3]

    func testAFirstLookSaysNothing() {
        // Opening the app on a Sunday evening should set a baseline, not replay the afternoon.
        let now = watch(outcomes: ["a": "win", "b": "loss"], points: 5)
        XCTAssertEqual(now.milestones(since: nil, teamsByGame: teams), [])
    }

    func testAPickComingInIsNews() {
        let before = watch(outcomes: ["a": "pending", "b": "pending"])
        let after = watch(outcomes: ["a": "win", "b": "pending"], points: 5)
        XCTAssertEqual(
            after.milestones(since: before, teamsByGame: teams, ranksByGame: ranks),
            [.pickWon(team: "BUF", points: 5)]
        )
    }

    func testAPickGoingDownIsToo() {
        let before = watch(outcomes: ["b": "live"])
        let after = watch(outcomes: ["b": "loss"])
        XCTAssertEqual(after.milestones(since: before, teamsByGame: teams), [.pickLost(team: "KC")])
    }

    func testAGameStartingIsNotNews() {
        let before = watch(outcomes: ["a": "pending"])
        let after = watch(outcomes: ["a": "live"])
        XCTAssertEqual(after.milestones(since: before, teamsByGame: teams), [])
    }

    func testATieIsNotNews() {
        // No points, but nothing went wrong either. There is nothing to say.
        let before = watch(outcomes: ["a": "live"])
        let after = watch(outcomes: ["a": "tie"])
        XCTAssertEqual(after.milestones(since: before, teamsByGame: teams), [])
    }

    func testAResultAlreadySeenIsNotRepeated() {
        let seen = watch(outcomes: ["a": "win"], points: 5)
        XCTAssertEqual(seen.milestones(since: seen, teamsByGame: teams), [])
    }

    func testSeveralLandingAtOnceComeBackMostConfidentFirst() {
        let before = watch(outcomes: ["a": "pending", "b": "pending", "c": "pending"])
        let after = watch(outcomes: ["a": "win", "b": "loss", "c": "win"], points: 8)
        // Each win reports what that pick was worth — 5 for the rank 1, 3 for the rank 3 — rather
        // than the eight the reload added between them.
        XCTAssertEqual(
            after.milestones(since: before, teamsByGame: teams, ranksByGame: ranks),
            [.pickWon(team: "BUF", points: 5), .pickLost(team: "KC"), .pickWon(team: "NE", points: 3)]
        )
    }

    func testWinningTheWeekIsCelebrated() {
        let before = watch(outcomes: ["a": "win"], points: 5, place: 1, finished: false)
        let after = watch(outcomes: ["a": "win"], points: 5, place: 1, finished: true)
        let found = after.milestones(since: before, teamsByGame: teams)
        XCTAssertEqual(found, [.wonWeek(week: 5, points: 5, shared: false)])
        XCTAssertTrue(found[0].isCelebration)
    }

    func testASharedWinSaysSo() {
        let before = watch(points: 5, place: 1, finished: false)
        let after = watch(points: 5, place: 1, finished: true, sharedFirst: true)
        XCTAssertEqual(after.milestones(since: before), [.wonWeek(week: 5, points: 5, shared: true)])
    }

    func testFinishingAnywhereElseIsMarkedButNotCelebrated() {
        let before = watch(points: 7, place: 3, finished: false)
        let after = watch(points: 7, place: 3, finished: true)
        let found = after.milestones(since: before)
        XCTAssertEqual(found, [.finishedWeek(week: 5, place: 3, points: 7)])
        XCTAssertFalse(found[0].isCelebration)
    }

    func testTheWeekEndingIsReportedOnce() {
        let done = watch(points: 5, place: 1, finished: true)
        XCTAssertEqual(done.milestones(since: done), [])
    }

    func testTheLastResultAndTheWeekEndingArriveTogether() {
        // The final whistle usually settles a pick and the week in the same reload.
        let before = watch(outcomes: ["a": "live"], points: 0, place: 2, finished: false)
        let after = watch(outcomes: ["a": "win"], points: 5, place: 1, finished: true)
        XCTAssertEqual(
            after.milestones(since: before, teamsByGame: teams, ranksByGame: ranks),
            [.pickWon(team: "BUF", points: 5), .wonWeek(week: 5, points: 5, shared: false)]
        )
    }

    func testADifferentWeekIsNotComparedAgainstThisOne() {
        let other = WeekWatch(week: 4, outcomes: ["a": "pending"], points: 0, place: 1, finished: false, field: 4)
        let now = watch(outcomes: ["a": "win"], points: 5)
        XCTAssertEqual(now.milestones(since: other, teamsByGame: teams, ranksByGame: ranks), [])
    }
}

final class CelebrationLogTests: XCTestCase {
    func testAMomentIsClaimedOnce() {
        var log = CelebrationLog()
        XCTAssertTrue(log.claim("p1:week-5"))
        XCTAssertFalse(log.claim("p1:week-5"))
        XCTAssertTrue(log.has("p1:week-5"))
    }

    func testDifferentPeopleCelebrateSeparately() {
        var log = CelebrationLog()
        XCTAssertTrue(log.claim(CelebrationLog.key(playerId: "p1", "week-5")))
        XCTAssertTrue(log.claim(CelebrationLog.key(playerId: "p2", "week-5")))
    }

    func testItSurvivesARoundTripToDisk() throws {
        var log = CelebrationLog()
        _ = log.claim("p1:week-5")
        let back = try JSONDecoder().decode(CelebrationLog.self, from: JSONEncoder().encode(log))
        XCTAssertTrue(back.has("p1:week-5"))
    }
}

final class MilestoneStoreTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "milestone-tests-\(UUID().uuidString)")
    }

    func testAWeekIsRememberedPerEntry() {
        let mine = WeekWatch(week: 5, outcomes: ["a": "win"], points: 5, place: 1, finished: false, field: 4)
        MilestoneStore.record(mine, playerId: "p1", defaults: defaults)
        XCTAssertEqual(MilestoneStore.lastSeen(playerId: "p1", week: 5, defaults: defaults), mine)
        // Someone else's entry on the same phone has its own history.
        XCTAssertNil(MilestoneStore.lastSeen(playerId: "p2", week: 5, defaults: defaults))
        XCTAssertNil(MilestoneStore.lastSeen(playerId: "p1", week: 6, defaults: defaults))
    }

    func testACelebrationIsClaimedOnceAcrossLaunches() {
        let key = CelebrationLog.key(playerId: "p1", "week-5")
        XCTAssertTrue(MilestoneStore.claimCelebration(key, defaults: defaults))
        // A second call reads the log back off disk, which is what a relaunch does.
        XCTAssertFalse(MilestoneStore.claimCelebration(key, defaults: defaults))
    }
}

final class SeasonPlaceTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "season-place-tests-\(UUID().uuidString)")
    }

    func testAFirstLookOnlySetsTheBaseline() {
        XCTAssertFalse(MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults))
        XCTAssertEqual(MilestoneStore.lastSeasonPlace(playerId: "p1", defaults: defaults), 1)
    }

    func testClimbingToTheTopIsTheNews() {
        _ = MilestoneStore.noteSeasonPlace(3, playerId: "p1", defaults: defaults)
        XCTAssertTrue(MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults))
    }

    func testStayingOnTopIsNot() {
        _ = MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults)
        XCTAssertFalse(MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults))
    }

    func testSlippingIsNotCelebrated() {
        _ = MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults)
        XCTAssertFalse(MilestoneStore.noteSeasonPlace(2, playerId: "p1", defaults: defaults))
    }

    func testRetakingTheLeadIsNewsAgain() {
        _ = MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults)
        _ = MilestoneStore.noteSeasonPlace(2, playerId: "p1", defaults: defaults)
        XCTAssertTrue(MilestoneStore.noteSeasonPlace(1, playerId: "p1", defaults: defaults))
    }
}
