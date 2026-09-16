import Foundation

/**
 Building a snapshot from the API.

 One code path, used twice: the app calls it after a refresh so the home screen is right the moment
 somebody backgrounds the app, and the widget's own timeline calls it when the app has not been
 opened in a while. Two implementations would be two sets of rounding, two ideas of what counts as
 the top three, and one of them would be the one nobody ever looks at.

 Three requests, because that is what the three widgets between them need: the week (picks, games,
 standing), the week board, and the season board. They are fetched together rather than lazily —
 a widget timeline gets one wake, not three.
 */
public enum WidgetRefresh {
    /**
     Everything the widgets draw, for every entry this account runs.

     `bootstrap` is a parameter rather than always a fetch because the app already has one in hand
     — it is the object the whole app hangs off — and a fourth request on the way to the background
     is a request for something already sitting in memory. The widget's own refresh has nothing in
     memory and passes nil.
     */
    public static func snapshot(
        service: PoolService,
        pool: PoolRef,
        poolName: String,
        entries: [Identity],
        bootstrap: BootstrapResponse? = nil,
        now: Date = Date()
    ) async throws -> WidgetSnapshot {
        // Spelled out rather than `bootstrap ?? (try await ...)`: the standard `??` takes a
        // throwing autoclosure but not an async one, so the tidier version does not compile.
        let boot: BootstrapResponse
        if let bootstrap {
            boot = bootstrap
        } else {
            boot = try await service.bootstrap()
        }
        let week = boot.currentWeek

        async let weekResponse = service.week(week)
        async let weekBoard = service.weekBoard(week)
        async let seasonBoard = service.seasonBoard()

        let (weekData, board, season) = try await (weekResponse, weekBoard, seasonBoard)

        // The roster the account actually runs.
        //
        // The app passes its own session's people. The widget's background refresh has no session
        // to pass, so it takes what bootstrap says the account manages — `myEntries` — and falls
        // back to the signed-in player, which is what a plain device with no account behind it
        // has. Without that fallback a one-person install would snapshot nobody.
        let roster: [Identity] = if !entries.isEmpty {
            entries
        } else if let mine = boot.myEntries, !mine.isEmpty {
            mine.map { Identity(player: $0) }
        } else {
            boot.me.map { [Identity(player: $0)] } ?? []
        }

        let entrySnapshots = roster.map { identity in
            build(
                identity: identity,
                week: week,
                weekData: weekData,
                board: board,
                season: season,
                now: now
            )
        }

        return WidgetSnapshot(
            poolName: poolName,
            poolSlug: pool.slug,
            origin: pool.origin,
            week: week,
            updatedAt: now,
            entries: entrySnapshots,
            seasonStartsAt: boot.seasonStartsAt
        )
    }

    /**
     One entry's row, from the three responses.

     The week response only carries *one* entry's picks — whoever the request was made as — so an
     account running three gets real slots for the active one and place-and-points for the rest,
     read off the board. That is honest rather than clever: the board knows where everybody stands,
     and only the picker's own picks are ever returned to a client.
     */
    static func build(
        identity: Identity,
        week: Int,
        weekData: WeekResponse,
        board: WeekBoardResponse,
        season: SeasonBoardResponse,
        now: Date
    ) -> WidgetEntry {
        let row = board.rows.first { $0.playerId == identity.id }
        let seasonRow = season.rows.first { $0.playerId == identity.id }

        // `myPicks` belongs to whoever asked, and the board says who that was. For every other
        // entry the board's scored picks are what there is — which before kickoff is nothing,
        // because that is the point of hiding them.
        let isRequester = row?.isMe == true
        let slots: [WeekActivity.Slot]
        if isRequester {
            slots = WeekActivityAttributes.ContentState.from(
                picks: weekData.myPicks,
                games: weekData.games,
                now: now
            ).slots
        } else {
            slots = slotsFromBoard(row)
        }

        let state = WeekActivityAttributes.ContentState(
            slots: slots,
            points: row?.points ?? 0,
            possible: 0
        )

        let mine = Set(weekData.myPicks.map(\.gameId))
        let nextKickoff = weekData.games
            .filter { mine.contains($0.id) && $0.winner == nil && $0.kickoffAt > now }
            .map(\.kickoffAt)
            .min()

        return WidgetEntry(
            id: identity.id,
            name: identity.name,
            slots: slots,
            points: row?.points ?? state.points,
            possible: outstandingPoints(slots),
            place: row?.place,
            field: board.rows.isEmpty ? nil : board.rows.count,
            nextKickoffEpoch: isRequester ? nextKickoff.map { Int($0.timeIntervalSince1970) } : nil,
            weekTop: top(board.rows.prefix(3).map { ($0.place, $0.name, $0.points, $0.playerId == identity.id) }),
            seasonPlace: seasonRow?.place,
            seasonPoints: seasonRow?.points,
            seasonField: season.rows.isEmpty ? nil : season.rows.count,
            seasonTop: top(season.rows.prefix(3).map { ($0.place, $0.name, $0.points, $0.playerId == identity.id) }),
            seasonStarted: !season.notStarted
        )
    }

    /**
     A board row's scored picks, turned back into the five slots.

     A rank whose team is still secret keeps its place, so a row is always five wide and fills in as
     games start rather than growing sideways. A rank nobody picked is not a slot at all — there is
     a difference between "you have not shown me yet" and "you left this one".
     */
    private static func slotsFromBoard(_ row: WeekRow?) -> [WeekActivity.Slot] {
        guard let row else { return [] }
        return row.pickSlots.compactMap { slot -> WeekActivity.Slot? in
            switch slot {
            case .taken(let pick):
                let state: WeekActivity.State = switch pick.outcome {
                case .win: .won
                case .loss: .lost
                case .tie: .tied
                // The board only reveals a pick once its game has started, so "undecided" here
                // means it is being played right now.
                case .pending: .live
                }
                return WeekActivity.Slot(rank: pick.rank, team: pick.team, state: state)
            case .hidden(let rank):
                return WeekActivity.Slot(rank: rank, team: nil, state: .waiting)
            case .empty:
                return nil
            }
        }
    }

    /// The board-to-slots rule, for the tests. It is the one piece here with branches worth
    /// pinning down and the only way to reach it otherwise is three live API responses.
    static func slotsFromBoardForTesting(_ row: WeekRow) -> [WeekActivity.Slot] { slotsFromBoard(row) }

    private static func outstandingPoints(_ slots: [WeekActivity.Slot]) -> Int {
        slots.filter { $0.state == .waiting || $0.state == .live }.reduce(0) { $0 + $1.stake }
    }

    private static func top(_ rows: [(Int, String, Int, Bool)]) -> [WidgetStanding] {
        rows.map { WidgetStanding(place: $0.0, name: $0.1, points: $0.2, isMe: $0.3) }
    }
}
