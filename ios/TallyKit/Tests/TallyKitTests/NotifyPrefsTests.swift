import XCTest
@testable import TallyKit

/**
 The switches, from the app's side.

 The server has the same rule in `shared/notify-prefs.ts` and its own tests. This is here because
 the screen reads it too — a toggle draws from `isOn` and a summary line from `allows` — and a
 client that disagreed with the server would show somebody a control that says one thing while
 their phone does another, which is the hardest kind of bug to be told about.
 */
final class NotifyPrefsTests: XCTestCase {
    private let me = "player-me"
    private let kid = "player-kid"

    func testEverythingIsOnBeforeAnythingIsSet() {
        let prefs = NotifyPrefs.everything
        for kind in NotificationKind.allCases {
            XCTAssertTrue(prefs.isOn(kind))
            XCTAssertTrue(prefs.allows(kind, entry: me))
        }
        XCTAssertFalse(prefs.isMuted(entry: me))
    }

    func testADeviceSwitchAppliesToEveryEntry() {
        var prefs = NotifyPrefs.everything
        prefs.set(.picksDue, on: false)
        XCTAssertFalse(prefs.allows(.picksDue, entry: me))
        XCTAssertFalse(prefs.allows(.picksDue, entry: kid))
        XCTAssertTrue(prefs.allows(.segment, entry: me))
    }

    func testMutingAnEntryBeatsEverythingElse() {
        var prefs = NotifyPrefs.everything
        prefs.set(.weekDone, on: true, entry: kid)
        prefs.setMuted(true, entry: kid)
        XCTAssertFalse(prefs.allows(.weekDone, entry: kid))
        XCTAssertTrue(prefs.allows(.weekDone, entry: me))
    }

    func testAnEntryCanKeepAKindTheDeviceSwitchedOff() {
        var prefs = NotifyPrefs.everything
        prefs.set(.picksDue, on: false)
        prefs.set(.picksDue, on: true, entry: kid)
        XCTAssertFalse(prefs.allows(.picksDue, entry: me))
        XCTAssertTrue(prefs.allows(.picksDue, entry: kid))
    }

    /**
     Turning something back on removes the key rather than writing `true`.

     What is stored stays the set of *deliberate exceptions*, which is what makes "absent means on"
     hold: a kind added in a later release arrives switched on for everybody who never touched it,
     rather than off because an old client wrote an exhaustive object years ago.
     */
    func testTurningSomethingBackOnLeavesNothingBehind() {
        var prefs = NotifyPrefs.everything
        prefs.set(.segment, on: false)
        XCTAssertEqual(prefs.kinds, ["segment": false])
        prefs.set(.segment, on: true)
        XCTAssertNil(prefs.kinds)
    }

    /// An entry-level switch that agrees with the device is not an override. Storing it anyway
    /// would pin the entry in place, so a later change to the device default would skip it.
    func testAnEntryThatAgreesWithTheDeviceStopsOverriding() {
        var prefs = NotifyPrefs.everything
        prefs.set(.segment, on: true, entry: kid)
        XCTAssertNil(prefs.entries)

        prefs.set(.segment, on: false)
        prefs.set(.segment, on: true, entry: kid)
        XCTAssertEqual(prefs.entries?[kid]?.kinds, ["segment": true])

        // The device turns it back on: the entry's override now agrees, so it goes.
        prefs.set(.segment, on: true)
        prefs.set(.segment, on: true, entry: kid)
        XCTAssertNil(prefs.entries)
    }

    func testUnmutingAnEntryLeavesNoEmptyRowBehind() {
        var prefs = NotifyPrefs.everything
        prefs.setMuted(true, entry: kid)
        XCTAssertEqual(prefs.entries?[kid]?.muted, true)
        prefs.setMuted(false, entry: kid)
        XCTAssertNil(prefs.entries)
    }

    /// It crosses the wire as JSON, and the server reads it with a different parser.
    func testItSurvivesARoundTrip() throws {
        var prefs = NotifyPrefs.everything
        prefs.set(.picksDue, on: false)
        prefs.setMuted(true, entry: kid)
        prefs.set(.weekDone, on: true, entry: me)

        let data = try JSONEncoder().encode(prefs)
        let back = try JSONDecoder().decode(NotifyPrefs.self, from: data)
        XCTAssertEqual(back, prefs)
        XCTAssertFalse(back.allows(.picksDue, entry: me))
        XCTAssertFalse(back.allows(.weekDone, entry: kid))
    }

    /// A blob from a newer build naming a kind this one does not know must not mute anything here.
    func testAnUnknownKindIsIgnoredRatherThanObeyed() throws {
        let json = #"{"kinds":{"somethingNew":false}}"#
        let prefs = try JSONDecoder().decode(NotifyPrefs.self, from: Data(json.utf8))
        for kind in NotificationKind.allCases {
            XCTAssertTrue(prefs.isOn(kind))
        }
    }
}
