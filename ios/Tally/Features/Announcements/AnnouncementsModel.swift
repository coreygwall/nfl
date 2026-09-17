import Foundation
import TallyKit

/**
 Where "seen" is written down.

 `UserDefaults` rather than the Keychain or the server: this is a convenience, not a secret, and it
 is deliberately *not* synced. Read state belongs to the device in front of you — the web stores it
 in `localStorage` for the same reason, and the two are allowed to disagree. Keyed per pool,
 because two pools' feeds have nothing to do with each other.
 */
enum AnnouncementSeen {
    private static func key(pool: PoolRef) -> String {
        "tally.announcements.seen.v1:\(pool.host)/\(pool.slug)"
    }

    static func load(pool: PoolRef) -> String? {
        UserDefaults.standard.string(forKey: key(pool: pool))
    }

    static func save(_ id: String, pool: PoolRef) {
        UserDefaults.standard.set(id, forKey: key(pool: pool))
    }
}

extension AppModel {
    // MARK: Reading

    /// Whether the megaphone is worth showing: a live feed to read, or an office to manage one from.
    var announcementsAvailable: Bool { messageFeed.value?.isAvailable ?? false }

    /// A commissioner looking at their own switched-off feed has nothing *new* to be told about —
    /// the badge is for members being notified, and the feed is off for them.
    var unreadAnnouncements: Int {
        guard messageFeed.value?.enabled == true else { return 0 }
        return AnnouncementRead.countUnread(messages, seenId: announcementsSeenId)
    }

    var unreadAnnouncementBadge: String? { AnnouncementRead.badgeText(unread: unreadAnnouncements) }

    var canPostAnnouncements: Bool { messageFeed.value?.canManage ?? false }
    var canReactToAnnouncements: Bool { messageFeed.value?.canReact ?? false }
    var announcementsEnabled: Bool { messageFeed.value?.enabled ?? false }
    var hasMoreAnnouncements: Bool { messagesCursor != nil }

    // MARK: Loading

    func refreshMessages(quiet: Bool = false) async {
        if !quiet, messageFeed.value == nil { messageFeed = .loading }
        do {
            let page = try await service.messages()
            messageFeed = .loaded(page)
            messages = page.messages
            messagesCursor = page.nextCursor
        } catch {
            // A refresh that fails leaves what is already on screen alone: stale announcements are
            // better than an error where announcements used to be.
            if messageFeed.value == nil { messageFeed = .failed(error.asAPIError) }
        }
    }

    /// The next page back. Appends rather than replaces, and is a no-op at the end of the feed.
    func loadMoreMessages() async {
        guard let cursor = messagesCursor else { return }
        do {
            let page = try await service.messages(before: cursor)
            // Guard against a double tap landing the same page twice.
            let known = Set(messages.map(\.id))
            messages.append(contentsOf: page.messages.filter { !known.contains($0.id) })
            messagesCursor = page.nextCursor
        } catch {
            toast(error.asAPIError.message, kind: .error)
        }
    }

    /// Remember the newest announcement now on screen as read. Called when the feed is actually
    /// looked at, not when it is merely fetched.
    func markAnnouncementsRead() {
        guard let newest = messages.first?.id, newest != announcementsSeenId else { return }
        announcementsSeenId = newest
        AnnouncementSeen.save(newest, pool: pool)
    }

    /**
     What the megaphone does: peek, from anywhere.

     It used to scroll on Home and peek everywhere else, which made one button do two things
     depending on where you happened to be standing. Now the feed is not on Home at all, and the
     megaphone is the one door to it: a medium sheet of the announcements, whole, over whatever
     you were doing. The full feed is a second tap only when there is something a sheet cannot
     hold — older pages, or the composer. The web keeps its section on the pool home and scrolls
     to it, because a page can afford a section; a tab cannot.
     */
    func tapMegaphone() {
        showAnnouncementsSheet = true
    }

    /// The whole feed, optionally landing on one announcement.
    func openAnnouncementsFeed(focus: String? = nil) {
        announcementFocusId = focus
        guard showAnnouncementsSheet else {
            showAnnouncementsFeed = true
            return
        }
        // One sheet giving way to another: the first has to finish leaving or the second never
        // arrives — the same wait the commissioner sheet takes on its way to the league office.
        showAnnouncementsSheet = false
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            self.showAnnouncementsFeed = true
        }
    }

    // MARK: Writing

    func postAnnouncement(_ body: String) async -> Bool {
        do {
            _ = try await service.postMessage(body)
            await refreshMessages(quiet: true)
            // Posting counts as having read your own words, or the commissioner picks up a badge
            // for the announcement they just wrote.
            markAnnouncementsRead()
            toast("Posted to the pool.", kind: .success)
            return true
        } catch {
            toast(error.asAPIError.message, kind: .error)
            return false
        }
    }

    func editAnnouncement(id: String, body: String) async -> Bool {
        do {
            _ = try await service.editMessage(id: id, body: body)
            await refreshMessages(quiet: true)
            return true
        } catch {
            toast(error.asAPIError.message, kind: .error)
            return false
        }
    }

    func deleteAnnouncement(id: String) async {
        do {
            _ = try await service.deleteMessage(id: id)
            await refreshMessages(quiet: true)
        } catch {
            toast(error.asAPIError.message, kind: .error)
        }
    }

    /**
     Like, or take it back.

     The row flips immediately and is put back if the server disagrees: a like is a small, cheap,
     entirely reversible thing, and waiting a round trip to see your own tap land makes it feel
     broken. The call is an explicit PUT or DELETE rather than a toggle, so a retry cannot land on
     the opposite of what was asked for.
     */
    func toggleAnnouncementLike(_ message: PoolMessage) async {
        guard canReactToAnnouncements else { return }
        let wants = !message.liked
        applyLike(id: message.id, liked: wants)
        do {
            _ = wants ? try await service.likeMessage(id: message.id) : try await service.unlikeMessage(id: message.id)
        } catch {
            applyLike(id: message.id, liked: !wants)
            toast(error.asAPIError.message, kind: .error)
        }
    }

    private func applyLike(id: String, liked: Bool) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        let m = messages[index]
        guard m.liked != liked else { return }
        messages[index] = PoolMessage(
            id: m.id,
            authorName: m.authorName,
            authorRole: m.authorRole,
            body: m.body,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
            likes: max(0, m.likes + (liked ? 1 : -1)),
            liked: liked
        )
    }

    func setAnnouncementsEnabled(_ enabled: Bool) async {
        do {
            _ = try await service.setMessagesEnabled(enabled)
            await refreshMessages(quiet: true)
        } catch {
            toast(error.asAPIError.message, kind: .error)
        }
    }
}
