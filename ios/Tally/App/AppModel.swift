import Foundation
import Network
import Observation
import SwiftUI
import TallyKit
import UIKit

enum AppTab: Hashable {
    case picks, board, rules
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

    // MARK: Identity

    private(set) var session: SessionStore
    var player: Identity? { session.active }
    var people: [Identity] { session.people }

    // MARK: Data

    private(set) var boot: Loadable<BootstrapResponse> = .idle
    private(set) var bootUpdatedAt: Date = .distantPast
    private var tokenSeenAt: Date = .distantPast
    private(set) var online = true

    // MARK: Navigation

    var tab: AppTab = .picks
    var pickWeek: Int?
    var boardWeek: Int?
    var boardScope: BoardScope = .week
    var boardSort: BoardSort = .points
    var showAccount = false
    var showAdmin = false
    var showPools = false
    /// The welcome screen over a signed-in device — from a sign-in link or "I'm someone new".
    var showWelcome = false
    var welcomeStartsNew = false
    var pendingClaim: PendingClaim?
    var toasts: [Toast] = []
    /// The pick tray, when the picks screen wants one floating over the tab bar (its `useHideNav`).
    var tray: PickTrayState?

    // MARK: Commissioner

    private(set) var adminPin: String?
    private var adminPinKey: String { "admin.pin.\(pool.host)/\(pool.slug)" }

    /// The PIN is remembered per pool so the commissioner types it once per phone.
    func setAdminPin(_ pin: String?) {
        adminPin = pin
        if let pin { Keychain.shared.set(pin, forKey: adminPinKey) } else { Keychain.shared.remove(forKey: adminPinKey) }
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
        self.adminPin = Keychain.shared.string(forKey: "admin.pin.\(pool.host)/\(pool.slug)")
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.online = path.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "tally.network"))
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                await self?.refreshBootstrap()
            }
        }
        Task { await self.refreshBootstrap() }
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
        next.setActive(id)
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
        guard ref != pool else { return }
        catalog.open(ref)
        catalog.save()
        pool = ref
        let store = SessionStore.load(host: ref.host)
        session = store
        SessionBox.shared.store = store
        service = AppModel.makeService(pool: ref, session: { SessionBox.shared.store.authHeaders })
        adminPin = Keychain.shared.string(forKey: adminPinKey)
        boot = .idle
        pickWeek = nil
        boardWeek = nil
        tab = .picks
        Task { await self.refreshBootstrap() }
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
            tab = .rules
        case "admin":
            showAdmin = true
        default:
            tab = .picks
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
