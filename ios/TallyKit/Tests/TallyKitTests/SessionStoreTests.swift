import XCTest
@testable import TallyKit

/**
 The device's half of an account.

 The store holds the token and remembers which name is picking; the *roster* belongs to the server,
 and the app reads it from the bootstrap (`AppModel.entries`). These are the two moves that join
 the two: refreshing what the account owns, and taking in an entry the account offered that this
 device had never heard of — which is what happens the first time somebody taps a name that was
 added on another phone.
 */
final class SessionStoreTests: XCTestCase {
    private let account = Player(id: "acct", name: "Corey")
    private let declan = Player(id: "declan", name: "Declan")
    private let parker = Player(id: "parker", name: "Parker")

    private func signedIn() -> SessionStore {
        var store = SessionStore.empty
        store.save(Identity(player: account, token: "tok", accountId: account.id))
        return store
    }

    func testSyncingBringsInEveryEntryTheAccountOwns() {
        var store = signedIn()
        store.syncAccountEntries(accountId: account.id, entries: [account, declan, parker], token: "tok")

        XCTAssertEqual(Set(store.people.map(\.id)), ["acct", "declan", "parker"])
        // A managed entry has no token of its own; it picks on the account's.
        XCTAssertEqual(store.people.first { $0.id == "declan" }?.token, "tok")
        XCTAssertTrue(store.people.first { $0.id == "declan" }?.isManagedEntry ?? false)
        XCTAssertFalse(store.people.first { $0.id == "acct" }?.isManagedEntry ?? true)
        // Syncing is a refresh, not a switch: whoever was picking still is.
        XCTAssertEqual(store.activeId, "acct")
    }

    func testSyncingDropsAnEntryTheAccountNoLongerOwns() {
        var store = signedIn()
        store.syncAccountEntries(accountId: account.id, entries: [account, declan], token: "tok")
        store.setActive("declan")
        store.syncAccountEntries(accountId: account.id, entries: [account], token: "tok")

        XCTAssertEqual(store.people.map(\.id), ["acct"])
        // The name that was picking is gone, so the store falls back rather than pointing at a
        // ghost — `active` would otherwise answer with somebody the server has never heard of.
        XCTAssertEqual(store.activeId, "acct")
        XCTAssertEqual(store.active?.id, "acct")
    }

    /**
     The case the app hit in the wild: the account owns three names, this phone had cached one, and
     the picker offered all three because it reads the account rather than the cache. Tapping one
     has to take it in, with the account's token, or the tap changes the highlight and nothing else.
     */
    func testAdoptingAnEntryThisDeviceHadNeverSeen() {
        var store = signedIn()
        let offered = Identity(player: parker, token: "tok", accountId: account.id, managed: true)

        XCTAssertFalse(store.people.contains { $0.id == parker.id })
        store.save(offered)

        XCTAssertEqual(store.activeId, "parker")
        XCTAssertEqual(store.active?.name, "Parker")
        XCTAssertEqual(store.authHeaders.token, "tok")
        // Picking as a managed entry is the account's token plus the entry it is standing in for.
        XCTAssertEqual(store.authHeaders.entryId, "parker")
        // The account is still there to switch back to.
        XCTAssertEqual(Set(store.people.map(\.id)), ["acct", "parker"])
    }

    func testTheAccountItselfNeverSendsAnEntryHeader() {
        var store = signedIn()
        store.syncAccountEntries(accountId: account.id, entries: [account, declan], token: "tok")
        store.setActive("acct")

        XCTAssertEqual(store.authHeaders.token, "tok")
        XCTAssertNil(store.authHeaders.entryId)
    }
}
