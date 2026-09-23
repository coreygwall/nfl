import Foundation

/// The Worker's error envelope, as a thrown Swift error. `code` is what screens branch on.
public struct APIError: Error, LocalizedError, Sendable, Equatable {
    public let status: Int
    public let code: String
    public let message: String
    public let details: JSONValue?

    public init(status: Int, code: String, message: String, details: JSONValue? = nil) {
        self.status = status; self.code = code; self.message = message; self.details = details
    }

    public var errorDescription: String? { message }

    public static let offline = APIError(status: 0, code: "NETWORK", message: "Can't reach the pool right now. Check your connection.")

    public var isNetwork: Bool { code == "NETWORK" }
    /// A device token that no longer works: the player was reset, removed, or signed out.
    public var isSignedOut: Bool { code == "NO_PLAYER" && status == 401 }
}

/// What every request carries to say who is asking. Read fresh per request, so switching the
/// active entry takes effect immediately.
public struct AuthHeaders: Sendable {
    public var token: String?
    /// The entry this account is picking as, when it is not the account itself.
    public var entryId: String?
    public init(token: String? = nil, entryId: String? = nil) {
        self.token = token; self.entryId = entryId
    }
}

/**
 One thin door to the Worker. Mirrors `src/api/client.ts`: JSON in and out, the identity headers
 on every call, the server's `now` noted from every response, and errors turned into `APIError`
 with the same codes the web app branches on.
 */
public final class APIClient: @unchecked Sendable {
    public let pool: PoolRef
    private let session: URLSession
    private let auth: @Sendable () -> AuthHeaders
    private let clock: ServerClock

    public init(pool: PoolRef, session: URLSession = APIClient.defaultSession, clock: ServerClock = .shared, auth: @escaping @Sendable () -> AuthHeaders) {
        self.pool = pool
        self.session = session
        self.clock = clock
        self.auth = auth
    }

    public static let defaultSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        config.httpCookieStorage = nil // the token header is the identity; cookies are the web's safety net
        return URLSession(configuration: config)
    }()

    public struct Options: Sendable {
        public var pin: String?
        /// Act as a specific identity rather than the active one (switching, or right after claiming).
        public var token: String?
        public init(pin: String? = nil, token: String? = nil) {
            self.pin = pin; self.token = token
        }
    }

    private struct Empty: Encodable {}
    private struct NowPeek: Decodable { let now: Date? }

    public func get<T: Decodable>(_ path: String, options: Options = Options()) async throws -> T {
        try await request("GET", path, body: Optional<Empty>.none, options: options)
    }

    public func post<T: Decodable, B: Encodable>(_ path: String, body: B, options: Options = Options()) async throws -> T {
        try await request("POST", path, body: body, options: options)
    }

    public func post<T: Decodable>(_ path: String, options: Options = Options()) async throws -> T {
        try await request("POST", path, body: Empty(), options: options)
    }

    public func put<T: Decodable, B: Encodable>(_ path: String, body: B, options: Options = Options()) async throws -> T {
        try await request("PUT", path, body: body, options: options)
    }

    /// For routes where the path *is* the request — liking an announcement says everything in its
    /// verb and its URL, and has nothing left to put in a body.
    public func put<T: Decodable>(_ path: String, options: Options = Options()) async throws -> T {
        try await request("PUT", path, body: Empty(), options: options)
    }

    public func patch<T: Decodable, B: Encodable>(_ path: String, body: B, options: Options = Options()) async throws -> T {
        try await request("PATCH", path, body: body, options: options)
    }

    public func delete<T: Decodable>(_ path: String, options: Options = Options()) async throws -> T {
        try await request("DELETE", path, body: Optional<Empty>.none, options: options)
    }

    /// A delete that has to say something beyond its path — deleting an account carries an
    /// explicit confirmation, so a stray request can never do it by accident.
    public func delete<T: Decodable, B: Encodable>(_ path: String, body: B, options: Options = Options()) async throws -> T {
        try await request("DELETE", path, body: body, options: options)
    }

    /// Raw bytes, for the CSV export.
    public func download(_ path: String, options: Options = Options()) async throws -> Data {
        let (data, response) = try await perform(makeRequest("GET", path, body: Optional<Empty>.none, options: options))
        try check(response, data: data)
        return data
    }

    private func request<T: Decodable, B: Encodable>(_ method: String, _ path: String, body: B?, options: Options) async throws -> T {
        let (data, response) = try await perform(try makeRequest(method, path, body: body, options: options))
        try check(response, data: data)
        if let peek = try? ISO8601Parsing.decoder.decode(NowPeek.self, from: data), let now = peek.now {
            clock.note(serverNow: now)
        }
        do {
            return try ISO8601Parsing.decoder.decode(T.self, from: data)
        } catch {
            throw APIError(status: 200, code: "DECODE", message: "The pool answered in a shape this version of the app doesn't understand. Update the app.")
        }
    }

    private func makeRequest<B: Encodable>(_ method: String, _ path: String, body: B?, options: Options) throws -> URLRequest {
        var url = pool.apiURL(path)
        if let override = clock.overrideISO, var c = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            c.queryItems = (c.queryItems ?? []) + [URLQueryItem(name: "now", value: override)]
            url = c.url ?? url
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "accept")
        req.setValue("Tally-iOS/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev")", forHTTPHeaderField: "user-agent")
        let headers = auth()
        let token = options.token ?? headers.token
        if let token { req.setValue(token, forHTTPHeaderField: "x-player-token") }
        // The entry header only applies to the active identity's own token.
        if let entryId = headers.entryId, options.token == nil || options.token == headers.token {
            req.setValue(entryId, forHTTPHeaderField: "x-entry-id")
        }
        if let pin = options.pin { req.setValue(pin, forHTTPHeaderField: "x-admin-pin") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "content-type")
            req.httpBody = try ISO8601Parsing.encoder.encode(body)
        }
        return req
    }

    private func perform(_ req: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: req)
        } catch {
            throw APIError.offline
        }
    }

    private func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.offline }
        guard (200..<300).contains(http.statusCode) else {
            if let body = try? ISO8601Parsing.decoder.decode(ApiErrorBody.self, from: data) {
                throw APIError(status: http.statusCode, code: body.error.code, message: body.error.message, details: body.error.details)
            }
            throw APIError(status: http.statusCode, code: "HTTP", message: HTTPURLResponse.localizedString(forStatusCode: http.statusCode))
        }
    }
}
