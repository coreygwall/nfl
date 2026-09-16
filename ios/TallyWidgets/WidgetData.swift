import AppIntents
import SwiftUI
import TallyKit
import WidgetKit

/**
 Where a widget gets its numbers.

 Two sources, in this order, and the order is the design:

 1. **The snapshot** the app leaves in the shared container. It reads in microseconds, it is right
    offline, and it is there the instant the widget is added — so a widget never opens on a
    spinner or a row of dashes.
 2. **A refresh of its own**, because a phone that has not been opened since Thursday would
    otherwise show Thursday. It runs on the timeline, writes what it finds back to the same
    container, and if it fails nothing happens: the snapshot is already on screen.

 A widget that could only do (2) shows a placeholder on a bad network. One that could only do (1)
 goes stale in a pocket. Neither is acceptable on a Sunday.
 */

// MARK: Configuration

/// Which entry a widget is pinned to. One-entry households never see this; a parent running three
/// puts one of each on the home screen and needs them told apart.
struct SelectEntry: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose an entry"
    static var description = IntentDescription("Pick whose week this widget shows.")

    @Parameter(title: "Entry", optionsProvider: EntryNames())
    var entryName: String?

    init() {}
    init(entryName: String?) { self.entryName = entryName }
}

/**
 The names to choose from, read straight out of the snapshot.

 Names rather than ids, because the picker is a list a person reads and because a pool cannot hold
 two of the same name — the server's `name_key` is unique, which is the same fact that lets you
 claim your own name by typing it.
 */
struct EntryNames: DynamicOptionsProvider {
    func results() async throws -> [String] {
        WidgetStore.read()?.entries.map(\.name) ?? []
    }
}

// MARK: Timeline

/// One rendering's worth of data.
struct TallyTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let entry: WidgetEntry?
    /// Nothing has ever been written — the app has not been opened, or nobody is signed in.
    var isEmpty: Bool { snapshot == nil || entry == nil }
    /// Old enough that the widget should say so rather than present it as today's.
    var isStale: Bool { snapshot?.isStale(now: date) ?? false }
}

struct TallyProvider: AppIntentTimelineProvider {
    /// What the gallery shows before a widget is added to a home screen: a plausible week, clearly
    /// a sample, so the picker shows what the thing does rather than an empty frame.
    func placeholder(in context: Context) -> TallyTimelineEntry {
        TallyTimelineEntry(date: Date(), snapshot: Sample.snapshot, entry: Sample.snapshot.entries.first)
    }

    func snapshot(for configuration: SelectEntry, in context: Context) async -> TallyTimelineEntry {
        // The gallery preview gets the sample; a real widget gets whatever is actually there.
        if context.isPreview, WidgetStore.read() == nil { return placeholder(in: context) }
        return current(for: configuration)
    }

    func timeline(for configuration: SelectEntry, in context: Context) async -> Timeline<TallyTimelineEntry> {
        await refreshIfPossible()
        let entry = current(for: configuration)
        return Timeline(entries: [entry], policy: .after(nextRefresh(after: entry)))
    }

    private func current(for configuration: SelectEntry) -> TallyTimelineEntry {
        let snapshot = WidgetStore.read()
        let chosen = configuration.entryName.flatMap { name in
            snapshot?.entries.first { $0.name == name }
        }
        return TallyTimelineEntry(date: Date(), snapshot: snapshot, entry: chosen ?? snapshot?.entries.first)
    }

    /**
     When to come back.

     Sunday afternoon is worth a quarter of an hour; a Tuesday is not. WidgetKit treats this as a
     hint and rations refreshes across the day anyway, so asking for every minute during a game
     would not get it — it would only spend the budget before the games that matter.
     */
    private func nextRefresh(after entry: TallyTimelineEntry) -> Date {
        let now = entry.date
        guard let week = entry.entry else { return now.addingTimeInterval(4 * 3600) }
        if week.liveCount > 0 { return now.addingTimeInterval(15 * 60) }
        // Nothing of theirs is on, but a kickoff is coming: wake up just after it.
        if let kickoff = week.nextKickoff, kickoff > now {
            return min(kickoff.addingTimeInterval(5 * 60), now.addingTimeInterval(4 * 3600))
        }
        // Their five are done. The board can still move, so this is not "never" — just slower.
        return now.addingTimeInterval(week.picksSettled ? 2 * 3600 : 4 * 3600)
    }

    /// Fetch, and write what we find back to the shared container so the app sees it too. Silent
    /// on failure: the snapshot already on screen is better than an error where a score was.
    private func refreshIfPossible() async {
        guard let session = WidgetSessionStore.read() else { return }
        let existing = WidgetStore.read()
        let service = PoolService(client: APIClient(pool: session.pool, auth: { session.headers }))
        do {
            let fresh = try await WidgetRefresh.snapshot(
                service: service,
                pool: session.pool,
                poolName: existing?.poolName ?? session.slug,
                entries: []
            )
            WidgetStore.write(fresh)
        } catch {
            // No network, an expired token, a Worker mid-deploy. None of it is worth a blank tile.
        }
    }
}

// MARK: The sample

/// A week that reads like a real one, for the widget gallery. Marked as a sample by being somebody
/// else's names — never dressed up as the reader's own figures.
enum Sample {
    static let snapshot = WidgetSnapshot(
        poolName: "High Five",
        poolSlug: "high-five",
        origin: URL(string: "https://playtally.app")!,
        week: 3,
        updatedAt: Date(),
        entries: [
            WidgetEntry(
                id: "sample",
                name: "Parker",
                slots: [
                    WeekActivity.Slot(rank: 1, team: "BUF", state: .won),
                    WeekActivity.Slot(rank: 2, team: "KC", state: .live),
                    WeekActivity.Slot(rank: 3, team: "SF", state: .won),
                    WeekActivity.Slot(rank: 4, team: "DAL", state: .lost),
                    WeekActivity.Slot(rank: 5, team: "NYJ", state: .waiting),
                ],
                points: 8,
                possible: 5,
                place: 2,
                field: 12,
                nextKickoffEpoch: Int(Date().addingTimeInterval(3600).timeIntervalSince1970),
                weekTop: [
                    WidgetStanding(place: 1, name: "Sam", points: 11, isMe: false),
                    WidgetStanding(place: 2, name: "Parker", points: 8, isMe: true),
                    WidgetStanding(place: 3, name: "Alex", points: 7, isMe: false),
                ],
                seasonPlace: 3,
                seasonPoints: 24,
                seasonField: 12,
                seasonTop: [
                    WidgetStanding(place: 1, name: "Sam", points: 31, isMe: false),
                    WidgetStanding(place: 2, name: "Jordan", points: 27, isMe: false),
                    WidgetStanding(place: 3, name: "Parker", points: 24, isMe: true),
                ],
                seasonStarted: true
            )
        ],
        seasonStartsAt: 2
    )
}
