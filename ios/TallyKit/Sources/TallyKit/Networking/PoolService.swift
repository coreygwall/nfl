import Foundation

/**
 The API as a set of named calls, one per route in the Worker's `routes` folder. Screens call these and
 never build a path themselves, so the endpoints are listed in exactly one place on this side.
 */
public struct PoolService: Sendable {
    public let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public var pool: PoolRef { client.pool }

    // MARK: Pool

    public func bootstrap() async throws -> BootstrapResponse {
        try await client.get("/bootstrap")
    }

    public func week(_ week: Int) async throws -> WeekResponse {
        try await client.get("/weeks/\(week)")
    }

    public func putPicks(week: Int, picks: [Pick]) async throws -> PutPicksResponse {
        try await client.put("/weeks/\(week)/picks", body: PutPicksRequest(picks: picks))
    }

    public func weekBoard(_ week: Int) async throws -> WeekBoardResponse {
        try await client.get("/board/week/\(week)")
    }

    public func seasonBoard() async throws -> SeasonBoardResponse {
        try await client.get("/board/season")
    }

    // MARK: Identity

    private struct NameBody: Encodable { let name: String }
    private struct CodeBody: Encodable { let code: String? }

    public func createPlayer(name: String) async throws -> CreatePlayerResponse {
        try await client.post("/players", body: NameBody(name: name))
    }

    /// Claims a name for this device. Omit the code for a name nobody holds yet.
    public func claim(playerId: String, code: String?) async throws -> ClaimResponse {
        try await client.post("/players/\(playerId)/claim", body: CodeBody(code: code))
    }

    public func addEntry(name: String) async throws -> EntryResponse {
        try await client.post("/entries", body: NameBody(name: name))
    }

    /// Tells the server which identity this device is picking as; the header still rules.
    public func touchSession(token: String) async throws -> SessionResponse {
        try await client.post("/session", options: .init(token: token))
    }

    public func endSession() async throws -> OkResponse {
        try await client.delete("/session")
    }

    // MARK: Passkeys

    public func passkeyRegistrationOptions() async throws -> PasskeyRegistrationOptionsResponse {
        try await client.post("/passkeys/register/options")
    }

    public func finishPasskeyRegistration(challengeId: String, credential: PasskeyCredentialJSON) async throws -> PasskeyRegisterResponse {
        try await client.post("/passkeys/register", body: PasskeyFinishRequest(challengeId: challengeId, response: credential))
    }

    public func passkeyAuthenticationOptions() async throws -> PasskeyAuthenticationOptionsResponse {
        try await client.post("/passkeys/auth/options")
    }

    public func finishPasskeyAuthentication(challengeId: String, credential: PasskeyCredentialJSON) async throws -> PasskeyAuthResponse {
        try await client.post("/passkeys/auth", body: PasskeyFinishRequest(challengeId: challengeId, response: credential))
    }

    // MARK: Commissioner
    //
    // No PIN rides on any of these. The grant is against the account, so the ordinary session
    // headers are the authorisation — `claimRoles` is the one call that still takes the owner PIN,
    // and it is how an account gets the keys in the first place.

    public func claimRoles(pin: String) async throws -> ClaimRolesResponse {
        try await client.post("/roles/claim", options: .init(pin: pin))
    }

    public func commissionerOverview() async throws -> CommissionerOverview {
        try await client.get("/commissioner")
    }

    public func renamePool(name: String) async throws -> PoolResponse {
        try await client.patch("/commissioner/pool", body: NameBody(name: name))
    }

    public func commissionerWeek(_ week: Int) async throws -> CommissionerWeekResponse {
        try await client.get("/commissioner/weeks/\(week)")
    }

    public func commissionerPlayers() async throws -> CommissionerPlayersResponse {
        try await client.get("/commissioner/players")
    }

    private struct ReadyBody: Encodable { let ready: Bool }

    public func setReady(playerId: String, ready: Bool) async throws -> ReadyResponse {
        try await client.put("/commissioner/players/\(playerId)/ready", body: ReadyBody(ready: ready))
    }

    public func renamePlayer(playerId: String, name: String) async throws -> Player {
        try await client.patch("/commissioner/players/\(playerId)", body: NameBody(name: name))
    }

    public func deletePlayer(playerId: String) async throws -> OkResponse {
        try await client.delete("/commissioner/players/\(playerId)")
    }

    public func resetAccess(playerId: String) async throws -> ResetAccessResponse {
        try await client.post("/commissioner/players/\(playerId)/reset-access")
    }

    private struct CommissionerBody: Encodable { let playerId: String }

    public func addCommissioner(playerId: String) async throws -> CommissionersResponse {
        try await client.post("/commissioner/commissioners", body: CommissionerBody(playerId: playerId))
    }

    public func removeCommissioner(playerId: String) async throws -> CommissionersResponse {
        try await client.delete("/commissioner/commissioners/\(playerId)")
    }

    public func exportCSV() async throws -> Data {
        try await client.download("/commissioner/export.csv")
    }

    // MARK: Notifications

    /// Tells the server where to reach this install. Called on every launch: an APNs token can
    /// change without warning, and a stale one is a notification nobody ever sees.
    @discardableResult
    public func registerPushToken(
        _ token: String,
        environment: PushEnvironment,
        appVersion: String?
    ) async throws -> OkResponse {
        try await client.post("/push", body: RegisterPushBody(token: token, environment: environment.rawValue, appVersion: appVersion))
    }

    /// Notifications off, or signing out on this phone.
    @discardableResult
    public func unregisterPushToken(_ token: String) async throws -> OkResponse {
        try await client.delete("/push/\(token)")
    }

    private struct RegisterPushBody: Encodable {
        let token: String
        let environment: String
        let appVersion: String?
    }

    /**
     Hands the Worker the token for a running Live Activity, so it can keep that lock screen
     current while the app is shut.

     Called every time ActivityKit issues one rather than once: it reissues without warning, the
     same way APNs does, and a stale activity token is a lock screen frozen on the one o'clock
     score. The entry travels in the body because one install runs several of these — one per
     entry — and the server has to know which week's board each belongs to.
     */
    @discardableResult
    public func registerActivityToken(
        _ token: String,
        entryId: String,
        week: Int,
        environment: PushEnvironment
    ) async throws -> OkResponse {
        try await client.post(
            "/push/activity",
            body: RegisterActivityBody(token: token, environment: environment.rawValue, entryId: entryId, week: week)
        )
    }

    /// The lock screen is gone — dismissed, or the week ended while the app was open.
    @discardableResult
    public func unregisterActivityToken(_ token: String) async throws -> OkResponse {
        try await client.delete("/push/activity/\(token)")
    }

    private struct RegisterActivityBody: Encodable {
        let token: String
        let environment: String
        let entryId: String
        let week: Int
    }

    // MARK: Announcements

    private struct MessageBody: Encodable { let body: String }
    private struct EnabledBody: Encodable { let enabled: Bool }

    /// One page of announcements, newest first. Pass the previous page's `nextCursor` as `before`
    /// to walk backwards through the feed.
    public func messages(before: String? = nil) async throws -> MessagesResponse {
        let query = before.map { "?before=\($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0)" } ?? ""
        return try await client.get("/messages\(query)")
    }

    /// Commissioner only, and only while the feed is on — the server refuses a post to a feed
    /// nobody can read.
    public func postMessage(_ body: String) async throws -> CreatedMessageResponse {
        try await client.post("/messages", body: MessageBody(body: body))
    }

    public func editMessage(id: String, body: String) async throws -> OkResponse {
        try await client.patch("/messages/\(id)", body: MessageBody(body: body))
    }

    public func deleteMessage(id: String) async throws -> OkResponse {
        try await client.delete("/messages/\(id)")
    }

    /// Liking is a PUT and unliking a DELETE rather than one toggle, so a retry after a dropped
    /// response lands on the reaction the reader asked for instead of undoing it.
    public func likeMessage(id: String) async throws -> OkResponse {
        try await client.put("/messages/\(id)/like")
    }

    public func unlikeMessage(id: String) async throws -> OkResponse {
        try await client.delete("/messages/\(id)/like")
    }

    /// Turning the feed off hides it from members without deleting anything; commissioners can
    /// still see what is there.
    public func setMessagesEnabled(_ enabled: Bool) async throws -> OkResponse {
        try await client.patch("/messages/settings", body: EnabledBody(enabled: enabled))
    }

    // MARK: League office
    //
    // Results, the schedule and the feed. One authority for every pool on Tally.

    private struct SyncBody: Encodable { let source: String }
    private struct PullBody: Encodable { let week: Int? }

    public func leagueWeek(_ week: Int) async throws -> LeagueWeekResponse {
        try await client.get("/league/weeks/\(week)")
    }

    public func setResult(gameId: String, winner: String?) async throws -> Game {
        try await client.put("/league/games/\(gameId)/result", body: SetResultRequest(winner: winner))
    }

    public func syncSchedule(source: String) async throws -> SyncResult {
        try await client.post("/league/sync-schedule", body: SyncBody(source: source))
    }

    public func pullResults(week: Int?) async throws -> PullResultsResponse {
        try await client.post("/league/pull-results", body: PullBody(week: week))
    }

    public func leagueStatus() async throws -> LeagueStatus {
        try await client.get("/league/status")
    }
}
