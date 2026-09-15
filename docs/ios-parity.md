# iOS parity backlog

This is the durable list of product behavior intentionally shipped on web first. Update it when a
web-only decision is made, and remove an item only after the native implementation ships.

## Pool home and navigation

- [ ] Make the native pool home the default destination for an old/shared pool link. It should let
  participants browse without making picks and provide direct routes to upcoming picks, the latest
  weekly results, season standings, and older weeks.
- [ ] Add the compact latest-completed-week leaderboard to native home: top three names and points,
  expandable revealed team picks, a full-week leaderboard link, and links to earlier completed weeks.
- [ ] Add the season leaderboard preview to native home: top three after scoring begins, a full-board
  link, and explicit “starts Week 2” copy before then.
- [ ] Add the time-boxed “The pool is still open” invite card through Sunday of Week 2 at 1 p.m. ET,
  using the native iOS share sheet. Supporting copy should use the full card width.

## Announcements

- [ ] Build the native announcement feed and account-level likes using the existing shared API.
- [ ] Put announcements below the weekly and season standings previews on native home.
- [ ] Add a megaphone control to the native header with a new-message count badge. Opening it should
  move to the announcements section and mark the newest visible announcement as read.
- [ ] Persist announcement read state per pool on-device so switching managed family entries does not
  make the same post appear new again.

## Web behavior to preserve when matching native

- “New” is device-local and based on the newest announcement the person has actually viewed.
- Disabled announcement feeds do not show the header control or unread count to participants.
- Counts above nine display as `9+`.
