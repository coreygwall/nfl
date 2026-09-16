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

## Widgets, and the two doors into the extension

`TallyWidgetsExtension` carries the Live Activity, three home-screen widgets (this week's picks,
the week board, the season board) and three lock-screen accessories. It cannot see the app target —
not its asset catalog, not its design system. It has `TallyKit`, an App Group and one shared
Keychain item, and that is all.

**Data comes from two places, in this order.** The app writes a `WidgetSnapshot` into the App Group
container whenever it goes to the background, so a widget is correct the instant it is added and on
a phone that has not been opened since Thursday — it reads in microseconds and needs no network.
Then the widget's own timeline refreshes, using a read-only session in the shared Keychain item, so
a phone left alone all Sunday still moves. A widget with only the first goes stale in a pocket; one
with only the second opens on a placeholder. Neither is acceptable on a Sunday.

Both paths build the snapshot through `WidgetRefresh`, so there is one idea of what the top three
is and one set of rounding.

**Three things will bite you** in this target, and each already has:

- An app asset (`Image("TallyMark")`) builds and then draws nothing. Draw it, or put it in TallyKit.
- A copied colour is how the Live Activity shipped light-only. `themeParity.test.ts` now fails on a
  hex in either iOS target.
- `TallyWidgetsInfo.plist` and `TallyWidgets.entitlements` sit *beside* `TallyWidgets/`, never
  inside it: the target's sources are a synchronised folder, so a file in there is also copied as a
  resource, and processed-and-copied is "Multiple commands produce".

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

None of it sends until the APNs key is installed. That, and one click in Xcode, are the only parts
of this that cannot be done from the repository — the runbook below is all of it.

## Switching it on: the four things only you can do

Everything in the repository is done. The code, the entitlements, the Info.plist keys, the widget
extension's embedding into the app — all of it is committed and builds green on CI. What is left
needs your Apple developer account and your Cloudflare login, which a repository cannot have.

It is four steps and takes about ten minutes. Widgets work after step 1; notifications and Live
Activities need all four.

### 1. Let Xcode register the App Group

Open `ios/Tally.xcodeproj` → select the **Tally** target → **Signing & Capabilities** → make sure
your team is selected. Do the same for the **TallyWidgetsExtension** target.

Both already carry `group.app.playtally.ios` in their entitlements, so this is usually silent —
Xcode creates and registers the group as part of provisioning. If instead you see a red error
saying the provisioning profile *doesn't include the `com.apple.security.application-groups`
entitlement*, click **Try Again** / the **Fix Issue** button beside it. That is Xcode asking
permission to register the identifier, and it only ever has to be granted once.

The Keychain group (`$(AppIdentifierPrefix)app.playtally.shared`) needs nothing at all — a keychain
access group is just a name under your team, not a registered identifier.

**After this step the widgets work.** They read a snapshot the app leaves in the shared container
and need no server key. Long-press the home screen → **+** → search *Tally*.

### 2. Mint the APNs key

At [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers
& Profiles** → **Keys** → the **+** button.

- Give it a name — *Tally push* is fine, it is only a label.
- Tick **Apple Push Notifications service (APNs)**.
- **Continue** → **Register** → **Download**.

Two things to know before you click Download:

- **The `.p8` file downloads once and can never be downloaded again.** Put it somewhere you keep
  things, not in Downloads. If you lose it you revoke the key and make a new one — no disaster,
  but it is ten minutes you would rather not repeat.
- **Never commit it.** It is the credential that lets anything send a push as this app. It belongs
  in the Cloudflare secret store, which is what step 3 is.

On the same page, note the key's **Key ID** — ten characters, like `A1B2C3D4E5`. You need it in
step 4.

### 3. Put the key into Cloudflare

```sh
npx wrangler secret put APNS_KEY
```

It prompts for a value. Paste the **entire contents** of the `.p8` file, including the
`-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, then press enter.

### 4. Add the Key ID and deploy

In `wrangler.jsonc`, set the Key ID you noted in step 2:

```jsonc
"APNS_KEY_ID": "A1B2C3D4E5"
```

Unlike the key itself this is **not a secret** — it travels in the header of every push — so it
belongs in config, committed. Then push to the deploy branch (`claude/nfl-pool-app-9tv2om`), which
is what releases it.

`APPLE_TEAM_ID` and `APPLE_BUNDLE_ID` are already filled in.

### Checking it worked

The cron sweep logs its own state. In the Cloudflare dashboard → your Worker → **Logs**, a firing
with push switched off says exactly what is still missing:

```
notifications {"sent":0,...,"skipped":"push is not configured yet — missing APNS_KEY_ID (wrangler.jsonc, the key's 10-character id)"}
```

Once it is configured that line disappears and you get counts instead. The quickest end-to-end
test is to have somebody not finish their picks a couple of hours before a Thursday kickoff — the
nudge is the first message a week sends.

### If a notification still does not arrive

- **Nothing at all, on a device build.** A build signed by Xcode is reachable only on Apple's
  *sandbox* host; a TestFlight or App Store build only on *production*. The app tells the Worker
  which it is (`PushEnvironment.current`) so this is usually right automatically — but a token
  registered by one kind of build and then used by the other is silently dropped by Apple.
  Reinstalling re-registers it.
- **Some people, not others.** Check the switches: Account → Notifications → *Choose what to hear*.
  A muted entry or a switched-off kind is honoured per device.
- **The lock screen never updates while the app is closed.** That is the Live Activity push path,
  which needs the same key — and also needs Live Activities left on in iOS Settings → Tally.

## Tests

`cd ios/TallyKit && swift test` runs on a Mac without a simulator: the rules, URL parsing, the
Keychain-free identity store, and decoding of the Worker's actual JSON shapes (the fixtures in
`DecodingTests.swift` are copies of real responses — if a field changes shape on the server,
this is what should go red first). `.github/workflows/ios.yml` runs the same and builds the app
for the simulator on every push that touches `ios/`.
