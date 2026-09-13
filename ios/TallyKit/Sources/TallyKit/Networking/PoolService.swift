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

    public func verifyPin(_ pin: String) async throws -> OkResponse {
        try await client.post("/admin/verify", options: .init(pin: pin))
    }

    public func adminWeek(_ week: Int, pin: String) async throws -> AdminWeekResponse {
        try await client.get("/admin/weeks/\(week)", options: .init(pin: pin))
    }

    public func setResult(gameId: String, winner: String?, pin: String) async throws -> Game {
        try await client.put("/admin/games/\(gameId)/result", body: AdminSetResultRequest(winner: winner), options: .init(pin: pin))
    }

    public func adminPlayers(pin: String) async throws -> AdminPlayersResponse {
        try await client.get("/admin/players", options: .init(pin: pin))
    }

    private struct ReadyBody: Encodable { let ready: Bool }

    public func setReady(playerId: String, ready: Bool, pin: String) async throws -> AdminReadyResponse {
        try await client.put("/admin/players/\(playerId)/ready", body: ReadyBody(ready: ready), options: .init(pin: pin))
    }

    public func renamePlayer(playerId: String, name: String, pin: String) async throws -> Player {
        try await client.patch("/admin/players/\(playerId)", body: NameBody(name: name), options: .init(pin: pin))
    }

    public func deletePlayer(playerId: String, pin: String) async throws -> OkResponse {
        try await client.delete("/admin/players/\(playerId)", options: .init(pin: pin))
    }

    public func resetAccess(playerId: String, pin: String) async throws -> AdminResetAccessResponse {
        try await client.post("/admin/players/\(playerId)/reset-access", options: .init(pin: pin))
    }

    /// Puts an existing player on this phone with the commissioner's say-so.
    public func adminDevice(playerId: String, pin: String) async throws -> AdminDeviceResponse {
        try await client.post("/admin/players/\(playerId)/device", options: .init(pin: pin))
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

    private struct SyncBody: Encodable { let source: String }
    private struct PullBody: Encodable { let week: Int? }

    public func syncSchedule(source: String, pin: String) async throws -> AdminSyncResult {
        try await client.post("/admin/sync-schedule", body: SyncBody(source: source), options: .init(pin: pin))
    }

    public func pullResults(week: Int?, pin: String) async throws -> AdminPullResultsResponse {
        try await client.post("/admin/pull-results", body: PullBody(week: week), options: .init(pin: pin))
    }

    public func adminStatus(pin: String) async throws -> AdminStatus {
        try await client.get("/admin/status", options: .init(pin: pin))
    }

    public func exportCSV(pin: String) async throws -> Data {
        try await client.download("/admin/export.csv", options: .init(pin: pin))
    }
}
