import Foundation
import Network
import Observation
import SwiftUI
import TallyKit
import WidgetKit
import UIKit

enum AppTab: Hashable {
    /// Home is the app's, not the pool's: every pool and card on the phone, and which of them
    /// wants something. It is first, and it is deliberately *not* where a launch lands — `tab`
    /// starts on the pool, because a phone that was in a pool last night is still in it this
    /// morning. Pool is that pool's own page: what week it is, who still owes picks, who took last
    /// week. Rules is not a tab — it is a document you read once, so it opens over whatever you
    /// were looking at.
    case home, pool, picks, board, account
}

/**
 What the app is standing in: the pool, or one golf card.

 The home tab is the only global control, and this is what it switches. A pool and a card are
 different families of contest with different tabs (`docs/navigation.md`), so the root view swaps
 the whole shell on it rather than any tab trying to draw both. `.pool` is not "no card" — it is
 the pool this model already holds, which is why it carries no reference.
 */
enum ContestContext: Hashable {
    case pool
    case card(String)

    var cardId: String? {
        if case .card(let id) = self { return id }
        return nil
    }
}

/**
 Light, dark, or whatever the phone is doing.

 "Auto" is the user-facing default and is stored as the absence of a choice, so a phone that turns dark at
 sunset takes the app with it without anyone having picked anything.
 */
enum ThemeChoice: String, CaseIterable, Hashable {
    case system, light, dark

    var label: String {
        switch self {
        case .system: return "Auto"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var scheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

enum BoardScope: String, Hashable {
    case week, season
}

enum BoardSort: String, Hashable {
    case points, possible
}

struct Toast: Identifiable, Equatable {
    enum Kind { case info, success, error }
    let id = UUID()
    let text: String
    let kind: Kind
}

/// A sign-in link that arrived before the welcome screen was ready to act on it.
struct PendingClaim: Equatable {
    let playerId: String
    let code: String?
}

/**
 The one object every screen reads. It owns the current pool and the session for its host, the
 bootstrap the whole app hangs off, and the bits of navigation that cross tabs (which week, which
 board). It is the iOS counterpart of `AppShell.tsx` + `PlayerProvider` + `useBootstrap`.
 */
@MainActor
@Observable
final class AppModel {
    // MARK: Pool

    private(set) var catalog: PoolCatalog
    private(set) var pool: PoolRef
    private(set) var service: PoolService
    let passkeys: PasskeyService
    let push = PushService()
    let live = LiveActivityService()

    // MARK: Identity

    private(set) var session: SessionStore
    var player: Identity? { session.active }
    /// What this device has cached: the tokens, and which name is active. Not the roster — see
    /// `entries`, which is what every screen showing a list of names should read.
    var people: [Identity] { session.people }

    /**
     Everyone this account picks for, as the *server* last reported them.

     `people` is a device cache. It exists to hold the token and to remember which name is active,
     and it used to be the only thing the family was ever drawn from — so whenever the cache fell
     behind the account, the other entries simply were not in the app, with nothing on screen to
     say why. `reconcile(with:)` is a silent no-op in exactly the cases that cause it: a bootstrap
     that came back unauthenticated, a session keyed to a host this install has since moved off, an
     entry added on the phone in somebody else's pocket. The account owns its entries, so this asks
     the account, and the cache is only consulted before the first bootstrap has landed.

     The token comes from the cached account row, because a managed entry has none of its own — it
     rides on the account's. `switchTo` takes an entry into the cache the moment one is chosen.
     */
    var entries: [Identity] {
        guard let boot = boot.value, let account = boot.account, let mine = boot.myEntries, !mine.isEmpty else {
            return people
        }
        let token = people.first { $0.id == account.id }?.token ?? player?.token
        let all = mine.map { Identity(player: $0, token: token, accountId: account.id, managed: $0.id != account.id) }
        // The account first, then the names it picks for, however the roster happened to be ordered.
        return all.filter { $0.id == account.id } + all.filter { $0.id != account.id }
    }

    /// The server has answered and does not know this device. Everything it is showing is a local
    /// memory until somebody signs in again, which is worth saying out loud rather than quietly
    /// drawing one name where a family should be.
    var deviceUnrecognised: Bool { boot.value != nil && boot.value?.account == nil && player != nil }

    // MARK: Data

    private(set) var boot: Loadable<BootstrapResponse> = .idle
    private(set) var bootUpdatedAt: Date = .distantPast

    // MARK: Announcements
    //
    // One feed, held here rather than per screen, because more than one place reads it at once:
    // the badge on the megaphone, the peek it opens, and the full feed. Two copies would be two
    // different unread counts.

    // The feed's own behaviour — loading, liking, posting, what counts as read — lives in
    // `AnnouncementsModel.swift` next to the views that use it, so these are settable across the
    // module rather than `private(set)` like the rest of this block.

    var messageFeed: Loadable<MessagesResponse> = .idle
    var messages: [PoolMessage] = []
    /// The cursor for the next page, or nil once the feed has been walked to its end.
    var messagesCursor: String?
    /// The newest announcement this *device* has looked at. Per pool, and deliberately not per
    /// entry: a phone that picks for the whole family is one reader.
    var announcementsSeenId: String?
    /// What this install has asked to hear. Read from the server rather than kept locally: the
    /// switches belong to the token, and a phone that reinstalls should find its old answers
    /// rather than silently start from everything-on.
    var notifyPrefs: Loadable<NotifyPrefs> = .idle
    var savingPrefs = false
    var showNotificationSettings = false
    /// The megaphone's peek: the unread ones, at a medium detent, over whatever you were doing.
    var showAnnouncementsSheet = false
    /// The whole feed. A sheet rather than a fifth tab or a push, because it has to open from any
    /// tab and from the peek, and a sheet is the one presentation that works the same from both.
    var showAnnouncementsFeed = false
    /// The announcement the feed should scroll to and flash on opening — the web's `#message-<id>`.
    var announcementFocusId: String?
    private var tokenSeenAt: Date = .distantPast
    private(set) var online = true

    // MARK: Navigation

    var tab: AppTab = .pool
    var pickWeek: Int?
    var boardWeek: Int?
    var boardScope: BoardScope = .week
    var boardSort: BoardSort = .points
    var showRules = false
    var showCommissioner = false
    var showLeagueOffice = false
    var showPools = false
    /// The join sheet: a code from a group chat, or a link somebody sent.
    var showJoin = false
    /// The welcome screen over a signed-in device — from a sign-in link or "I'm someone new".
    var showWelcome = false
    var welcomeStartsNew = false
    var pendingClaim: PendingClaim?
    /// One unprompted passkey attempt per launch, so opening the app is the whole sign-in.
    var triedAutoPasskey = false
    var toasts: [Toast] = []
    /// The pick tray, when the picks screen wants one floating over the tab bar (its `useHideNav`).
    var tray: PickTrayState?

    // MARK: Offices

    /**
     What this account may open. It comes down with the bootstrap rather than from a PIN in the
     Keychain, which is the whole point of the change: a screen can ask *may I* instead of *do I
     happen to have the secret*, and a player never sees a control they cannot use.
     */
    var roles: Roles { boot.value?.grants ?? .none }
    var isCommissioner: Bool { roles.commissioner }
    var isLeagueAdmin: Bool { roles.platformAdmin }

    /**
     A PIN this phone saved back when the PIN *was* the commissioner.

     It is not a login any more, but it may be the only copy anyone still has — a Cloudflare secret
     cannot be read back out — so it is kept until it has been *spent* on a role claim rather than
     wiped on sight. The claim screen offers it; a successful claim is what deletes it.
     */
    private(set) var legacyPin: String?
    private var legacyPinKey: String { "admin.pin.\(pool.host)/\(pool.slug)" }

    private func loadLegacyPin() {
        legacyPin = Keychain.shared.string(forKey: legacyPinKey)
    }

    /// Called once the PIN has bought this account its offices, or once the server says it is wrong.
    func spendLegacyPin() {
        legacyPin = nil
        Keychain.shared.remove(forKey: legacyPinKey)
    }

    // MARK: Appearance

    private static let themeKey = "tally.theme"

    var theme: ThemeChoice = .system {
        didSet {
            guard theme != oldValue else { return }
            if theme == .system { UserDefaults.standard.removeObject(forKey: AppModel.themeKey) }
            else { UserDefaults.standard.set(theme.rawValue, forKey: AppModel.themeKey) }
        }
    }

    // MARK: Contests

    private static let contextKey = "tally.context"
    private static let golfKey = "tally.labs.golf"

    /// The pool, or a golf card. Persisted, so a phone put down on the ninth tee reopens on it.
    private(set) var context: ContestContext = .pool

    /**
     Golf cards, behind a switch in Account ▸ Settings ▸ Labs. Off by default: nothing in the pool
     changes until somebody turns it on, and turning it off puts the app back in the pool with the
     cards kept on disk for when it comes back. Nothing in `Features/Golf` is reachable while this
     is false — the menu does not list cards and the root view does not draw the golf shell.
     */
    var golfCards: Bool = false {
        didSet {
            guard golfCards != oldValue else { return }
            UserDefaults.standard.set(golfCards, forKey: AppModel.golfKey)
            if !golfCards { setContext(.pool) }
        }
    }

    private static let pagerKey = "tally.labs.pager"

    /**
     Labs: the pool's page wears a pager between pools.

     A trial of a second way to switch. Home is the switcher and stays so; this is for the person
     who lives on the Pool tab and wants the next pool one flick away. Off by default, and honest
     about what it is not: the page below reloads rather than sliding, because a pool is a session
     and a bootstrap, not a page.
     */
    var poolPager: Bool = false {
        didSet {
            guard poolPager != oldValue else { return }
            UserDefaults.standard.set(poolPager, forKey: AppModel.pagerKey)
        }
    }

    private func setContext(_ next: ContestContext) {
        guard next != context else { return }
        context = next
        switch next {
        case .pool: UserDefaults.standard.removeObject(forKey: AppModel.contextKey)
        case .card(let id): UserDefaults.standard.set("card:\(id)", forKey: AppModel.contextKey)
        }
    }

    private static func loadContext() -> ContestContext {
        guard let raw = UserDefaults.standard.string(forKey: contextKey), raw.hasPrefix("card:") else { return .pool }
        return .card(String(raw.dropFirst("card:".count)))
    }

    /// Stand in a card. The card's own model draws it; this only says which one.
    func switchToCard(_ id: String) {
        guard golfCards else { return }
        setContext(.card(id))
    }

    /// Back to the pool this model holds, on the tab it was on.
    func leaveCard() {
        setContext(.pool)
    }

    private let monitor = NWPathMonitor()
    private var refreshTask: Task<Void, Never>?

    init() {
        var catalog = PoolCatalog.load()
        if catalog.pools.isEmpty { catalog.open(PoolRef.default, name: PoolTypes.highFive.name) }
        // Development: `-tally.devPoolURL http://localhost:5173/p/high-five` as a launch argument
        // points the app at a local Worker (see ios/README.md).
        if let raw = UserDefaults.standard.string(forKey: "tally.devPoolURL"), let url = URL(string: raw), let link = PoolRef.parse(url) {
            catalog.open(link.pool)
        }
        self.catalog = catalog
        let pool = catalog.current?.ref ?? PoolRef.default
        self.pool = pool
        let session = SessionStore.load(host: pool.host)
        self.session = session
        self.passkeys = PasskeyService(anchor: AppModel.presentationAnchor)
        self.service = AppModel.makeService(pool: pool, session: { SessionBox.shared.store.authHeaders })
        SessionBox.shared.store = session
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.online = path.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "tally.network"))
        theme = UserDefaults.standard.string(forKey: AppModel.themeKey).flatMap(ThemeChoice.init(rawValue:)) ?? .system
        golfCards = UserDefaults.standard.bool(forKey: AppModel.golfKey)
        poolPager = UserDefaults.standard.bool(forKey: AppModel.pagerKey)
        context = golfCards ? AppModel.loadContext() : .pool
        loadLegacyPin()
        announcementsSeenId = AnnouncementSeen.load(pool: pool)
        connectPush()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                await self?.refreshBootstrap()
            }
        }
        Task { await self.refreshBootstrap() }
    }

    // MARK: Notifications

    /**
     Hand the push service a way to reach whichever pool is open. Read at call time rather than
     captured, so switching pools moves the phone's notifications with it.
     */
    private func connectPush() {
        AppDelegate.push = push
        push.connect(
            register: { [weak self] token, environment in
                guard let self else { return }
                let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
                try? await self.service.registerPushToken(token, environment: environment, appVersion: version)
            },
            unregister: { [weak self] token in
                try? await self?.service.unregisterPushToken(token)
            }
        )
        // Whenever ActivityKit issues a token for a running lock screen, the Worker hears about it.
        // Without this the activity only ever updates while the app is open, which is the one time
        // nobody needs a lock screen.
        live.onToken = { [weak self] entryId, week, token in
            guard let self else { return }
            Task {
                try? await self.service.registerActivityToken(
                    token,
                    entryId: entryId,
                    week: week,
                    environment: PushEnvironment.current
                )
            }
        }
        Task {
            await push.refreshPermission()
            live.adoptExisting()
        }
    }

    /**
     Ask for notifications, once, at a moment when the answer is obviously yes. Does nothing if
     they have already been asked — iOS only ever shows the prompt once, and a second call after a
     refusal is silently a no.
     */
    func offerNotifications() async {
        guard push.permission == .notAsked else { return }
        if await push.requestPermission() {
            toast("You'll hear when your games finish.")
        }
    }

    // MARK: Notification preferences

    func loadNotifyPrefs() async {
        guard let token = push.token else {
            // No token means this phone has never registered — there is nothing on the server to
            // read, and everything is on by definition.
            notifyPrefs = .loaded(.everything)
            return
        }
        if notifyPrefs.value == nil { notifyPrefs = .loading }
        do {
            notifyPrefs = .loaded(try await service.notificationPrefs(token: token))
        } catch {
            if notifyPrefs.value == nil { notifyPrefs = .failed(error.asAPIError) }
        }
    }

    func setNotifyKind(_ kind: NotificationKind, on: Bool) async {
        guard var prefs = notifyPrefs.value else { return }
        prefs.set(kind, on: on)
        await save(prefs)
    }

    func setNotifyEntry(_ entryId: String, on: Bool) async {
        guard var prefs = notifyPrefs.value else { return }
        prefs.setMuted(!on, entry: entryId)
        await save(prefs)
    }

    /**
     Move the switch, then tell the server, and put it back if the server disagrees.

     The control answers immediately because a toggle that waits on a round trip feels broken, and
     rolls back on failure because a switch that shows "off" while the server still says "on" is
     the one outcome nobody could diagnose from the outside.
     */
    private func save(_ prefs: NotifyPrefs) async {
        guard let token = push.token else { return }
        let previous = notifyPrefs.value
        notifyPrefs = .loaded(prefs)
        savingPrefs = true
        defer { savingPrefs = false }
        do {
            notifyPrefs = .loaded(try await service.setNotificationPrefs(token: token, prefs: prefs))
        } catch {
            if let previous { notifyPrefs = .loaded(previous) }
            toast(error.asAPIError.message, kind: .error)
        }
    }

    /// A tapped notification carried the page it is about, so there is nothing to look up.
    func consumeNotificationTap() {
        guard let path = push.pendingPath else { return }
        push.pendingPath = nil
        if let url = URL(string: "https://\(pool.host)\(path)") { open(url) }
    }

    /**
     Keep the lock screen in step with the week the app just loaded. Safe to call on every refresh:
     the service starts, updates or ends as the state calls for, and does nothing at all when Live
     Activities are switched off.
     */
    func syncLiveActivity(week: Int, response: WeekResponse) {
        guard let entry = player else { return }
        let state = WeekActivityAttributes.ContentState.from(
            picks: response.myPicks,
            games: response.games,
            now: ServerClock.shared.now,
            place: response.standing?.place,
            field: response.standing?.field
        )
        let firstKickoff = response.games.map(\.kickoffAt).min()
        // The name only earns its place on the lock screen when there is more than one of them to
        // tell apart; on a single entry it is the reader's own name, which they know.
        let label = entries.count > 1 ? entry.name : ""
        Task {
            await live.sync(
                week: week,
                entryId: entry.id,
                entryName: label,
                poolName: poolName,
                state: state,
                firstKickoff: firstKickoff
            )
        }
    }

    /**
     Leave the home screen everything it needs.

     A widget process wakes for a fraction of a second with no session and no promise of a network,
     so the app does the work while it is already awake and leaves the answer in the shared
     container. The widget refreshes on its own too, but this is what makes one correct the instant
     it is added, and on a phone that has been in a pocket since Thursday.

     It also parks a read-only credential in the shared Keychain item, which is the only way the
     widget's own refresh can ask the server anything.
     */
    func publishWidgetSnapshot() {
        guard let boot = boot.value, let me = player else { return }
        WidgetSessionStore.write(
            WidgetSession(
                origin: pool.origin,
                slug: pool.slug,
                token: session.authHeaders.token ?? "",
                entryId: session.authHeaders.entryId
            )
        )
        let service = self.service
        let ref = pool
        let name = poolName
        // The same list the app draws, so the home screen cannot show fewer names than the app.
        let roster = entries.isEmpty ? [me] : entries
        Task {
            guard let snapshot = try? await WidgetRefresh.snapshot(
                service: service,
                pool: ref,
                poolName: name,
                entries: roster,
                bootstrap: boot
            ) else { return }
            if WidgetStore.write(snapshot) { WidgetCenter.shared.reloadAllTimelines() }
        }
    }

    /// Signing out takes the home screen with it: a widget left showing somebody else's week on a
    /// phone they handed back is worse than a widget showing nothing.
    func clearWidgetSnapshot() {
        WidgetStore.clear()
        WidgetSessionStore.clear()
        WidgetCenter.shared.reloadAllTimelines()
    }

    private static func makeService(pool: PoolRef, session: @escaping @Sendable () -> AuthHeaders) -> PoolService {
        PoolService(client: APIClient(pool: pool, auth: session))
    }

    static func presentationAnchor() -> ASPresentationAnchorType {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first ?? UIWindow()
    }

    // MARK: Bootstrap

    func refreshBootstrap() async {
        if boot.value == nil { boot = .loading }
        do {
            let fresh = try await service.bootstrap()
            boot = .loaded(fresh)
            bootUpdatedAt = Date()
            catalog.open(pool, name: fresh.poolName)
            catalog.save()
            reconcile(with: fresh)
        } catch {
            let err = error.asAPIError
            if boot.value == nil { boot = .failed(err) }
            if err.code == "ENTRY_FORBIDDEN", let p = player, p.isManagedEntry {
                // The entry was removed from the account: fall back rather than sticking on an error.
                forget(p.id)
                toast("\(p.name)'s entry isn't on this account any more.", kind: .error)
                await refreshBootstrap()
            }
        }
    }

    /// What `AppShell.tsx` does after every bootstrap: keep this device's picture of its account true.
    private func reconcile(with fresh: BootstrapResponse) {
        if let account = fresh.account, let entries = fresh.myEntries, fresh.me != nil {
            var next = session
            next.syncAccountEntries(accountId: account.id, entries: entries, token: player?.token)
            if next != session { commit(next) }
        }
        // A bootstrap that finished *before* this device adopted its token still says "me: null".
        // Only a fresher one means the token was really revoked.
        if let p = player, p.token != nil, fresh.me == nil, bootUpdatedAt > tokenSeenAt {
            forget(p.id)
            toast("\(p.name) was signed out on this device. Sign back in to keep picking.", kind: .error)
        }
    }

    // MARK: Session

    private func commit(_ next: SessionStore) {
        session = next
        SessionBox.shared.store = next
        next.persist(host: pool.host)
    }

    /// Adds or refreshes an identity and makes it the active one.
    func setPlayer(_ identity: Identity) {
        var next = session
        next.save(identity)
        commit(next)
        tokenSeenAt = Date()
        touchSession()
        Task { await self.refreshBootstrap() }
    }

    func switchTo(_ id: String) {
        var next = session
        if next.people.contains(where: { $0.id == id }) {
            next.setActive(id)
        } else if let adopted = entries.first(where: { $0.id == id }) {
            // Offered from the account rather than from this device's cache. Take it in — with the
            // account's token, which is the one a managed entry picks on — so the very next request
            // can be made as them rather than silently staying on the old name.
            next.save(adopted)
        } else {
            return
        }
        commit(next)
        touchSession()
        Task { await self.refreshBootstrap() }
    }

    func forget(_ id: String) {
        var next = session
        next.forget(id)
        commit(next)
        touchSession()
    }

    func signOut() {
        commit(.empty)
        // The home screen goes with it. A widget still showing somebody's week on a phone they
        // just handed over is worse than one showing nothing.
        clearWidgetSnapshot()
        Task { await live.endAll() }
        Task { _ = try? await self.service.endSession() }
        Task { await self.refreshBootstrap() }
    }

    /// Best effort, like the web: the header still rules, this just keeps the server's cookie in step.
    private func touchSession() {
        guard let token = player?.token else { return }
        Task { _ = try? await self.service.touchSession(token: token) }
    }

    // MARK: Pools

    func switchPool(_ ref: PoolRef) {
        // Choosing a pool from inside a card is a switch even when it is the pool already held.
        setContext(.pool)
        guard ref != pool else { return }
        catalog.open(ref)
        catalog.save()
        pool = ref
        let store = SessionStore.load(host: ref.host)
        session = store
        SessionBox.shared.store = store
        service = AppModel.makeService(pool: ref, session: { SessionBox.shared.store.authHeaders })
        loadLegacyPin()
        boot = .idle
        pickWeek = nil
        boardWeek = nil
        messageFeed = .idle
        messages = []
        messagesCursor = nil
        announcementsSeenId = AnnouncementSeen.load(pool: ref)
        // A feed left open over a pool switch would refill itself with the new pool's posts while
        // still scrolled to the old one's.
        showAnnouncementsSheet = false
        showAnnouncementsFeed = false
        announcementFocusId = nil
        // The tab stays put: switching from the board lands on the other pool's board. A switch
        // is a change of *where*, and the frame should not also decide *what* you were doing.
        Task { await self.refreshBootstrap() }
    }

    /**
     Turns a join code into a pool and stands in it.

     A code names a *pool*, not a host, so the app asks the hosts it can reach — the one it is
     standing in, the default, then every other pool on the phone — until one claims it. A 404 is
     an *answer*: that host does not have it, and the next one might. What matters is telling the
     two endings apart at the finish: "no pool has that code" is only true if somebody actually
     said so, so a walk where nothing answered says it could not reach Tally instead of blaming
     a code that may be perfectly good.

     Joining is only the *finding*. The pool it lands on decides who you are the usual way: a
     device with no session there gets the welcome screen, exactly as a tapped link does.
     */
    func joinByCode(_ typed: String) async -> String? {
        let code = PoolCode.normalize(typed)
        guard PoolCode.isShaped(code) else { return "That doesn't look like a join code." }
        var seen: Set<String> = []
        var origins: [URL] = []
        for origin in [pool.origin, PoolRef.default.origin] + catalog.pools.map(\.ref.origin) {
            if seen.insert(origin.absoluteString).inserted { origins.append(origin) }
        }
        var reachedSomeone = false
        for origin in origins {
            // No session: the lookup is the one route a stranger is meant to call, and the slug is
            // what it answers *with*, so there is nothing to put in either yet.
            let probe = PoolService(client: APIClient(pool: PoolRef(origin: origin, slug: ""), auth: { AuthHeaders() }))
            do {
                let found = try await probe.lookupJoinCode(code).pool
                let ref = PoolRef(origin: origin, slug: found.slug)
                catalog.open(ref, name: found.name, poolType: found.type)
                catalog.save()
                switchPool(ref)
                tab = .pool
                showJoin = false
                Haptics.lockedIn()
                toast("You're in \(found.name).", kind: .success)
                return nil
            } catch {
                let err = error.asAPIError
                // This host does not have it; the next one might.
                if err.code == "NO_SUCH_POOL" || err.status == 404 { reachedSomeone = true; continue }
                if err.code == "BAD_CODE" { return "That doesn't look like a join code." }
                if err.status == 429 { return "That's a lot of tries. Give it a few minutes." }
            }
        }
        return reachedSomeone
            ? "No pool has that code. Check it with whoever invited you."
            : "Couldn't reach Tally. Check your connection and try again."
    }

    func removePool(_ id: String) {
        catalog.remove(id)
        if catalog.pools.isEmpty { catalog.open(PoolRef.default, name: PoolTypes.highFive.name) }
        catalog.save()
        if let current = catalog.current?.ref, current != pool { switchPool(current) }
    }

    // MARK: Links

    /// A pool link from anywhere — iMessage, Safari, a QR code. `worker/apple.ts` routes them here.
    func open(_ url: URL) {
        guard let link = PoolRef.parse(url) else { return }
        let query = link.query
        setContext(.pool)
        if link.pool != pool { switchPool(link.pool) }
        let parts = link.path.split(separator: "/").map(String.init)
        switch parts.first ?? "" {
        case "welcome":
            if let claim = query["claim"] {
                pendingClaim = PendingClaim(playerId: claim, code: query["code"].map(Codes.normalize))
            }
            welcomeStartsNew = query["new"] != nil
            showWelcome = true
        case "week":
            if parts.count > 1, let w = Int(parts[1]), WeekLogic.validWeek(w) { pickWeek = w }
            tab = .picks
        case "board":
            if parts.count > 1, parts[1] == "season" {
                boardScope = .season
            } else if parts.count > 2, parts[1] == "week", let w = Int(parts[2]), WeekLogic.validWeek(w) {
                boardScope = .week
                boardWeek = w
            }
            if query["sort"] == "possible" { boardSort = .possible }
            tab = .board
        case "rules":
            showRules = true
        case "admin", "commissioner":
            showCommissioner = true
        case "league":
            showLeagueOffice = true
        case "home", "":
            tab = .pool
        default:
            // A path this build does not know — an older link, or a newer one. The pool's page is
            // the honest landing for it: it says which pool you are in and what it wants, which is
            // what somebody following an unfamiliar link needs. The web's catch-all route goes
            // there too.
            tab = .pool
        }
    }

    var shareURL: URL { pool.webURL }

    // MARK: Toasts

    func toast(_ text: String, kind: Toast.Kind = .info) {
        let t = Toast(text: text, kind: kind)
        toasts.append(t)
        Task {
            try? await Task.sleep(for: .seconds(3.5))
            self.toasts.removeAll { $0.id == t.id }
        }
    }

    // MARK: Derived

    var poolName: String { boot.value?.poolName ?? catalog.current?.name ?? PoolTypes.highFive.name }
    var poolType: PoolTypeContent { PoolTypes.byName(catalog.current?.poolType ?? "") ?? PoolTypes.highFive }
    var sport: any Sport { NFL.shared }
    var currentWeek: Int { boot.value?.currentWeek ?? 1 }
    var maxWeek: Int { boot.value?.maxWeek ?? WeekLogic.weeks }
    /// First week that counts towards the season race; earlier ones stand on their own.
    var seasonStartsAt: Int { boot.value?.seasonStartsAt ?? 1 }
    var activePickWeek: Int { pickWeek ?? currentWeek }
    var activeBoardWeek: Int { boardWeek ?? boot.value?.boardWeek ?? 1 }
    var now: Date { ServerClock.shared.now }
}

typealias ASPresentationAnchorType = UIWindow

/// The API client reads identity headers per request off the main actor; this hands it a copy.
final class SessionBox: @unchecked Sendable {
    static let shared = SessionBox()
    private let lock = NSLock()
    private var _store: SessionStore = .empty
    var store: SessionStore {
        get { lock.lock(); defer { lock.unlock() }; return _store }
        set { lock.lock(); _store = newValue; lock.unlock() }
    }
}
