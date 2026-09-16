import Foundation

/// The longest an announcement may be, mirroring `MESSAGE_MAX_LENGTH` in `shared/messages.ts`.
public let messageMaxLength = 2000

/// One announcement, as `shared/messages.ts` defines it.
public struct PoolMessage: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let authorName: String
    public let authorRole: String
    public let body: String
    public let createdAt: Date
    public let updatedAt: Date
    public let likes: Int
    /// Whether *this account* has liked it — an account-level reaction, not a per-entry one, so a
    /// phone that picks for three people still only gets one like per announcement.
    public let liked: Bool

    /// The server stamps `updated_at` with `created_at` on insert, so a difference means a human
    /// went back and changed the wording.
    public var wasEdited: Bool { updatedAt != createdAt }

    public init(
        id: String,
        authorName: String,
        authorRole: String,
        body: String,
        createdAt: Date,
        updatedAt: Date,
        likes: Int,
        liked: Bool
    ) {
        self.id = id
        self.authorName = authorName
        self.authorRole = authorRole
        self.body = body
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.likes = likes
        self.liked = liked
    }
}

/**
 One page of the feed, plus what this reader is allowed to do with it.

 `enabled` and `canManage` are separate questions and both matter: a commissioner still sees the
 feed after switching it off, because otherwise turning it off would hide the posts they need in
 order to turn it back on sensibly. Everyone else sees nothing at all — the server returns an empty
 list rather than trusting the client to hide it.
 */
public struct MessagesResponse: Codable, Sendable {
    public let enabled: Bool
    public let postingPolicy: String
    public let canManage: Bool
    /// Liking needs both an account and a live feed; a signed-out reader can read but not react.
    public let canReact: Bool
    public let messages: [PoolMessage]
    /// The id to pass as `before` for the next page, or nil at the end of the feed.
    public let nextCursor: String?

    public init(
        enabled: Bool,
        postingPolicy: String = "commissioners",
        canManage: Bool,
        canReact: Bool,
        messages: [PoolMessage],
        nextCursor: String? = nil
    ) {
        self.enabled = enabled
        self.postingPolicy = postingPolicy
        self.canManage = canManage
        self.canReact = canReact
        self.messages = messages
        self.nextCursor = nextCursor
    }

    /// Whether the megaphone is worth showing at all: there is either a live feed to read, or an
    /// office to manage one from.
    public var isAvailable: Bool { enabled || canManage }
}

/// What `POST /messages` hands back.
public struct CreatedMessageResponse: Codable, Sendable {
    public let id: String
}
