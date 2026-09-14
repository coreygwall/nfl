# Tally for iOS

The native app for [playtally.app](https://playtally.app). Same Worker, same D1, same account: a
name claimed on the website is the same name here, a passkey made in Safari signs in here with
Face ID, and picks made on a phone show on the laptop's board a second later. Nothing in the
Worker was forked for it — the app talks to the API the site already exposes, plus one file
Apple asks for.

```
ios/
  Tally.xcodeproj/     the project (synchronized folders: drop a file in, it is in the build)
  Tally/               the app — SwiftUI, iOS 26, Liquid Glass chrome over Tally's own cards
    App/               AppModel (one pool, one session, the bootstrap), Loadable
    Design/            the design system ported from src/index.css: paper, ink, hard shadows, fonts
    Shell/             tabs, header, account sheet, toasts
    Features/          Welcome · Home · Picks · Board · Rules · Office · Pools — one folder per screen
    Resources/Fonts/   Bricolage Grotesque + Inter as static TTFs (scripts/build-ios-fonts.py)
    Assets.xcassets/   32 team stickers, the mark and the icon (scripts/build-ios-assets.ts)
  TallyKit/            a Swift package with everything that is not a screen
    Models/            the API contract (mirrors shared/api.ts), Sport + Team, pool types
    Rules/             what shared/*.ts knows: locks, scoring, drafts, codes, names
    Networking/        APIClient, PoolService (one function per route), the server clock
    Auth/              Keychain, the identity store, base64url, PasskeyService
    Tests/             XCTest: rules, URL parsing, decoding the Worker's real JSON shapes
  project.yml          XcodeGen fallback if the .pbxproj ever refuses to open
```

## Getting it on a phone (TestFlight by week 2)

Everything below is done once. Order matters for step 3: Apple caches the association file, so
publish it before the first install.

1. **Open `ios/Tally.xcodeproj` in Xcode 26.** Select the *Tally* target → *Signing &
   Capabilities* → choose your team. Xcode fills in the provisioning; the bundle id is
   `app.playtally.ios` (change it there and in `project.yml` if you want another). The
   *Associated Domains* capability is already in `Tally/Tally.entitlements`
   (`webcredentials:playtally.app`, `applinks:playtally.app`).
   The copy adapts to the hardware — `Biometry.label` reads `LAContext.biometryType`, so a
   Touch ID iPad says "Touch ID" rather than lying about Face ID.
2. **Note your Team ID** — ten characters, like `ABCDE12345`. The reliable place is
   [developer.apple.com](https://developer.apple.com/account) → *Account* → *Membership details*.
   Xcode → *Settings* → *Accounts* → your team shows it too, and once Xcode has made a
   provisioning profile it is the prefix of the App ID in *Signing & Capabilities*.
3. **Tell the domain about the app.** In `wrangler.jsonc` set
   `"APPLE_APP_IDS": "ABCDE12345.app.playtally.ios"`, then get that onto **production** — the
   branch Cloudflare deploys from, which today is `claude/nfl-pool-app-9tv2om`. A preview URL is
   not enough: the entitlements name `playtally.app`, so that is the only host iOS will ask.
   Check it landed:

   ```sh
   curl -s https://playtally.app/.well-known/apple-app-site-association
   ```

   Your app id should appear under both `webcredentials` and `applinks`. Without this, Face ID in
   the app fails silently and pool links open in Safari.

   **The Team ID is not a secret.** Every app that uses associated domains publishes it in this
   same file, so committing it is normal and safe.

   **If you are testing before it is live, or you change it:** iOS reads this through Apple's CDN
   and caches the result at install time, so a stale answer can outlast the fix. Two ways out —
   delete and reinstall the app, or bypass the CDN during development by appending
   `?mode=developer` to both entries in `Tally/Tally.entitlements`
   (`webcredentials:playtally.app?mode=developer`) and switching on *Associated Domains
   Development* in Settings → Developer on the device. Take the suffix back off before you
   archive for TestFlight.
4. **Run on your phone** (⌘R with your iPhone selected). Sign in with Face ID if you set it up
   on the web, or with your name and code. Make a pick; check the board on the site.
5. **TestFlight.** Product → Archive → Distribute → App Store Connect → Upload. In App Store
   Connect create the app once (bundle id above, name *Tally*), then under TestFlight add an
   internal group and your friends' Apple IDs — internal testers need no review, and the build
   is on their phones minutes after upload. External groups (public link) need a one-time
   review, usually a day.
6. **Ship the icon.** `AppIcon.png` is the 1024 square; iOS masks the corners. For iOS 26's
   layered icon open it in Icon Composer later; not needed to ship.

Development against a local Worker: `npm run dev` in the repo root, then in Xcode edit the
*Tally* scheme → Run → Arguments and enable `-tally.devPoolURL http://localhost:5173/p/high-five`
(the simulator sees the Mac's localhost). `-tally.nowOverride <ISO date>` is the same time
travel the site has with `?now=`; the Worker honours it only in dev. Passkeys need the real
domain and a signed app, so test those against production with a throwaway name.

## How sign-in works, and why it is the web's

The site's identity is a device token: the Worker hands one to a device when it claims a name
(a new name, a code, a passkey), stores its hash, and reads it back from an `x-player-token`
header. The app does exactly that. The token lives in the Keychain (`SessionStore`), goes on
every request (`APIClient`), and is never backed up to another device — a new phone signs in
again, which is the point.

**The goal is that nobody signs in twice.** Once an account has a passkey, opening the app *is*
the sign-in: `WelcomeView` fires one silent assertion on launch with
`.preferImmediatelyAvailableCredentials`, which shows the system Face ID sheet only if this device
actually holds a passkey for the domain, and fails invisibly otherwise. A returning player sees
Face ID and lands on their picks; a brand-new one sees the name form and never knows a request
happened. Because that only pays off if people *have* a passkey, one is offered after **every**
sign-in that did not already use one — new name, device code, or sign-in link — not just at signup.

Three doors, all the same endpoints the site calls:

| Door | What the app does | Where |
| --- | --- | --- |
| **Face ID** | Asks the Worker for a WebAuthn challenge, has the system sign it with a passkey for `playtally.app`, sends the assertion back in the browser's JSON shape. Because `worker/apple.ts` names the app and the entitlements name the domain, iCloud Keychain offers the *same* passkey the person made in Safari. | `PasskeyService`, `PasskeyFlows` |
| **Name + code** | Roster tap → code → claim. Unclaimed names come free, as on the web. | `WelcomeView`, `PoolService.claim` |
| **Sign-in link** | The commissioner's `…/welcome?claim=<id>&code=<code>` link, tapped in Messages, opens the app (universal link) and signs the phone in. | `AppModel.open(_:)` |

Adding Face ID from the app registers a passkey for the domain, so it also works in Safari — and
the reverse, which is the whole point. The web mirrors the automatic half with conditional UI: its
name field carries `autocomplete="username webauthn"`, so a saved passkey sits in that field's own
suggestions and signing in is tapping your own name.

For anyone who never turns Face ID on, **Send myself a sign-in link** (account sheet → Play on
another device) is the short path: one tap on the receiving device signs it in, and on an iPhone
with the app installed the universal link opens the app rather than Safari.
The Worker change that makes this possible is small: `expectedOrigin` accepts
`https://playtally.app` as well as the page origin (identical in production), and the
association file is served at the path Apple reads.

Account-owned entries (a parent picking for the family) ride on the account's token with the
`x-entry-id` header, exactly as the site does; switching is one tap in the account sheet.

## Built to grow

- **Pools.** `PoolRef` is `origin + slug`. Every request goes through `PoolRef.apiURL(_:)`,
  which is `/api/<path>` today and becomes `/api/pools/<slug>/<path>` in one line when the
  Worker serves more than one pool. `PoolCatalog` keeps every pool the phone has opened;
  tapping a second pool's link adds it, and the account sheet's *Pools* switches between them.
  Sessions are keyed by host, because a Tally account is one name across every pool on it.
- **Pool types.** `PoolTypes` holds the same content as `shared/pools.ts` (High Five live;
  Survivor, Brackets, Majors described). The pick screen is High Five's; a Survivor screen is a
  new `Features/Survivor` folder that `PoolShellView` chooses by the pool's type.
- **Sports.** `Sport` supplies teams; `NFL` is the one implementation. Screens never touch a
  global team table, so a second sport is a new `Sport` plus a folder of stickers from
  `scripts/build-ios-assets.ts`.
- **Two offices.** `Features/Office` is the site's `/commissioner` and `/league`, and neither is
  behind a PIN any more: `BootstrapResponse.roles` says what this account may open, so a player
  never sees a button they cannot use. Results live in the league office because every Tally pool
  scores the same games. The owner PIN survives in one place — `ClaimKeysCard`, reached by opening
  `playtally.app/p/<slug>/commissioner` — and it hands both offices to the signed-in account.

## Design

`Design/` is `src/index.css` in Swift: the paper and ink palette, 2pt borders, 20pt corners,
the 4pt hard shadow (`.card()`), pill buttons that sink when pressed (`.tally(.turf)`), rank and
place badges, the tilted team stickers. Liquid Glass is used where the system would use it and
nowhere else: the tab bar and toolbar (free), the floating pick tray, the toast, the week menu.
Content stays on paper. The two families are registered at launch from `Resources/Fonts`; if a
file is missing the rounded system face stands in rather than a blank.

## Notifications and the lock screen

The app asks for notifications after the first set of picks is locked in — never at launch, which
is the prompt everybody declines — and registers its APNs token on every launch after that,
because Apple reissues tokens without telling anyone.

What gets sent is entirely the Worker's business (`worker/notify.ts`): one message per **slate**
an entry had a pick in, per entry. A slate is how a week actually finishes — Thursday night, the
1:00 games, the 4:00 games, Sunday night, Monday night — rather than one message per game, which
would be five in a row on a Sunday afternoon. There is also a nudge about two hours before a slate
if the five are not in, and a wrap-up with the week's place and the season standing once nothing
is left to play.

`TallyWidgetsExtension` draws the week's Live Activity: the five picks in rank order, the surest
first, each showing what it is worth, with the points banked and still available. It renders teams
as their abbreviation on the team's colour rather than as logos — at the size a lock screen gives
five picks, three bold letters read from arm's length where a squashed logo does not, and it keeps
the extension free of the app's asset catalog. The app keeps the activity current while it is open
and hands the Worker a push token to update it while it is not.

None of it sends until the APNs key is installed. See **Push notifications** in `CLAUDE.md` for the
one command — it is the only part of this that cannot be done from the repository.

## Tests

`cd ios/TallyKit && swift test` runs on a Mac without a simulator: the rules, URL parsing, the
Keychain-free identity store, and decoding of the Worker's actual JSON shapes (the fixtures in
`DecodingTests.swift` are copies of real responses — if a field changes shape on the server,
this is what should go red first). `.github/workflows/ios.yml` runs the same and builds the app
for the simulator on every push that touches `ios/`.
