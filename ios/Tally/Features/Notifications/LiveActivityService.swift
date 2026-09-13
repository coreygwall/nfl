import ActivityKit
import Foundation
import TallyKit

/**
 The week on the lock screen.

 One activity per entry per week, started once the picks are in and ended when the last game is
 over. The app keeps it up to date whenever it is in the foreground; the Worker pushes updates
 while it is not, using the token handed over at the start.

 Everything is best-effort. A Live Activity can be refused for reasons the app cannot see — the
 setting is off, there are already too many — and none of that is worth telling anyone about.
 */
@MainActor
@Observable
final class LiveActivityService {
    private(set) var activity: Activity<WeekActivityAttributes>?

    /// Whether the system will allow one at all, which the person controls in Settings.
    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    /// The push token for the running activity, so the Worker can update it while the app is shut.
    private(set) var pushToken: String?

    private var tokenTask: Task<Void, Never>?

    /// Adopt an activity that outlived the app — a relaunch mid-Sunday finds one already running.
    func adoptExisting() {
        guard activity == nil, let existing = Activity<WeekActivityAttributes>.activities.first else { return }
        activity = existing
        watchToken(of: existing)
    }

    /**
     Start or update. Called whenever the week's picks or results change, which makes it safe to
     call on every refresh: with an activity already running this is an update, and with a finished
     week it ends rather than starts one.
     */
    func sync(
        week: Int,
        entryName: String,
        poolName: String,
        state: WeekActivityAttributes.ContentState,
        firstKickoff: Date?
    ) async {
        guard enabled else { return }
        if state.isFinished {
            await end(final: state)
            return
        }
        // Nothing to watch yet. A lock screen widget counting down to Thursday is clutter.
        guard state.slots.contains(where: { $0.state != .waiting }) || isSoon(firstKickoff) else { return }

        let content = ActivityContent(state: state, staleDate: staleDate(after: firstKickoff))
        if let activity, activity.attributes.week == week {
            await activity.update(content)
            return
        }
        await end(final: nil)
        let attributes = WeekActivityAttributes(week: week, entryName: entryName, poolName: poolName)
        do {
            let started = try Activity.request(attributes: attributes, content: content, pushType: .token)
            activity = started
            watchToken(of: started)
        } catch {
            // Refused. Nothing here is load-bearing, so there is nothing to recover.
            print("live activity refused: \(error.localizedDescription)")
        }
    }

    /// Wind it up, leaving the final score on screen for a while rather than vanishing mid-glance.
    func end(final state: WeekActivityAttributes.ContentState?) async {
        guard let running = activity else { return }
        let content = state.map { ActivityContent(state: $0, staleDate: nil) }
        await running.end(content, dismissalPolicy: .after(.now.addingTimeInterval(30 * 60)))
        activity = nil
        pushToken = nil
        tokenTask?.cancel()
        tokenTask = nil
    }

    /// The Worker needs the push token, which arrives asynchronously and can be reissued.
    private func watchToken(of activity: Activity<WeekActivityAttributes>) {
        tokenTask?.cancel()
        tokenTask = Task { [weak self] in
            for await data in activity.pushTokenUpdates {
                let hex = data.map { String(format: "%02x", $0) }.joined()
                await MainActor.run { self?.pushToken = hex }
            }
        }
    }

    /// Within a few hours of the first kickoff is close enough to be useful rather than clutter.
    private func isSoon(_ kickoff: Date?) -> Bool {
        guard let kickoff else { return false }
        return kickoff.timeIntervalSinceNow < 4 * 3600
    }

    /// When the system should grey it out for being out of date. A game runs about three hours.
    private func staleDate(after kickoff: Date?) -> Date {
        .now.addingTimeInterval(4 * 3600)
    }
}
