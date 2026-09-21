# iOS UX review — September 21, 2026

Source review against `b2ca169` (PR #49). This is not a simulator usability test.

## Implemented

| Finding | Change |
| --- | --- |
| “Board” does not explain the destination. | Rename the tab to **Standings**, preserving its position and internal route. |
| Historical weeks look like the current week once the toolbar is out of focus. | Add an in-content week heading and an explicit return-to-default-week action on Picks and weekly Standings. Standings returns to the API's board week, which can differ from the upcoming pick week. |
| Two unrelated segmented controls squeeze into a single row. | Give period and sorting separate rows; explain potential points and why the rank badges do not change when sorting. |
| Entry chips are small, and an active entry selected elsewhere can be offscreen. | Use 44-point minimum targets, keep the active name in view, respect Reduce Motion for scrolling, and label the action as picking versus highlighting an entry. |
| Account wears the current pool's header and announcement control despite being a global destination. | Use the Tally header on Account. Pool-specific entries and administration remain explicitly grouped inside Account. |
| A same-week pool switch can retain another pool's view state. | Include host and pool slug in pick/standings view identity. Reject bootstrap and announcement refresh responses after the pool or active entry changes. Cancel leaderboard polling cleanly on departure. |

## Deliberately preserved

- Home is the cross-contest switcher; Pool is the active pool's summary. Golf remains a separate family behind Labs. No tabs removed or routes repurposed.
- Announcements use the existing consistent megaphone/peek pattern, not a new tab or a second feed on Pool.
- Pick submission, locking rules, local draft storage, account ownership and server APIs are unchanged.
- No web, Worker, database, authentication or release configuration changes.

## Verification and release checklist

The macOS iOS workflow must run TallyKit tests and compile the simulator app. This Linux workspace has no Xcode or iOS simulator; a passing compile does not substitute for the following on-device checks before a TestFlight release:

- Open an old pool link; browse Pool, weekly results and season standings without changing picks.
- Select an earlier and a future pick week; confirm the heading, selected week menu value and return action agree. Repeat on Standings while the scoring week differs from the pick week.
- Switch between two pools on the same week; verify names, picks and standings belong to the destination, including with a slow connection.
- Change a family entry from Account, then open Picks and Standings; confirm its chip is visible and its saved picks remain intact.
- Switch tabs while ranking an unsaved draft; return and verify the draft is preserved. Do not use live entries for submission testing.
- Check a small iPhone, large text, VoiceOver, light/dark mode and Reduce Motion. Confirm the five tab labels and full-width sort controls remain usable.

## Follow-ups, not part of this change

- Audit custom fixed-size fonts throughout the app for full Dynamic Type support; changing only these screens would leave inconsistent scaling elsewhere.
- Add native UI automation for pool switching and draft restoration. Current CI compiles the app and unit-tests TallyKit but does not drive the simulator UI.
- Consider pull-to-refresh on read-only pool/standings screens with explicit stale-data feedback, without resetting an active pick draft.
