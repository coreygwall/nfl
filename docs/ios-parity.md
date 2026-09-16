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

- [x] Build the native announcement feed and account-level likes using the existing shared API.
  `AnnouncementsFeedSheet` is a sheet rather than a fifth tab or a push, because it has to open
  from any tab *and* from the megaphone's peek, and a sheet is the one presentation that works the
  same from both.
- [x] Put announcements below the weekly and season standings previews on native home.
- [x] Add a megaphone control to the native header with a new-message count badge. On Home it
  scrolls to the section, as on web. Off Home it opens a medium-detent peek with the unread
  previews and a way through to the feed — the web's floating menu, in the native idiom. Reading a
  notice never costs you your place in a pick flow.
- [x] Persist announcement read state per pool on-device so switching managed family entries does not
  make the same post appear new again. `AnnouncementSeen`, in `UserDefaults`, keyed per pool.
- [x] Commissioner posting, editing, deleting and the on/off switch. The composer lives in the feed
  (writing a message to the pool without the last one in front of you is how the same thing gets
  said twice); the switch is in the commissioner's office next to the pool's name and invite, since
  whether the pool has announcements at all is a setting.

### Deliberately not matched

- The web marks the feed read when the section scrolls half into view. Native marks it read when
  the feed sheet opens, and the peek never does — the peek exists to show what is *new*, and
  clearing the badge out from under someone who is still reading the previews is worse than a badge
  that clears one tap later.
- Delete is a native confirmation alert rather than the web's inline red box.

## Web-side follow-ups this parity work turned up

- The season preview button on web home reads “Season standings · starts Week 2” at all times,
  including mid-season when the race is weeks old. Native says “Full season standings” once
  `throughWeek > 0` and keeps the “starts Week N” wording only before then; web should match.

## Web behavior to preserve when matching native

- “New” is device-local and based on the newest announcement the person has actually viewed.
- Disabled announcement feeds do not show the header control or unread count to participants.
- Counts above nine display as `9+`.
