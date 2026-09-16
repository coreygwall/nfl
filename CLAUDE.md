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

## Two families of contest, and one chip between them

The app holds a **pool** (a season, Home · Picks · Board) and, behind a Labs switch, a **golf card**
(an afternoon, Round · Tally · Scorecard). `docs/navigation.md` is the reasoning; the rule is three
sentences: **the switcher is global, the tabs are the contest's, Account is always last.** So the
chip top-left never moves and lists everywhere you can stand, while the tab bar under it belongs to
the family you are in — no Board on a card, no Round in a pool.

`AppModel.context` holds the one fact (pool, or card *X*), `RootView` is the only place that reads
it to choose a shell, and `PoolShellView` / `GolfShellView` do not import each other. The shared
surface is exactly three things: the design system, `PoolMenu`, and `AccountView(inPool:)`. **A
third family is a new shell plus a case on `ContestContext`** — if it needs an edit to
`PoolShellView`, the seam has been crossed and the blast radius is no longer zero.

Golf is off by default (Account ▸ Settings ▸ Labs). Off means the menu draws exactly as it did and
the golf shell is unreachable; off is not a reset, so the cards stay on the phone. `TallyKit/Golf/`
holds the whole model and draws nothing: a scramble is a list of strokes with a name on each and the
score is the count, a **tap-in** counts on the card and credits nobody, a **penalty** and a
**nobody's ball** do the same, and a fifty-foot putt is just a shot with a name — which is the one
distinction the whole feature exists for. One phone keeps the card today; every hole carries
`updatedAt` so sharing is a merge rule rather than a rewrite, and `ScrambleTally.summary` is how a
card reaches the other three in the meantime.

The round's Live Activity is the one lock screen in the app that **needs no APNs key**: a scramble
has no feed, so every change is a tap in this app and `RoundActivityService` updates the activity
itself with `pushType` left nil. Do not give it a token it would never use. It starts on the first
stroke rather than when the card is made, because a card set up the night before is not a round.

## Four tabs in a pool, and what is deliberately not one

Home · Picks · Board · Account, on both surfaces. Home is the landing and is about the pool you are
standing in: what week it is, whose picks are missing, where you stand. (A golf card has its own
three; see above.)

- **Switching pools is not a tab, and on iOS it is not a sheet either.** `AppModel` holds one pool,
  one session, one service; switching swaps the whole app and keeps the tab you were on. The
  control is `PoolChip` — the mark and the pool name, top-left of *every* tab, Home included (Home
  wears the fuller lockup in the same spot) — and it is a native `Menu` with the pools ticked, so it
  reads as a switch. `PoolsView` is only join / start / the catalogue, behind the menu's last item.
  Home lists the *other* pools as a strip under its card, each with one line from its own session
  (`PoolPeek`) saying whether anything over there needs picks; that strip is the one cross-pool
  fact the chip cannot say.
- **The web has no switcher, and stopped pretending to.** A pool *is* an address there: the Worker
  serving a page serves exactly one, so a second pool is a second host, and browser storage is per
  origin — a catalogue of them is not something a tab can hold. `PoolSheet` off the lockup names
  the pool you are standing in and hands over to `PoolPlays` (join / start / what Tally plays),
  which is one component behind three doors: that sheet, the account page and the fold at the
  bottom of Home. The iOS app keeps a catalogue because it can talk to each host in turn.
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
- **Rules is not a tab.** `RulesSheet` on iOS, `/rules` on web, linked from Home and the board.
- **Announcements is not a tab either**, and the megaphone differs by surface on purpose. On iOS it
  always opens a peek — a medium sheet of the unread ones — from every tab, and there is no
  announcements section on Home; reading a notice must not cost you your place in a pick flow, and
  "Read them all" is a second, deliberate tap. On web the feed is a section on the pool home, so
  there the megaphone scrolls to it and peeks elsewhere. Read state is the id of the newest post
  the *device* has looked at (`AnnouncementRead`, mirrored from `src/lib/announcementRead.ts`),
  never a count or a timestamp, and never per entry: a phone that picks for the family is one
  reader.
- **Pinch does nothing.** `.noZoom()` on the root and on each sheet — there is no zoomable content
  in Tally, so a pinch that scales the page is always an accident.
- Web keeps the pick flow's step in the query string, and `PickFlowRoute` keys the flow by
  identity; the clearing half lives in `EntryPicker` now, next to the switch that causes it.
- **The web tab bar is not drawn while picks are being made** (`useHideNav`) — the tray takes its
  place — so anything that has to be reachable mid-pick needs its own route out. That is what the
  flow's "Go to pool home" link is for, and why the e2e helpers reach Account by address.

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

## Deploying is a push, and only to one branch

There is no `main`. Cloudflare Workers Builds deploys from **`claude/nfl-pool-app-9tv2om`**, so a
push there is a release and anything else is only a preview URL. This matters for Apple: the app's
entitlements name `playtally.app`, so the association file has to reach production before the app
will honour it. `README.md` has the plan for moving to `main`.

## Before pushing

CI does not gate the deploy, so run these first — they take about a minute:

```sh
npm run typecheck && npm test && npm run test:e2e
```

Swift is built by `.github/workflows/ios.yml` on a macOS runner; there is no Swift toolchain in
the Linux dev container, so iOS compile errors surface in CI rather than locally.
