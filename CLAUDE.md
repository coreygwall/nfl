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

## Four tabs, and what is deliberately not one

Home · Picks · Board · Account, on both surfaces. Home is the landing and is about the pool you are
standing in: what week it is, whose picks are missing, where you stand.

- **Switching pools is not a tab, and on iOS it is not a sheet either.** `AppModel` holds one pool,
  one session, one service; switching swaps the whole app and keeps the tab you were on. The
  control is `PoolChip` — the mark and the pool name, top-left of *every* tab, Home included (Home
  wears the fuller lockup in the same spot) — and it is a native `Menu` with the pools ticked, so it
  reads as a switch. `PoolsView` is only join / start / the catalogue, behind the menu's last item.
  Home lists the *other* pools as a strip under its card, each with one line from its own session
  (`PoolPeek`) saying whether anything over there needs picks; that strip is the one cross-pool
  fact the chip cannot say. Web still uses `PoolSheet` off the lockup.
- **The entry switcher is not in the navigation bar.** On iOS it is `EntryPicker`, a row of names
  above the picks and above the board — the two places the answer changes anything — and it is
  drawn only when there is more than one name. Home shows every entry already and Account manages
  them. It used to sit next to the megaphone, which made the megaphone look like part of it.
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
- Web keeps the pick flow's step in the query string, so switching entries clears it
  (`AppShell.onSwitch`) and `PickFlowRoute` keys the flow by identity. Without both, the previous
  entry's "locked in" screen follows you.

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
