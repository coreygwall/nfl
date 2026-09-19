# Working in this repo

Tally (`playtally.app`) is one Cloudflare Worker serving a Hono API, a D1 database, a React web
app and, since the `ios/` folder arrived, a native SwiftUI client. `README.md` explains how the
pool plays and how it is deployed; `ios/README.md` is the runbook for the app. This file is only
for the things a session cannot work out by reading the code.

## Apple developer account

| Fact | Value |
| --- | --- |
| Apple Team ID | `8445LWRG3B` |
| iOS bundle id | `app.playtally.ios` |
| Combined app id | `8445LWRG3B.app.playtally.ios` |

That combined id is what `APPLE_APP_IDS` in `wrangler.jsonc` holds, and it is what the Worker
publishes at `/.well-known/apple-app-site-association` (`worker/apple.ts`) to let the iOS app use
the domain's passkeys and open `/p/*` links. It is **not a secret** — every app using associated
domains publishes its Team ID in that same file — so it belongs in config rather than a secret
store. `APPLE_APP_STORE_ID` is still empty and turns on Safari's "Open in the app" banner once
the app has an App Store listing.

## Push notifications

Everything is built and nothing sends. The Worker registers device tokens, works out what to say
and stays quiet, because one thing is missing and only an Apple developer account can supply it:

```sh
# Keys ▸ + ▸ tick "Apple Push Notifications service (APNs)" ▸ Continue ▸ Register ▸ Download.
# The .p8 downloads once and cannot be downloaded again.
npx wrangler secret put APNS_KEY   # paste the whole .p8, BEGIN/END lines and all
```

Then put the key's 10-character Key ID into `APNS_KEY_ID` in `wrangler.jsonc` (it is not a secret —
it travels in the header of every push) and deploy. `APPLE_TEAM_ID` and `APPLE_BUNDLE_ID` are
already there.

The same key is what lights up **Live Activities**, which are pushed rather than polled:
`worker/activities.ts` rewrites every registered lock screen on each cron sweep, addressed to the
`<bundle>.push-type.liveactivity` sub-topic. Until the key exists it reports `skipped` and the lock
screen only moves while the app is open — which is the one time nobody is looking at a lock screen.

Nothing else needs doing in the developer portal for push. The Push Notifications capability is in
`ios/Tally/Tally.entitlements`, and Xcode enables it on the App ID itself when it provisions with
automatic signing — the same way it already handles associated domains. The **App Group** the
widgets read is the one identifier Xcode may ask permission to register; `ios/README.md` has the
click-by-click version of all of this under *Switching it on*.

A half-finished setup used to report `no APNs key configured` even when the key was the part that
*was* done — `missingApnsConfig` names the actual gap now, because the ten-character Key ID in
`wrangler.jsonc` is the piece that gets forgotten and the `.p8` is the piece that takes effort.

## Notifications: what is built, and the one switch that was decoration

Three kinds, all written and all tested: `picksDue` (two anchors a week — the first game, and again
before Sunday), `segment` (one message per *slate* that settles, because `shared/segments.ts` splits
a week into Thu / Fri / Sat / Sun early / Sun late / Sun night / Mon, which is the unit people talk
in) and `weekDone` (where you finished, and where that leaves the season). The wording lives in
`shared/notify.ts` so every message the app can send can be read in one file.

`push_tokens.prefs` existed from the start and **nothing read it** — `dispatchNotifications` sent
every message to every device, so a settings screen built against it would have been a row of
controls that did nothing. `shared/notify-prefs.ts` is now the one rule (`allows`), and two things
about it are load-bearing:

- **Absent means on**, everywhere: a malformed blob, an unknown key, an empty object, all mean
  everything. The opposite turns a deploy into a phone that has gone quiet with nothing on screen
  to say why.
- **Registration never writes prefs.** `POST /push` runs on every launch, so an upsert that carried
  preferences would reset them to whatever that build happened to send. They have their own
  endpoint (`PATCH /push/prefs`).

A message *nobody has switched on* is claimed and counted as `muted`; a message with **no device at
all** is left unclaimed, so a phone that registers an hour later still hears about the slate. Those
are different facts and conflating them swallows notifications permanently.

## Dark mode is a re-light, not an inversion

`src/index.css` holds the reasoning and the hex values; `ios/TallyKit/Sources/TallyKit/Design/Palette.swift`
mirrors them as `Color(light:dark:)` pairs that resolve at draw time, so `.preferredColorScheme` on
the root re-lights every screen without a call site knowing. It lives in TallyKit rather than the
app because **the widget extension cannot see the app target** — when the Live Activity needed
these colours it grew a private copy of seven of them as flat light hexes, which is how that
surface shipped with no dark mode at all. `themeParity.test.ts` now fails if either iOS target
writes a hex of its own. Three things make the palette work:

- **`ink` draws text *and* the 2pt border**, so flipping it would turn every hard offset shadow
  white. `Color.shadow` / `--color-shadow` is separate and stays black.
- **`surface` is where the light theme said white** — cards sit a step above a warm dark ground.
  There is no `bg-white` or `Color.white` left outside team-coloured fills.
- **`onFill` / `--color-on-turf`** is the label on a filled accent: white on the deep light-theme
  green, black on the lighter dark-theme one. The yellow flag always takes black (`onAccent`).

Every pair clears 4.5:1; the tightest is ink-3 on paper-2 at 4.76. The preference is `tally.theme`
in localStorage / UserDefaults, absent meaning "system", and `index.html` applies it inline before
the first paint so there is no white flash.

## The widget extension can see two things, and only two

`TallyWidgetsExtension` draws the Live Activity, three home-screen widgets and three lock-screen
accessories. It cannot see the app target at all — not its asset catalog, not its design system, not
its model. It has exactly two doors:

| Door | What comes through | Named in |
| --- | --- | --- |
| `TallyKit` | the palette, the rules, the models, `WidgetSnapshot` | both targets link the package |
| App Group `group.app.playtally.ios` | the snapshot the app leaves for it | both `.entitlements` files |
| Keychain group `$(AppIdentifierPrefix)app.playtally.shared` | one read-only session, so the widget can refresh itself | both `.entitlements` files |

Three rules follow, and each of them has already been learned the hard way:

- **Never reach for an app asset.** `Image("TallyMark")` builds and then draws nothing. Anything the
  extension needs is drawn in code or lives in TallyKit.
- **Never copy a colour.** That is how the Live Activity shipped with no dark mode — see the dark
  mode section. `themeParity.test.ts` fails if either target writes a hex.
- **The extension's Info.plist and entitlements sit *beside* `TallyWidgets/`, not inside it.** The
  target's sources are a `PBXFileSystemSynchronizedRootGroup`, so a file in that folder is also
  copied in as a resource, and a file that is both processed and copied is "Multiple commands
  produce" — a build failure.

The shared Keychain item is deliberately a *second* item rather than the app's session moved into
the group: a Keychain lookup is scoped by access group, so re-homing the existing one would hide it
from the app that wrote it and sign every install out on update. If it is missing the widget still
draws from the snapshot and simply does not refresh.

## Two families of contest, and one home between them

The app holds a **pool** (a season, Pool · Picks · Board) and, behind a Labs switch, a **golf card**
(an afternoon, Round · Tally · Scorecard). `docs/navigation.md` is the reasoning; the rule is three
sentences: **the first tab is everywhere you can stand, the rest are the contest's, Account is
always last.** Home — the app's, not the pool's — is the first tab of both shells and the only
switcher: every pool and card on the phone as one card each, the ones that want something first and
dressed to say so, with the count on the tab. The tab bar after it belongs to the family you are in
— no Board on a card, no Round in a pool. The header at the top of a contest's own tabs names where
you are and opens nothing; it was a chip in the navigation bar and the switcher once, and a second
switcher two taps from the first is how apps grow eleven tabs.

`AppModel.context` holds the one fact (pool, or card *X*), `RootView` is the only place that reads
it to choose a shell, and `PoolShellView` / `GolfShellView` do not import each other. The shared
surface is exactly three things: the design system, `HubView`, and `AccountView(inPool:)`. **A
third family is a new shell plus a case on `ContestContext`** — if it needs an edit to
`PoolShellView`, the seam has been crossed and the blast radius is no longer zero.

Home draws every pool from the widgets' own projection: `HubModel` asks each pool with its own
Keychain session and runs the answer through `WidgetRefresh`, so a card on the tab and a widget on
the home screen cannot disagree about whose picks are in, and the roster is the server's
`myEntries` rather than the device's cache. `Hub` in TallyKit is the one rule for what a card wants
(`HubAttention`: needs you › live › waiting › done) and how it says so — "picks due tonight ·
8:15 PM" is a tested sentence, not a view's guess. **A launch does not land on Home**: `tab`
starts on the pool, because a phone that was in a pool last night is still in it this morning, and
Home is one tap left with a badge if anything is owed. None of this is the web's; a pool *is* an
address there.

**One card shell, and the family only fills the body.** `ContestCard` in `HubView.swift` owns the
badge, the name, the line under it, the divider, the chevron, the padding and the tap; a pool puts
its entries in the body and a card puts its players there. That is the whole reason the two read
as one kind of object on a screen that holds both, and it is why a third family costs a body
rather than a card. The body has a *floor* rather than a fixed height (`contestBodyMinHeight`),
which is the one concession to content: a pool with four entries has more to say than a card
nobody has teed off on, and clipping it to match would throw away the thing the card exists for.
`HubAttention` is the only input to how a card is dressed — flag and hard shadow for something
owed, a hard shadow for something happening, flat otherwise — decided in the shell and nowhere
else, so nothing can look urgent without being urgent. The golf card's score used to hang off the
right-hand edge of its header, which is how a card two taps from a pool came to look like a
different app's idea of a list row.

Under the cards is **the carousel of what you could start**, and then one button to join. Every
tile wears a *drawn symbol* rather than one of the three marks, deliberately: the marks say which
family a contest you are standing in belongs to, and nothing in the carousel has been started, so
there is no family to name — and a pool played over four days of golf would otherwise have to wear
the football, which is the mistake the marks were split up to avoid. A type that cannot be started
yet says so rather than offering a button that apologises; today that is everything except a golf
card, because the Worker that serves a pool is still the thing that creates it.

Golf is off by default (Account ▸ Settings ▸ Labs). Off means the menu draws exactly as it did and
the golf shell is unreachable; off is not a reset, so the cards stay on the phone. `TallyKit/Golf/`
holds the whole model and draws nothing: a scramble is a list of strokes with a name on each and the
score is the count, a **tap-in** counts on the card and credits nobody, a **penalty** and a
**nobody's ball** do the same, and a fifty-foot putt is just a shot with a name — which is the one
distinction the whole feature exists for. One phone keeps the card today; every hole carries
`updatedAt` so sharing is a merge rule rather than a rewrite.

Beside the round are **the two bets** (`SideContests.swift`): longest drive and closest to the pin,
each switched on per card. Three rules hold the feature together, and the second and third are only
obvious once the first is true:

- **Par decides where a contest runs, and nothing else does.** A par five hosts a longest drive, a
  par three a closest to the pin; there is no stored list of contest holes. There cannot be, because
  par is corrected from the tee you are standing on (`ParChip`) — a list written at setup would be
  wrong the moment the fourth turned out to be a three, and derived it is right the instant the par
  is.
- **So an award stores which contest it was**, not just who won. Par can move *under* a claim, and
  an award that only said "Dan" would be silently reinterpreted as the other contest when it did.
  Stored, it stops counting (hole 7 hosts nothing now) without being destroyed, and comes back
  whole if the par comes back — the same posture as shortening a round to nine.
- **Points are a second leaderboard, and stay off until asked for.** `PointValues` prices a shot
  kept, a longest drive and a closest to the pin; `ScrambleTally.points` reads them. When they are
  on they are the board the Tally tab shows *first*, because a group that sat down and priced a
  closest to the pin did it to decide something, and the board that decides should not be the one
  you have to tap to reach. Shots kept is the other half of one segmented control.

Claiming one is a row of names under the hole header on the Round tab — tapping the name already on
it takes it back, so claim, change and undo are one gesture with no mode to be in. It is drawn on a
finished hole too, because an award changes no score and the argument about who was closest outlives
the putt. The **Side games** card on the Tally tab is the separate component: a tile per contest
hole, dashed while it is open, and every tile is a way back to that tee.

**`ScrambleCard` and `HoleEntry` decode by hand, and every field added to them from here on must
too.** Swift's synthesised decoder throws on a missing key rather than falling back to the
property's default, and `CardCatalog.load` turns a throw into an empty catalogue — silently. A
synthesised decoder on either of them would have deleted every round anybody had ever kept on the
update that shipped `contests`, `points` and `awards`. `ScrambleTests` pins the old shape.

A round reaches the other three as a **drawn card, not a paragraph** (`ShareCardView` rendered by
`ImageRenderer` at 3x, previewed in `ShareCardSheet`): a result is text, a trophy is a picture, and
a picture is what gets re-shared in a thread. It is also the only marketing this feature does, which
is why the poster is in the app's own paper and ink and is always rendered in the **light** palette
— a card that leaves the device should look the same to everybody. The share carries **no text
body**; `ScrambleTally.summary` survives only as the fallback for a render that returns nil. The
footer's `playtally.app` is the seam for the link that belongs there once there is a recap to point
at or an App Store listing.

**One badge, and what sits inside it says which contest.** Three marks share the same yellow
ground, ink and border: `TallyMark` is the app's — four uprights and the fifth stroke through them,
drawn by a hand rather than a ruler, with a cut of the ground down the fifth — and it is the icon,
the lockup and the welcome screen; `FootballMark` is a pool's, on the
pool chip, the pager and Home's pool cards; `GolfMark` is a card's, on the golf chip and the
poster. The app's own mark is the tally rather than the football because the app is the count and
a football is one of the things it counts — the golf card is what showed that: a card three people
just played should not be selling football to them, and a third family should cost a badge, not a
brand. All three are rasterised at 1x/2x/3x from SVG (`public/icon.svg`, `public/football.svg`,
`public/golf.svg`) by `scripts/build-ios-assets.ts`, which also writes the app icon and the web's
touch icon from the same glyph, so they are **app-target assets and so invisible to the widget
extension** — a lock screen that wants the mark draws it with `TallyGlyph` in TallyKit, which is
also what the app's loader draws through, so there is one set of strokes. The mark has **two sets
of weights, not one**: in the dark the strokes are 8% lighter and the cut 40% wider, because a
light stroke on a dark ground swells where a dark stroke on a light one shrinks, and drawn at the
light weights the dark cut nearly closed. The icon script, `TallyGlyph` and `TallyLoader.tsx` each
carry both sets; change one and change all three. The tee is what makes the golf ball legible at
22pt: a bare ball is a circle with specks on it.

The round's Live Activity is the one lock screen in the app that **needs no APNs key**: a scramble
has no feed, so every change is a tap in this app and `RoundActivityService` updates the activity
itself with `pushType` left nil. Do not give it a token it would never use. It starts on the first
stroke rather than when the card is made, because a card set up the night before is not a round.

It also carries its own `widgetURL` (`RoundActivityAttributes.deepLink`/`cardId(in:)`), which
`AppModel.open(_:)` cannot handle: that function is built entirely around `PoolRef.parse` and
forces `.pool` context on anything it accepts, so a round's link is caught in `TallyApp`'s
`onOpenURL` — the one place that holds both models — before it ever reaches `open(_:)`.

## Four tabs in a pool, and what is deliberately not one

Pool · Picks · Board · Account on iOS, after the app's Home; Home · Picks · Board · Account on the
web, where the pool's page *is* the home because a pool is an address there. The pool's page is
about the pool you are standing in: what week it is, whose picks are missing, where you stand, who
took last week. (A golf card has its own three; see above.)

- **Switching pools is the Home tab on iOS, and nothing else.** `AppModel` holds one pool, one
  session, one service; a tap on a card there swaps the whole app — onto the picks if any are
  owed, as the entry that owes them, otherwise onto the pool's page. The header at the top of
  the pool's own tabs (`ScreenHeader`) is the mark and the pool name, and it is a label rather
  than a menu — and it is page content, not a toolbar item, because iOS 26 wraps a leading
  toolbar item in glass sized to its own idea of the width, which for a name was one letter.
  `PoolsView` is only join / start / the catalogue, the way in at the bottom of Home. The pool's
  page does not list the other pools; Home says everything that strip used to. Behind Labs
  (`poolPager`) the Pool tab wears a `PoolPager` row — chevrons, dots, a contained flick — as a
  trial of a second switcher for whoever lives on that tab. It pages by *name*, not the
  catalogue's last-opened order, or the pool you just switched to would jump to the front and
  left/right would shuffle under your thumb. The page reloads rather than slides: a pool is a
  session and a bootstrap, not a page.
- **The web has no switcher at all, and the lockup opens nothing.** A pool *is* an address there:
  the Worker serving a page serves exactly one, so a second pool is a second host, and browser
  storage is per origin — a catalogue of them is not something a tab can hold. The lockup used to
  open a sheet that named the one pool this origin serves and then offered to join another, which
  is a switcher with nothing to switch to; it is a label now, the mark over the pool's name.
  `PoolPlays` (join / start / what Tally plays) is one component behind the two doors that mean
  something here: the account page, and the fold at the bottom of Home. The iOS app keeps a
  catalogue because it can talk to each host in turn.
- **The entry switcher is not in the navigation bar, on either surface.** It is `EntryPicker`, a
  row of names above the picks and above the board — the two places the answer changes anything —
  drawn only when there is more than one name. Home shows every entry already and Account manages
  them. On iOS it used to sit next to the megaphone, which made the megaphone look like part of
  it; on the web the same chip was *also* the account door, so one control held both the
  mid-week question and the once-a-season one.
- **Account is a tab on the web too**, which is how the offices became reachable: `/commissioner`
  and `/league` were routes with nothing in the app linking to them, so a commissioner had to
  remember the address. Both are rows on `src/screens/Account.tsx`, drawn from `roles` in the
  bootstrap, the same rule the app follows. Switching entries clears the pick flow's `step` from
  the query (`EntryPicker`), or the previous entry's "locked in" screen follows you.
- **Rules is not a tab, and on iOS it is not a setting either.** `RulesSheet` on iOS, `/rules` on
  web, linked from Home and the board — and on iOS opened by a question mark in the pool's bar,
  immediately right of the megaphone, on every one of the pool's tabs. It used to be the first row
  under *About Tally* on the account page, which put a fact about **one pool** one line above the
  app's version number; a phone holding two pools had a settings page claiming to explain both.
  Beside the megaphone it is the pool's, the way the megaphone is, and reachable at the moment the
  question actually arrives — mid-pick, where leaving the flow to find an answer means not finding
  it. It opens at a medium detent, draggable to full, which is the announcements peek's shape: two
  controls that behave alike because they are the same kind of thing.
- **Announcements is not a tab either**, and the megaphone differs by surface on purpose. On iOS it
  always opens a peek — a medium sheet of the announcements, whole, with the like in each row —
  from every pool tab, and there is no announcements section on the pool's page; reading a notice
  must not cost you your place in a pick flow, and opening the peek is the reading, so it clears
  the badge. The full feed is behind it only for what a sheet cannot hold: older pages, and the
  commissioner's composer. On web the feed is a section on the pool home, so
  there the megaphone scrolls to it and peeks elsewhere. Read state is the id of the newest post
  the *device* has looked at (`AnnouncementRead`, mirrored from `src/lib/announcementRead.ts`),
  never a count or a timestamp, and never per entry: a phone that picks for the family is one
  reader.
- **Signing out is a button that asks first**, and its word is red while its fill is not.
  `.danger` as a *fill* is the app's vocabulary for irreversible — deleting a golf card takes
  every hole with it — and signing out keeps every pick on the board, so spending the loud red
  there is how it stops meaning anything where it matters. `TallyButtonStyle.label` is the
  override that makes a plain button carry a red word, the same way `Chip` names its label colour.
  It was an underlined link with the reassurance in grey beneath it: a footnote's weight on the
  one control that ends a session, directly under a column of full-width rows that all look like
  the things you tap. The reassurance is in the confirmation now, where somebody is deciding.
- **Pinch does nothing.** `.noZoom()` on the root and on each sheet — there is no zoomable content
  in Tally, so a pinch that scales the page is always an accident.
- Web keeps the pick flow's step in the query string, and `PickFlowRoute` keys the flow by
  identity; the clearing half lives in `EntryPicker` now, next to the switch that causes it.
- **The web tab bar is not drawn while picks are being made** (`useHideNav`) — the tray takes its
  place — so anything that has to be reachable mid-pick needs its own route out. That is what the
  flow's "Go to pool home" link is for, and why the e2e helpers reach Account by address.

## A pool has two ways in, and only one of them can be said out loud

A link was the only way into a pool until `migrations/0012_pool_codes.sql`. It works when the
invitation arrives somewhere you can tap it and not at all when it arrives across a table, because
nobody reads "playtally dot app slash p slash high dash five" to a friend. The join code is the
second way: **three letters, then three digits** — `KDP-472` — minted once per pool and never
rotated by itself.

The shape is the load-bearing part, and it is deliberately *not* the device claim code's (`Codes` /
`shared/codes.ts`, eight characters of one mixed alphabet). Those are different things: a claim
code is a secret that proves a name is yours, so it is long and guessed at behind a lockout; a join
code is a handle, printed in a group chat and typed by whoever wants in. Three consequences follow:

- **One input box tells three things apart** without a round trip — a link has a scheme, a join
  code is 3+3, a claim code is eight of anything. `JoinPoolForm` takes a code *or* a link for
  exactly this reason, and refuses a typo before spending a request on it.
- **Both alphabets drop what people misread**: no I, L or O among the letters, no 0 or 1 among the
  digits. 23³ × 8³ ≈ 6.2 million, which is not a number that needs a plan; the unique index on the
  column is what actually prevents a collision, and `ensureJoinCode` rolls again if it loses.
- **A short list is never minted** (`UNMINTABLE` in `shared/pool-codes.ts`) — a doormat, not a
  censor, the same posture as `shared/profanity.ts`. This is not filtering something a person
  chose; it is not *handing* a code to a pool full of somebody's family.

The rules live twice, once per language (`shared/pool-codes.ts`, `PoolCode.swift`), and
`poolCodeParity.test.ts` fails if either alphabet or either half's length drifts — a Swift build
cannot see the TypeScript, the wire carries a plain string that satisfies both, and the cost of
disagreement is somebody typing the code from the group chat and being told it is not a code.

`GET /api/join/:code` is the one route a stranger is meant to call, and it answers with what the
pool already says at its own public address. A code names a *pool*, not a host, so `joinByCode`
walks the hosts the app can reach — the one it is standing in, the default, then every pool on the
phone — and treats a 404 as an answer rather than a failure. **The code goes to everyone in the
pool, not to its commissioner alone**: the pool's link is already public and this is the same fact
in a sayable form, so a pool grows when the person already in it can invite their brother-in-law
without going through anybody. `ensurePool` mints one for any row that lacks it, which is how the
pool that predates the column got one, and `hasCurrentLegacySchema` in `worker/ready.ts` now checks
for that column too — adopting the revision marker skips `applySchema` entirely, so a check against
an older migration's tables would mark a database current while it was missing this one.

## The roster is the server's; the device only keeps the keys

A phone that picks for a family holds two different things, and conflating them is what made
Declan and Parker vanish from the iOS app while the web showed all three. `SessionStore` (one
Keychain item per host) is a **cache of credentials**: the token, and which name is picking right
now. **Who the account owns** is `myEntries` in every bootstrap, and `AppModel.entries` is the one
property screens read — the picker, the account tab, Home's "who still owes picks", the widget
snapshot. It falls back to the cache only before the first bootstrap lands.

Drawing a roster from the cache looks fine until the cache falls behind, and it can: `reconcile`
is a **silent no-op** whenever the bootstrap comes back without an account (an unrecognised token),
the session is keyed to a host the install has since moved off, or an entry was added on another
device between launches. None of those say anything on screen, which is why the app quietly showed
one name where a family should be. `AppModel.deviceUnrecognised` now says it out loud on the
account tab instead.

Because the list can name an entry this device has never cached, **`switchTo` adopts**: tapping a
name that is not in the store saves it there first, with the *account's* token, since a managed
entry has none of its own. Without that the tap would move the highlight and change nothing else.
`SessionStoreTests.swift` pins both halves.

**None of that helps a player who was never linked in the database.** `entries` and `myEntries`
both read `entry_owners`, and that table only ever gained a row from `POST /entries` — creating a
managed entry and owning it happen in the same transaction, and there was no other way in. A name
that joined the pool on its own, the way most of the roster does (`POST /players` then
`/players/:id/claim`), has no owner and never will unless someone gives it one, however correct the
client gets about reading `myEntries`. Two routes attach one after the fact, both landing on the
same `entry_owners` insert and both confirmed on the client before calling it, the same as
reset-access and remove — at least as consequential as either, since unlike them it also switches
off the player's own `/players/:id/claim` path for good:

- **`POST /entries/attach`** — self-service, for any signed-in account. Proved with the same code
  `/players/:id/claim` already accepts for a fresh device: if that is enough to sign in as
  somebody, it is enough to say they are yours to manage. Shares that route's brute-force lockout
  (`isLockedOut`/`noteClaimFailure`/`MAX_CLAIM_ATTEMPTS`) rather than opening a second unguarded
  way to guess a code. Surfaced next to "Add an entry" on Account, both surfaces.
- **`POST /commissioner/players/:id/attach`** — the recovery path, for exactly the name a code
  cannot rescue: one created before codes existed (`claimCode` null — a real state in production,
  not a hypothetical) or one whose owner has simply forgotten it. Needs no code at all, because
  commissioner authority already substitutes for one, but — like the self-service route — only
  ever attaches onto the *calling* account, never a third party's.

## One Sunday, one set of words

A week in progress is described in three places at once — the lock screen, the home-screen widgets
and the Picks tab — so the rule that decides *what is happening* lives once per language and
nowhere else: `shared/live-activity.ts` for the Worker and the web, `WeekActivity.swift` for the
app and its widgets. Five phases rather than "running" and "over", because the two in the middle
are what a Sunday is actually made of: `between` is half past three with the early games in and the
late ones not yet on, `watching` is the hour after your last pick has played when your points are
fixed and your place is not. Both used to end a Live Activity, which is precisely when somebody
wants one.

`statusLine` is the sentence each phase says, and `liveActivityParity.test.ts` compares the two
implementations phrase by phrase in both directions — reword one and it fails naming the other.
It strips comments first, because the comments quote the sentences they explain. The same test
holds the pairing on the number: before anything settles the *stake* leads ("15 to play"), because
a big honest 0 is discouraging; after that the points lead with what is still out there behind them.

The home page's weekly card follows the same instinct one level up. `previewWeek`
(`src/lib/poolHome.ts`, mirrored by `PoolHome.previewWeek` in TallyKit) picks **the newest week
that has kicked off**, not the newest week that has finished: `latestCompletedWeek` led with Week 1
for the four days between Thursday night and Sunday afternoon of Week 2, so the game everybody had
just watched went unmentioned on the page that exists to mention it. `final` is a separate fact —
every game has a result — and only it may wear the `Final` chip and the words "results" and
"Latest weekly winner"; a week in flight says "This week so far" behind an `In progress` chip. The
chip was always the problem, not the week: a live board under a `Final` chip is a lie, a live board
under an honest one is the most interesting thing on the page.

## Two offices, one PIN that is no longer a login

`migrations/0010_roles.sql` split what used to be "admin" in two:

- **Commissioner** (`pool_commissioners`) runs one pool — roster, name, invite, export. `/api/commissioner/*`.
- **Super admin** (`platform_admins`) runs the league — results, schedule, feed. `/api/league/*`.
  Every pool scores the same NFL games, so results are never a commissioner's to set.

Both are grants against an **account** (the owner player row), never a managed entry, and both are
reported in `/api/bootstrap` as `roles` so a client can hide what it cannot open rather than
guessing from a stored secret. `ADMIN_PIN` now does exactly one thing — `POST /api/roles/claim`
attaches both offices to the calling account — and stays valid as a break-glass header on both
route groups. There is one `pools` row today, seeded from `POOL_SLUG`/`POOL_NAME`; `currentPool()`
in `worker/roles.ts` is the seam where a second one arrives.

## Deploying is a merge into `main`

Cloudflare Workers Builds deploys from **`main`**, so a merge there is a release and every other
branch is only a preview URL. Nothing is pushed to `main` directly: work goes on a feature branch
and arrives through a pull request, which is what lets the `CI` check stand between a mistake and
the people making picks.

`claude/nfl-pool-app-9tv2om` is the branch that used to deploy, kept only because old pull requests
and links name it. **Pushing to it releases nothing** — which is the one way this move can still
bite, because a push there looks exactly as successful as it always did.

This matters for Apple: the app's entitlements name `playtally.app`, so the association file has to
reach production — a merged pull request — before the app will honour it. A preview URL is never
enough. `README.md` has the cutover steps, kept for the next time a branch has to change.

## Before opening a pull request

The `CI` check runs these, and a pull request cannot merge until it passes — but running them first
is faster than a review cycle, and they take about a minute:

```sh
npm run typecheck && npm test && npm run test:e2e
```

Swift is built by `.github/workflows/ios.yml` on a macOS runner; there is no Swift toolchain in
the Linux dev container, so iOS compile errors surface in CI rather than locally.
