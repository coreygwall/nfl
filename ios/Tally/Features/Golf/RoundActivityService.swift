import ActivityKit
import Foundation
import Observation
import TallyKit

/**
 The round on the lock screen.

 One activity per card. Unlike the week's, this one takes **no push token**: a scramble has no feed
 behind it, so everything that can change the numbers is a tap in this app, and the app can update
 the activity itself. That is worth saying out loud because it means the golf lock screen works
 today, on a phone with no APNs key configured, which the pool's does not.

 It starts on the first stroke rather than when the card is made. A card set up the night before is
 not a round in progress, and a lock screen that says "on the tee" for fourteen hours is clutter.
 It ends when the round does, leaving the final state up — the result is the thing somebody wants
 on the way home, not a gap where it was.

 Everything is best effort. ActivityKit refuses for reasons the app cannot see, and none of them is
 worth telling anybody about.
 */
@MainActor
@Observable
final class RoundActivityService {
    private(set) var activities: [String: Activity<RoundActivityAttributes>] = [:]

    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    /// Pick up activities that outlived the app: a phone that locked on the fourth tee and came
    /// back on the fifth finds its own round still running.
    func adoptExisting() {
        for existing in Activity<RoundActivityAttributes>.activities where activities[existing.attributes.cardId] == nil {
            activities[existing.attributes.cardId] = existing
        }
    }

    /**
     Bring the lock screen in line with the card.

     Safe to call after every tap: it starts, updates or ends as the card calls for, and does
     nothing at all when Live Activities are switched off.
     */
    func sync(_ card: ScrambleCard) async {
        guard enabled else { return }
        let state = RoundActivityAttributes.state(from: card)
        if card.isComplete {
            await end(cardId: card.id, final: state)
            return
        }
        // Nothing has been hit yet. A card is not a round.
        guard card.strokesTaken > 0 || state.strokesOnHole > 0 else { return }

        let content = ActivityContent(state: state, staleDate: .now.addingTimeInterval(3 * 3600))
        if let running = activities[card.id] {
            await running.update(content)
            return
        }
        let attributes = RoundActivityAttributes(
            cardId: card.id,
            cardName: card.name,
            course: card.course,
            holeCount: card.holeCount
        )
        do {
            // No push type: there is no server in this loop, and asking for a token the Worker
            // would never use is how a feature acquires a dependency it does not have.
            activities[card.id] = try Activity.request(attributes: attributes, content: content)
        } catch {
            print("round activity refused: \(error.localizedDescription)")
        }
    }

    /// Wind one up, leaving the result on screen for the drive home.
    func end(cardId: String, final state: RoundActivityAttributes.ContentState?) async {
        guard let running = activities[cardId] else { return }
        let content = state.map { ActivityContent(state: $0, staleDate: nil) }
        await running.end(content, dismissalPolicy: .after(.now.addingTimeInterval(4 * 3600)))
        activities[cardId] = nil
    }

    /// The card is gone, so the lock screen goes with it rather than outliving what it describes.
    func discard(cardId: String) async {
        guard let running = activities[cardId] else { return }
        await running.end(nil, dismissalPolicy: .immediate)
        activities[cardId] = nil
    }
}
