import SwiftUI
import TallyKit

/**
 The pick flow, ported from `PickFlow.tsx`: select five, rank them, lock them in, then a review
 that scores itself as games finish. State lives here; the steps are views underneath. The draft
 is saved to the phone on every change and seeded from the saved picks the first time the week
 loads, so nothing typed is ever lost to a phone call.
 */
struct PickFlowView: View {
    @Environment(AppModel.self) private var model
    let week: Int

    enum Step { case select, rank, done, review }

    @State private var wk: Loadable<WeekResponse> = .idle
    @State private var draft: Draft = .empty
    @State private var seeded = false
    @State private var stepOverride: Step?
    @State private var saveError: String?
    @State private var saving = false
    @State private var shakeTray = 0
    @State private var now = ServerClock.shared.now
    @State private var confetti = 0

    private var playerId: String { model.player?.id ?? "" }
    private var games: [Game] { wk.value?.games ?? [] }
    private var gamesById: [String: Game] { Dictionary(games.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }) }
    private var myPicks: [Pick] { wk.value?.myPicks ?? [] }

    private func lockedNow(_ g: Game) -> Bool { WeekLogic.isLocked(g, now: now) }

    private var frozen: [Pick] {
        myPicks.filter { p in gamesById[p.gameId].map(lockedNow) ?? false }.sorted { $0.rank < $1.rank }
    }
    private var frozenRanks: Set<Int> { Set(frozen.map(\.rank)) }
    private var availableRanks: [Int] { Scoring.allRanks.filter { !frozenRanks.contains($0) } }
    private var draftOrder: [String] { draft.order.filter { id in gamesById[id].map { !lockedNow($0) } ?? false } }
    private var unlockedPicks: [Pick] {
        zip(draftOrder.prefix(availableRanks.count), availableRanks).compactMap { id, rank in
            draft.selections[id].map { Pick(gameId: id, team: $0, rank: rank) }
        }
    }
    private var merged: [Pick] { (frozen + unlockedPicks).sorted { $0.rank < $1.rank } }
    private var hasSaved: Bool { !myPicks.isEmpty }
    private var dirty: Bool {
        let key = { (p: Pick) in "\(p.gameId):\(p.team):\(p.rank)" }
        let saved = Set(myPicks.filter { !frozenRanks.contains($0.rank) }.map(key))
        let mine = Set(unlockedPicks.map(key))
        return saved != mine
    }
    private var anyUnlocked: Bool { games.contains { !lockedNow($0) } }
    private var allLocked: Bool { !games.isEmpty && !anyUnlocked }
    private var openGames: [Game] { games.filter { !lockedNow($0) } }
    /// Slots only go as high as this player can actually still fill.
    private var slotCount: Int { min(Scoring.maxPicks, frozen.count + openGames.count) }
    private var step: Step { stepOverride ?? (hasSaved && !dirty ? .review : .select) }

    private var status: (label: String, fill: Color)? {
        if allLocked { return (hasSaved ? "Locked" : "No picks", .paper2) }
        if hasSaved && !dirty { return ("Picks in ✓", .turfSoft) }
        return nil
    }

    var body: some View {
        Group {
            switch wk {
            case .idle, .loading:
                GamesSkeleton()
            case .failed(let err):
                ErrorState(message: err.message) { Task { await load() } }
            case .loaded(let data):
                content(data)
            }
        }
        .task(id: "\(playerId):\(week)") { await load() }
        .task {
            // Countdowns and lock states stay honest; the slate refreshes on the web's cadence.
            var beat = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                now = ServerClock.shared.now
                beat += 1
                if beat % 4 == 0 { await load(quiet: true) }
            }
        }
        .onChange(of: draft) { _, new in
            if !playerId.isEmpty { DraftStore.save(new, playerId: playerId, week: week) }
            syncTray()
        }
        .onChange(of: now) { _, _ in dropStale(); syncTray() }
        .onChange(of: stepOverride) { _, _ in syncTray() }
        .onChange(of: wk.value?.now) { _, _ in syncTray() }
        .onDisappear { model.tray = nil }
        .overlay { if confetti > 0 { ConfettiView(trigger: confetti).allowsHitTesting(false) } }
    }

    @ViewBuilder
    private func content(_ data: WeekResponse) -> some View {
        switch step {
        case .review:
            ReviewStep(week: week, games: games, myPicks: myPicks, pickCounts: data.pickCounts, lockedNow: lockedNow, anyUnlocked: anyUnlocked,
                       submitted: data.submitted, status: status, onEdit: { setStep(.select) })
        case .select:
            SelectStep(games: games, draft: draft, frozen: frozen, lockedNow: lockedNow, pickCounts: data.pickCounts, allLocked: allLocked,
                       hasSaved: hasSaved, currentWeek: model.currentWeek, week: week, now: now, openCount: openGames.count,
                       picked: merged.count, slotCount: slotCount, status: status, onPick: onPick)
        case .rank:
            RankStep(frozen: frozen, order: draftOrder, availableRanks: availableRanks, selections: draft.selections, gamesById: gamesById,
                     merged: merged, pending: saving, error: saveError, offline: !model.online,
                     onOrder: { draft = Draft(selections: draft.selections, order: $0) }, onBack: { setStep(.select) }, onSubmit: { Task { await submit() } })
        case .done:
            DoneStep(name: model.player?.name ?? "", week: week, picks: myPicks.isEmpty ? merged : myPicks, gamesById: gamesById,
                     onReview: { setStep(nil) }, shareURL: model.shareURL)
        }
    }

    // MARK: Data

    private func load(quiet: Bool = false) async {
        guard !playerId.isEmpty else { return }
        if !quiet, wk.value == nil { wk = .loading }
        do {
            let data = try await model.service.week(week)
            wk = .loaded(data)
            now = ServerClock.shared.now
            seedIfNeeded(data)
            dropStale()
            syncTray()
            model.syncLiveActivity(week: week, response: data)
        } catch {
            if wk.value == nil { wk = .failed(error.asAPIError) }
        }
    }

    /// Seed the draft from saved picks the first time the week loads (a draft on the phone wins).
    private func seedIfNeeded(_ data: WeekResponse) {
        guard !seeded else { return }
        seeded = true
        if let stored = DraftStore.load(playerId: playerId, week: week) {
            draft = stored
            return
        }
        let unlocked = data.myPicks.filter { p in data.games.first { $0.id == p.gameId }.map { !lockedNow($0) } ?? false }
        if !unlocked.isEmpty {
            draft = Draft(
                selections: Dictionary(unlocked.map { ($0.gameId, $0.team) }, uniquingKeysWith: { a, _ in a }),
                order: unlocked.sorted { $0.rank < $1.rank }.map(\.gameId)
            )
        }
    }

    /// Drop draft selections whose games have since kicked off and weren't saved.
    private func dropStale() {
        guard wk.value != nil else { return }
        let savedLocked = Set(myPicks.map(\.gameId))
        let stale = draft.order.filter { id in
            guard let g = gamesById[id] else { return true }
            return lockedNow(g) && !savedLocked.contains(id)
        }
        guard !stale.isEmpty else { return }
        draft = stale.reduce(draft) { $0.removing(gameId: $1) }
        model.toast("A game you'd picked just kicked off, so it's out. Swap in another.", kind: .error)
    }

    private func syncTray() {
        guard step == .select, wk.value != nil else {
            if model.tray != nil { model.tray = nil }
            return
        }
        model.tray = PickTrayState(
            merged: merged,
            frozenIds: Set(frozen.map(\.gameId)),
            slots: slotCount,
            disabled: !anyUnlocked,
            shake: shakeTray,
            onRemove: { id in draft = draft.removing(gameId: id) },
            onNext: { setStep(.rank) }
        )
    }

    // MARK: Actions

    private func setStep(_ s: Step?) {
        withAnimation(.easeOut(duration: 0.18)) { stepOverride = s }
        syncTray()
    }

    private func onPick(_ game: Game, _ team: String) {
        guard !lockedNow(game) else { return }
        let already = draft.selections[game.id] != nil
        if !already, frozen.count + draftOrder.count >= Scoring.maxPicks {
            shakeTray += 1
            syncTray()
            model.toast("That's five already — tap one in the tray to swap it out.")
            return
        }
        // Taking one back should not feel like choosing it.
        if already, draft.selections[game.id] == team { Haptics.unpick() } else { Haptics.pick() }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            draft = draft.toggling(gameId: game.id, team: team)
        }
    }

    private func submit() async {
        saveError = nil
        saving = true
        defer { saving = false }
        do {
            let res = try await model.service.putPicks(week: week, picks: merged)
            DraftStore.clear(playerId: playerId, week: week)
            seeded = false
            draft = .empty
            wk = .loaded(WeekResponse(now: res.now, week: week, games: games, myPicks: res.picks, pickCounts: wk.value?.pickCounts ?? [:], submitted: wk.value?.submitted ?? 0))
            setStep(.done)
            Haptics.lockedIn()
            confetti += 1
            await load(quiet: true)
            await model.refreshBootstrap()
            // The moment to ask: five picks are in, there is visibly something to be told about,
            // and nobody is being interrupted. Asking at launch is how you get a "no" forever.
            await model.offerNotifications()
        } catch {
            let err = error.asAPIError
            if err.status == 409 {
                let ids = err.details?["gameIds"]?.stringArray ?? []
                draft = ids.reduce(draft) { $0.removing(gameId: $1) }
                model.toast(ids.isEmpty ? err.message : "One of those games just kicked off. Swap it for another.", kind: .error)
                await load(quiet: true)
                setStep(.select)
            } else {
                Haptics.failure()
                saveError = !model.online
                    ? "You're offline. Your picks are saved on this phone — try again when you're back."
                    : err.message
            }
        }
    }
}

/// What the tray needs from the pick screen, handed to the shell that floats it over the tab bar.
struct PickTrayState {
    let merged: [Pick]
    let frozenIds: Set<String>
    let slots: Int
    let disabled: Bool
    let shake: Int
    let onRemove: (String) -> Void
    let onNext: () -> Void
}
