# App Store launch tracker

The single list of what stands between Tally 1.0 and the App Store. **Claude, Codex and Corey all
work from this file**; it lives in the repo because that is the one place all three can read and
write. `listing.md` beside it is the draft of everything typed into App Store Connect.

## How to use this file

- **Claim before you start.** Put your name and branch in the item's *Owner* cell (`Claude ·
  claude/xyz`, `Codex · codex/xyz`) in the first commit of the branch, so the other agent can see
  it is taken. An item with an owner and no open pull request for a week is up for grabs again.
- **One item, one pull request**, into `main`, and the pull request that does the work also moves
  the item to done. Nothing here is closed by a comment.
- **Keep the rows short.** Put reasoning in the pull request, or in `listing.md` if it is about
  the listing, and link it from here.
- **Merge conflicts in this file are expected.** Keep both sides.

Status: `todo` · `doing` · `blocked` (says on what) · `done` (with the PR) ·
`decide` (needs Corey; the recommendation is in the row)

Owner `Corey` means it needs the Apple account, App Store Connect or a phone, which an agent does
not have.

## 1. Apple will reject without these

| # | Item | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| B1 | **Delete your account in the app** (Guideline 5.1.1(v)). `DELETE /api/me` anonymises the account (D1), with a confirmed button on Account on both iOS and the web, and `/privacy` says what happens. | Claude | done | PR #68. `deleteAccount.test.ts`, plus an e2e test. |
| B2 | **Privacy manifests** for the app and the widget extension. They're needed because the app reads and writes `UserDefaults`. | Claude | done | This PR: `ios/Tally/PrivacyInfo.xcprivacy`, `ios/TallyWidgets/PrivacyInfo.xcprivacy`. |
| B3 | **A way in for App Review.** The demo pool (D2) has a made-up **App Review** player with a season of picks. | Claude | blocked | The code is written. Blocked on C11 (deploying the demo), then an agent reads the code out of the demo database (`demo-pool.md`). |
| B4 | **Report and block for user content** (Guideline 1.2). Names, announcements and golf card names are user content. A profanity screen exists (`shared/profanity.ts`), and announcements are commissioner-only. Still missing: a "Report" action on an announcement and on a board row, plus a published contact. Smallest version: a mailto to `SUPPORT_EMAIL` with the pool, the item and the reporter prefilled. | — | todo | Either agent. |
| B5 | **Support URL.** App Store Connect wants a web page, not an email address. Add `/support` on the web: the contact address, how to recover a lost device, and how to delete your account (Account ▸ Delete account). | — | todo | Either agent. |
| B6 | **A fresh install must not land in High Five.** It used to open straight onto a private group's pool, roster and all. Now it opens on a front door with three ways in: a code, a link, or the demo pool. | Claude | done | PR #68. `FrontDoorView`, `AppModel.needsPool`. |

## 2. Decisions for Corey

| # | Question | Decided |
| --- | --- | --- |
| D1 | What deleting an account does to the board | **Anonymise, don't erase** (Corey, 23 Sep). The name becomes "Former player", and every device, passkey, push token, session and role goes, along with the entries the account manages. The picks stay, so past weeks and payouts don't change. Done: B1. |
| D2 | Where App Review signs in | **A demo pool on its own host** (Corey, 23 Sep): `demo.playtally.app`, its own database, made-up players who pick every week. The code is done. Deploying it is C11. See `demo-pool.md`. |
| D3 | The winnings board shows dollars | **Keep it, and say plainly that no money changes hands** (Corey, 23 Sep). Both surfaces put `NO_MONEY_NOTE` under the card, and the review notes say it too. |
| D4 | iPhone only for 1.0? | **Yes** (Corey, 23 Sep). `TARGETED_DEVICE_FAMILY = 1`. |
| D5 | The name on the Store | **Still open.** Try "Tally: Pick'em Pools", then "Tally Pick'em". |
| D6 | Golf in 1.0 | **Leave it in, off**; the review notes say where the switch is. |
| D7 | Team logos | **Drop them in the app** (Corey, 23 Sep). A team is drawn as its colours with its abbreviation ("KC", "LAR"), on iOS and in the web's pick screens. The logo images aren't in the app bundle any more. The web still uses them in three places: see W1. |

## 3. App Store Connect and the developer portal (Corey)

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| C1 | Create the app record: bundle `app.playtally.ios`, name from D5, SKU `tally-ios`, primary language English (U.S.). | todo | Then put its numeric id into `APPLE_APP_STORE_ID` in `wrangler.jsonc` (item L4). |
| C2 | Switch the GitHub default branch to `main` (repo Settings → General). | todo | Otherwise every new agent session starts on the retired `claude/nfl-pool-app-9tv2om`. |
| C3 | Mint the APNs key and add it to Cloudflare. `ios/README.md` → *Switching it on*. | todo | This isn't a review requirement, but the app asks for notification permission, so notifications should work at launch. |
| C4 | Privacy "nutrition label": enter the answers from `listing.md`. | todo | |
| C5 | Age rating questionnaire: the answers are in `listing.md`. | todo | |
| C6 | EU trader status (Digital Services Act). Declare *not a trader* if Tally stays free and personal; the other answer publishes your address. | todo | Without it, the app can't be offered in the EU. |
| C7 | Pricing: free, all territories (or U.S. only for 1.0). | todo | |
| C8 | Export compliance: *uses encryption: yes, exempt (HTTPS only)*. | todo | Or L3 answers it in the build, so the question goes away. |
| C9 | TestFlight: an external group and a public link. Beta review takes about a day. Aim for a week of real use before submitting. | todo | |
| C10 | Upload the screenshots (A2) and paste the listing text (`listing.md`). | todo | |
| C11 | **Deploy the demo pool.** Cloudflare → Workers & Pages → Import `coreygwall/nfl` as `nfl-demo`, build command `CLOUDFLARE_ENV=demo npm run build`. Step by step in `demo-pool.md`. | todo | Blocks B3 and A2. The database already exists. |

## 4. Build and configuration (agents)

| # | Item | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| L1 | Apple team ID in the Xcode project, so Archive signs with no clicking. | Claude | done | This PR. |
| L2 | Build number. Every upload needs a higher `CURRENT_PROJECT_VERSION` (still `1`). Decide how it goes up: by hand per upload, or set from CI's run number. | — | todo | |
| L3 | Set `ITSAppUsesNonExemptEncryption = NO` for the app and the widget, so App Store Connect stops asking about export compliance on every build. The widget has a real plist (`TallyWidgetsInfo.plist`). The app's plist is generated, so add the key the way Xcode accepts for generated plists and confirm it in the archived app. | — | todo | Must go green in `ios.yml`. |
| L4 | `APPLE_APP_STORE_ID` in `wrangler.jsonc`, after C1. It turns on Safari's "Open in the app" banner. | — | blocked | Blocked on C1. |
| L5 | Copyright (`INFOPLIST_KEY_NSHumanReadableCopyright` is empty). | — | todo | "© 2026 Corey Wall", unless Corey wants a company name. |
| L6 | `project.yml` says `UIUserInterfaceStyle: Light`, but the app has a dark mode and the checked-in project doesn't pin it. Make the fallback file agree with the project. | — | todo | Housekeeping. It only matters if someone regenerates the project. |
| L7 | iPhone only (D4). | Claude | done | PR #68. |
| W1 | **The web's last logos**: the drifting band on the landing page (`Welcome.tsx`), the loader (`TallyLoader.tsx`), and both share images (`og.jpg`, `og-tally.jpg`, `scripts/build-og.ts`). Draw them the way `TeamSticker` does now, then delete `public/logos` and the `logo` field in `shared/teams.ts`. | — | todo | Not an App Review item: Apple doesn't review the website. It's the same trademark question, though. |

## 5. Listing assets

| # | Item | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| A1 | Listing copy: name, subtitle, keywords, description, promotional text, review notes. | Claude | done | First draft in `listing.md`. Corey edits it. |
| A2 | Screenshots, 6.9" iPhone (1320 × 2868). Three to six of them: picks, the board, the week in progress, the Live Activity, Home. Best made by a script on the macOS runner against the demo pool, so they can be remade whenever the UI changes. | — | blocked | Blocked on C11. |
| A3 | App icon check: the 1024 `AppIcon.png` has no transparency and nothing important in the corners. | — | todo | `scripts/build-ios-assets.ts` makes it. |
| A4 | Optional: an App Preview video (15–30 s) of making picks. | — | todo | After 1.0 is fine. |

## 6. Before pressing Submit

- [ ] A full week played in TestFlight by people who aren't you: picks, the lock screen, widgets, Face ID.
- [ ] A fresh install signs in with a code, adds Face ID, signs out and signs back in.
- [ ] Deleting an account works end to end on a phone (B1), and the board still reads right afterwards.
- [ ] A fresh install opens on the front door, and *Look around the demo pool* lands in Tally Demo.
- [ ] `curl -s https://playtally.app/.well-known/apple-app-site-association` lists `8445LWRG3B.app.playtally.ios`.
- [ ] The entitlements don't have `?mode=developer`.
- [ ] `/privacy`, the privacy manifest and the App Store label all say the same thing.
