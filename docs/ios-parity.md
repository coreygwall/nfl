# iOS parity backlog

This is the durable list of product behavior intentionally shipped on web first. Update it when a
web-only decision is made, and remove an item only after the native implementation ships.

## Pool home and navigation

- [x] Make the native pool home the default destination for an old/shared pool link. It should let
  participants browse without making picks and provide direct routes to upcoming picks, the latest
  weekly results, season standings, and older weeks.
- [x] Add the compact latest-completed-week leaderboard to native home: top three names and points,
  expandable revealed team picks, a full-week leaderboard link, and links to earlier completed weeks.
- [x] Add the season leaderboard preview to native home: top three after scoring begins, a full-board
  link, and explicit “starts Week 2” copy before then.
- [ ] ~~Add the time-boxed “The pool is still open” invite card~~ — **dropped, not deferred.** The
  card was hard-coded to expire at Sunday of Week 2, 1 p.m. ET; by the time native home shipped
  there were days left on it. Sharing a pool from the phone already exists in three other places
  (the pick flow, the commissioner screen, and the account screen). If an invite prompt belongs on
  home permanently, that is a new design rather than a port of this one.

## Announcements

- [ ] Build the native announcement feed and account-level likes using the existing shared API.
- [ ] Put announcements below the weekly and season standings previews on native home.
- [ ] Add a megaphone control to the native header with a new-message count badge. Opening it should
  move to the announcements section and mark the newest visible announcement as read.
- [ ] Persist announcement read state per pool on-device so switching managed family entries does not
  make the same post appear new again.

## Web-side follow-ups this parity work turned up

- The season preview button on web home reads “Season standings · starts Week 2” at all times,
  including mid-season when the race is weeks old. Native says “Full season standings” once
  `throughWeek > 0` and keeps the “starts Week N” wording only before then; web should match.

## Web behavior to preserve when matching native

- “New” is device-local and based on the newest announcement the person has actually viewed.
- Disabled announcement feeds do not show the header control or unread count to participants.
- Counts above nine display as `9+`.
