import Foundation

/**
 What this phone wants to be told about, mirroring `shared/notify-prefs.ts`.

 Two levels, because a household needs both. A device says which *kinds* it cares about — plenty of
 people want the Sunday results and not the Thursday nudge — and then, separately, which *entries*
 it hears about at all. A parent running four entries does not want four phones buzzing four times.

 **Absent always means on.** A new kind ships enabled for everybody who never touched a switch, an
 unknown key from an older build is ignored rather than muting something, and an empty object is
 the default rather than silence. The opposite would mean a deploy quietly switching off a
 notification somebody was relying on, with nothing on screen to say why.
 */
public enum NotificationKind: String, Codable, CaseIterable, Sendable {
    case picksDue
    case segment
    case weekDone

    public var title: String {
        switch self {
        case .picksDue: "Pick reminders"
        case .segment: "When your games finish"
        case .weekDone: "The week's result"
        }
    }

    public var detail: String {
        switch self {
        case .picksDue: "Before the first game, and again before Sunday, if your five are not in."
        case .segment: "One message per slate you had a pick in — not one per game."
        case .weekDone: "Where you finished, and where that leaves your season."
        }
    }
}

public struct EntryNotifyPrefs: Codable, Hashable, Sendable {
    /// Mutes this entry on this device entirely, whatever the kinds say.
    public var muted: Bool?
    /// Per-kind overrides for this one entry. Absent falls through to the device default.
    public var kinds: [String: Bool]?

    public init(muted: Bool? = nil, kinds: [String: Bool]? = nil) {
        self.muted = muted
        self.kinds = kinds
    }
}

public struct NotifyPrefs: Codable, Hashable, Sendable {
    /// The device's default per kind. Absent means on.
    public var kinds: [String: Bool]?
    /// Overrides for particular entries, keyed by player id.
    public var entries: [String: EntryNotifyPrefs]?

    public init(kinds: [String: Bool]? = nil, entries: [String: EntryNotifyPrefs]? = nil) {
        self.kinds = kinds
        self.entries = entries
    }

    public static let everything = NotifyPrefs()

    // MARK: Reading

    /// The device default for a kind. The same rule the server applies, so a switch on screen and
    /// the message that does or does not arrive can never disagree.
    public func isOn(_ kind: NotificationKind) -> Bool {
        kinds?[kind.rawValue] ?? true
    }

    public func isMuted(entry: String) -> Bool {
        entries?[entry]?.muted == true
    }

    /// Whether this entry hears this kind, which is the whole rule in one place: a muted entry
    /// hears nothing, then that entry's own answer, then the device's, then yes.
    public func allows(_ kind: NotificationKind, entry: String) -> Bool {
        if isMuted(entry: entry) { return false }
        if let own = entries?[entry]?.kinds?[kind.rawValue] { return own }
        return isOn(kind)
    }

    // MARK: Writing

    /// Only `false` is stored. Turning something back on removes the key rather than writing
    /// `true`, so the stored object stays the set of deliberate exceptions and a kind added later
    /// arrives switched on.
    public mutating func set(_ kind: NotificationKind, on: Bool) {
        var next = kinds ?? [:]
        if on { next.removeValue(forKey: kind.rawValue) } else { next[kind.rawValue] = false }
        kinds = next.isEmpty ? nil : next
    }

    public mutating func setMuted(_ muted: Bool, entry: String) {
        var all = entries ?? [:]
        var own = all[entry] ?? EntryNotifyPrefs()
        own.muted = muted ? true : nil
        all[entry] = own.isEmpty ? nil : own
        entries = all.isEmpty ? nil : all
    }

    public mutating func set(_ kind: NotificationKind, on: Bool, entry: String) {
        var all = entries ?? [:]
        var own = all[entry] ?? EntryNotifyPrefs()
        var ownKinds = own.kinds ?? [:]
        // An entry-level switch that agrees with the device default is not an override, so it is
        // removed: the entry follows the device again, including when the device changes later.
        if on == isOn(kind) {
            ownKinds.removeValue(forKey: kind.rawValue)
        } else {
            ownKinds[kind.rawValue] = on
        }
        own.kinds = ownKinds.isEmpty ? nil : ownKinds
        all[entry] = own.isEmpty ? nil : own
        entries = all.isEmpty ? nil : all
    }
}

extension EntryNotifyPrefs {
    /// Nothing worth storing — no mute and no overrides.
    var isEmpty: Bool { muted != true && (kinds?.isEmpty ?? true) }
}
