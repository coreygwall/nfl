import ActivityKit
import Foundation
import TallyKit

/**
 The week on the lock screen.

 One activity per entry per week: someone running three entries gets three, told apart by the name
 in the header and matched back up by `entryId`. The app keeps them current whenever it is in the
 foreground and the Worker pushes updates while it is not, using the token handed over at the start.

 **It stays up all day, which took a rule change.** The old version ended the activity the moment
 this entry's five had settled. That is wrong twice over: somebody with a Thursday pick lost their
 lock screen on Thursday night, and somebody whose last game was the early Sunday slate lost theirs
 at four o'clock — while their *position* was still moving under them for another seven hours. The
 only thing that ends an activity now is the week itself being over.

 Everything is best-effort. A Live Activity can be refused for reasons the app cannot see — the
 setting is off, there are already too many running — and none of that is worth telling anyone
 about.
 */
@MainActor
@Observable
final class LiveActivityService {
    /// Running activities by entry id.
    private(set) var activities: [String: Activity<WeekActivityAttributes>] = [:]

    /// Whether the system will allow one at all, which the person controls in Settings.
    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    /// The push tokens for the running activities, by entry id, so the Worker can update them
    /// while the app is shut. It is the whole reason a lock screen is useful on a Sunday: nobody
    /// opens the app between games.
    private(set) var pushTokens: [String: String] = [:]

    /// Handed the entry, the week and a fresh token whenever ActivityKit issues one. The app wires
    /// this to the Worker; the service itself stays unaware there is a server.
    var onToken: ((_ entryId: String, _ week: Int, _ token: String) -> Void)?

    private var tokenTasks: [String: Task<Void, Never>] = [:]

    /// Adopt activities that outlived the app — a relaunch mid-Sunday finds them already running.
    func adoptExisting() {
        for existing in Activity<WeekActivityAttributes>.activities {
            let id = existing.attributes.entryId
            guard activities[id] == nil else { continue }
            activities[id] = existing
            watchToken(of: existing)
        }
    }

    /**
     Start or update the activity for one entry.

     Safe to call on every refresh: with one already running this is an update, with a finished
     week it ends rather than starts, and with Live Activities switched off it does nothing.
     */
    func sync(
        week: Int,
        entryId: String,
        entryName: String,
        poolName: String,
        state: WeekActivityAttributes.ContentState,
        firstKickoff: Date?
    ) async {
        guard enabled else { return }
        if state.weekFinal {
            await end(entryId: entryId, final: state)
            return
        }
        // Nothing to watch yet. A lock screen counting down to Thursday from Monday is clutter —
        // but once anything has kicked off, or kickoff is close, it earns its place and keeps it
        // through every gap between slates until the week is done.
        guard state.phase != .locked || isSoon(firstKickoff) else { return }

        let content = ActivityContent(state: state, staleDate: staleDate(for: state))
        if let running = activities[entryId] {
            if running.attributes.week == week {
                await running.update(content)
                return
            }
            // A new week. The old one is over by definition, so it goes rather than lingering
            // under last week's heading.
            await end(entryId: entryId, final: nil)
        }
        let attributes = WeekActivityAttributes(
            week: week,
            entryName: entryName,
            poolName: poolName,
            entryId: entryId
        )
        do {
            let started = try Activity.request(attributes: attributes, content: content, pushType: .token)
            activities[entryId] = started
            watchToken(of: started)
        } catch {
            // Refused. Nothing here is load-bearing, so there is nothing to recover.
            print("live activity refused: \(error.localizedDescription)")
        }
    }

    /**
     Wind one up.

     The final state is left on screen rather than vanishing mid-glance — the week's result is the
     thing somebody wants to see on Monday morning, not a gap where it was. The system caps how
     long a dismissed-but-visible activity may linger, so this asks for the longest it will honour
     rather than pretending it can stay indefinitely; swiping it away still works at any point.
     */
    func end(entryId: String, final state: WeekActivityAttributes.ContentState?) async {
        guard let running = activities[entryId] else { return }
        let content = state.map { ActivityContent(state: $0, staleDate: nil) }
        await running.end(content, dismissalPolicy: .after(.now.addingTimeInterval(4 * 3600)))
        activities[entryId] = nil
        pushTokens[entryId] = nil
        tokenTasks[entryId]?.cancel()
        tokenTasks[entryId] = nil
    }

    /// Everything down — signing out, or switching to a pool whose weeks are not these ones.
    func endAll() async {
        for id in activities.keys { await end(entryId: id, final: nil) }
    }

    /// The Worker needs the push token, which arrives asynchronously and can be reissued.
    private func watchToken(of activity: Activity<WeekActivityAttributes>) {
        let id = activity.attributes.entryId
        let week = activity.attributes.week
        tokenTasks[id]?.cancel()
        tokenTasks[id] = Task { [weak self] in
            for await data in activity.pushTokenUpdates {
                let hex = data.map { String(format: "%02x", $0) }.joined()
                await MainActor.run {
                    self?.pushTokens[id] = hex
                    self?.onToken?(id, week, hex)
                }
            }
        }
    }

    /// Within a few hours of the first kickoff is close enough to be useful rather than clutter.
    private func isSoon(_ kickoff: Date?) -> Bool {
        guard let kickoff else { return false }
        return kickoff.timeIntervalSinceNow < 4 * 3600
    }

    /**
     When the system should grey this out for being behind.

     It is a promise about how fresh the number is, so it tracks what is actually happening: while
     a game is on, a score more than half an hour old is worth doubting; in the gap before the next
     kickoff nothing can change, so the stale date is that kickoff rather than an arbitrary clock
     running out over lunch and greying a screen that is perfectly correct.
     */
    private func staleDate(for state: WeekActivityAttributes.ContentState) -> Date {
        switch state.phase {
        case .live: .now.addingTimeInterval(30 * 60)
        case .locked, .between: state.nextKickoff.map { $0.addingTimeInterval(30 * 60) } ?? .now.addingTimeInterval(4 * 3600)
        // Their games are done; only the board can move, and it moves as other games finish.
        case .watching: .now.addingTimeInterval(2 * 3600)
        case .final: .now.addingTimeInterval(12 * 3600)
        }
    }
}
