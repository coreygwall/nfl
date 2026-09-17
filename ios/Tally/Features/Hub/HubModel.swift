import Foundation
import Observation
import TallyKit

/**
 Every pool on the phone, as the app's home draws it.

 Its own object rather than a property on `AppModel`, for the same reason the golf cards are: that
 object is *one* pool — its session, its bootstrap, its week — and the home tab is about all of
 them at once. Each pool answers for itself, with its own session out of the Keychain and its own
 requests, the way the widgets answer for the one they show. What comes back is the widgets'
 snapshot, built by the widgets' builder, so the tab and the home screen cannot disagree about
 whose picks are in.

 The roster in each answer is the *server's* — `myEntries` — never this device's cache of names.
 The cache is how a family was drawn as one person once, and a card that says "your picks are in"
 about the one name it happens to remember would repeat it.
 */
@MainActor
@Observable
final class HubModel {
    /// What each pool says for itself, by pool id. Absent until first asked; `.loading` while a
    /// first answer is on its way; afterwards the last answer stays on screen through a refresh.
    private(set) var pools: [String: Loadable<HubPool>] = [:]
    private var refreshedAt: Date = .distantPast
    private var refreshing = false

    /// How many pools want something right now: the number on the tab.
    var needsYou: Int {
        pools.values.compactMap(\.value).filter { Hub.attention(pool: $0) == .needsYou }.count
    }

    func status(_ id: String) -> Loadable<HubPool> { pools[id] ?? .idle }

    /**
     Ask every pool again.

     Throttled, because the tab is opened casually and each pool is four requests; forced from the
     one moment that has to be current — the app coming back to the foreground, which is also
     what puts the badge on the tab at launch. One pool after another rather than all at once:
     there are two or three of these at most, each on its own host with its own session.
     */
    func refresh(model: AppModel, force: Bool = false) async {
        guard !refreshing, force || Date().timeIntervalSince(refreshedAt) > 60 else { return }
        refreshing = true
        defer { refreshing = false }
        refreshedAt = Date()
        for membership in model.catalog.pools {
            if pools[membership.id]?.value == nil { pools[membership.id] = .loading }
            pools[membership.id] = await load(membership, model: model)
        }
        let known = Set(model.catalog.pools.map(\.id))
        pools = pools.filter { known.contains($0.key) }
    }

    private func load(_ membership: PoolMembership, model: AppModel) async -> Loadable<HubPool> {
        let ref = membership.ref
        let service: PoolService
        let entries: [Identity]
        let boot: BootstrapResponse?
        if ref == model.pool {
            service = model.service
            boot = model.boot.value
            // Before the first bootstrap lands `entries` is the device's cache; an empty roster
            // makes the builder read `myEntries` off the bootstrap it fetches instead.
            entries = boot == nil ? [] : model.entries
        } else {
            let session = SessionStore.load(host: ref.host)
            guard !session.people.isEmpty else {
                return .failed(APIError(status: 0, code: "NO_SESSION", message: "Not signed in to this pool on this phone."))
            }
            service = PoolService(client: APIClient(pool: ref, auth: { session.authHeaders }))
            entries = []
            boot = nil
        }
        do {
            let fresh: BootstrapResponse
            if let boot {
                fresh = boot
            } else {
                fresh = try await service.bootstrap()
            }
            let snapshot = try await WidgetRefresh.snapshot(
                service: service,
                pool: ref,
                poolName: fresh.poolName,
                entries: entries,
                bootstrap: fresh
            )
            let week = fresh.weeks.first { $0.week == fresh.currentWeek }
            return .loaded(HubPool(snapshot: snapshot, week: week))
        } catch {
            return .failed(error.asAPIError)
        }
    }
}
