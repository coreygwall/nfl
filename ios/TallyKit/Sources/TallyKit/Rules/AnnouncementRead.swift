import Foundation

/**
 What counts as "new", ported from `src/lib/announcementRead.ts`.

 Read state is a property of the *device*, not of the entry currently picking. A phone that picks
 for three people in the same family is one reader: marking an announcement seen as Dad and then
 switching to the kid's entry must not make the same post new again.

 It is stored as the id of the newest message the reader has actually looked at, rather than a
 count or a timestamp. A count goes wrong the moment a commissioner deletes a post; a timestamp
 goes wrong whenever the two clocks disagree. An id is a fact both sides already agree on.
 */
public enum AnnouncementRead {
    /**
     How many of `messages` are newer than the last one seen.

     `messages` is newest-first, as the API returns it, so the answer is simply the position of the
     seen message. Two cases need naming:

     - Nothing seen yet: everything is new, which is right for a reader who has never opened the
       feed.
     - The seen message is gone — deleted, or fallen off the end of the loaded page. Counting
       everything as new is the safe direction: an unread badge over something already read is a
       moment's annoyance, where hiding a genuinely new announcement is the failure that matters.
     */
    public static func countUnread(_ messages: [PoolMessage], seenId: String?) -> Int {
        countUnread(ids: messages.map(\.id), seenId: seenId)
    }

    /// The same rule over bare ids, so it can be tested without building whole messages.
    public static func countUnread(ids: [String], seenId: String?) -> Int {
        guard !ids.isEmpty else { return 0 }
        guard let seenId, let index = ids.firstIndex(of: seenId) else { return ids.count }
        return index
    }

    /// The badge never counts past nine: past a handful the number stops being information and
    /// the reader just needs to know there is a pile. Matches the web.
    public static func badgeText(unread: Int) -> String? {
        guard unread > 0 else { return nil }
        return unread > 9 ? "9+" : "\(unread)"
    }
}
