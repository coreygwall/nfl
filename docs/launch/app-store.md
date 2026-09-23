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
| B1 | **Delete your account in the app** (Guideline 5.1.1(v)). Any app that creates accounts must let a person delete theirs from inside the app. Today `/privacy` says "ask your commissioner". Needs a route (`DELETE /api/me`), a confirmed button on Account (iOS and web) and a new line on `/privacy`. | — | decide | Blocked on D1. |
| B2 | **Privacy manifests** for the app and the widget extension. They're needed because the app reads and writes `UserDefaults`. | Claude | done | This PR: `ios/Tally/PrivacyInfo.xcprivacy`, `ios/TallyWidgets/PrivacyInfo.xcprivacy`. |
| B3 | **A way in for App Review.** The reviewer has to be able to sign in and see a live pool, with a name and code written into the review notes. | — | decide | Blocked on D2. |
| B4 | **Report and block for user content** (Guideline 1.2). Names, announcements and golf card names are user content. A profanity screen exists (`shared/profanity.ts`), and announcements are commissioner-only. Still missing: a "Report" action on an announcement and on a board row, plus a published contact. Smallest version: a mailto to `SUPPORT_EMAIL` with the pool, the item and the reporter prefilled. | — | todo | Either agent. |
| B5 | **Support URL.** App Store Connect wants a web page, not an email address. Add `/support` on the web: the contact address, how to recover a lost device, and how to delete your account (after B1). | — | todo | Either agent. |

## 2. Decisions for Corey

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | **What deleting an account does to the board.** Removing the player row outright rewrites history: past weekly winners and the winnings log change under everyone. | **Anonymise, don't erase.** Drop the name (show "Former player"), every device, passkey, push token and session, and the entries it owns if nobody else manages them. Keep the picks so past weeks and payouts stay true. Say exactly that on `/privacy`. |
| D2 | **Where App Review signs in.** Putting a reviewer into High Five puts a stranger on your friends' board. | **A demo pool on its own host** (`demo.playtally.app`, its own D1) with a dozen made-up players and a season of picks. It's also where the screenshots come from (A2). If that's too much work before launch, a "App Review" entry in High Five that you remove afterwards also works. |
| D3 | **The winnings board shows dollars.** Guideline 5.3.4 is about real-money gaming, and a reviewer can read "$18 pot" as that. | **Keep it, and explain it in the review notes**: Tally takes no money, moves no money and offers no odds. It records what a private group agreed among themselves, like the spreadsheet it replaces. If it's rejected, drop the card from iOS; the web keeps it. Don't hide it for review and turn it on afterwards: that breaks Guideline 2.3.1 and gets apps pulled. |
| D4 | **iPhone only for 1.0?** The project targets iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`). That means 13" iPad screenshots and a review of the iPad layouts. | **iPhone only for 1.0.** Set `"1"` in the project and `project.yml`; iPads still run it in compatibility mode. Add iPad in 1.1 once it has had a real look. |
| D5 | **The name on the Store.** "Tally" is almost certainly taken. The name on the Store must be unique, and can differ from the icon's name, which stays Tally. | Try **"Tally: Pick'em Pools"**, then "Tally Pick'em" as a fallback. |
| D6 | **Golf in 1.0.** It's behind Labs and off by default. | **Leave it in, off**, and tell the reviewer where the switch is (the review notes say so). |
| D7 | **Team logos.** The app draws real NFL team logos, which are trademarks. Guideline 5.2.1 lets Apple reject an app that uses them without permission, and pick'em apps get checked for it. | **Settle it before the first submission.** The cheapest safe version keeps the team names and draws each team as its colours and abbreviation (the board's grid already does). Keeping the logos means being able to show you have the rights. See `listing.md` → *Risks*. |

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

## 4. Build and configuration (agents)

| # | Item | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| L1 | Apple team ID in the Xcode project, so Archive signs with no clicking. | Claude | done | This PR. |
| L2 | Build number. Every upload needs a higher `CURRENT_PROJECT_VERSION` (still `1`). Decide how it goes up: by hand per upload, or set from CI's run number. | — | todo | |
| L3 | Set `ITSAppUsesNonExemptEncryption = NO` for the app and the widget, so App Store Connect stops asking about export compliance on every build. The widget has a real plist (`TallyWidgetsInfo.plist`). The app's plist is generated, so add the key the way Xcode accepts for generated plists and confirm it in the archived app. | — | todo | Must go green in `ios.yml`. |
| L4 | `APPLE_APP_STORE_ID` in `wrangler.jsonc`, after C1. It turns on Safari's "Open in the app" banner. | — | blocked | Blocked on C1. |
| L5 | Copyright (`INFOPLIST_KEY_NSHumanReadableCopyright` is empty). | — | todo | "© 2026 Corey Wall", unless Corey wants a company name. |
| L6 | `project.yml` says `UIUserInterfaceStyle: Light`, but the app has a dark mode and the checked-in project doesn't pin it. Make the fallback file agree with the project. | — | todo | Housekeeping. It only matters if someone regenerates the project. |

## 5. Listing assets

| # | Item | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| A1 | Listing copy: name, subtitle, keywords, description, promotional text, review notes. | Claude | done | First draft in `listing.md`. Corey edits it. |
| A2 | Screenshots, 6.9" iPhone (1320 × 2868). Three to six of them: picks, the board, the week in progress, the Live Activity, Home. Best made by a script on the macOS runner against the demo pool (D2), so they can be remade whenever the UI changes. | — | blocked | Blocked on D2. |
| A3 | App icon check: the 1024 `AppIcon.png` has no transparency and nothing important in the corners. | — | todo | `scripts/build-ios-assets.ts` makes it. |
| A4 | Optional: an App Preview video (15–30 s) of making picks. | — | todo | After 1.0 is fine. |

## 6. Before pressing Submit

- [ ] A full week played in TestFlight by people who aren't you: picks, the lock screen, widgets, Face ID.
- [ ] A fresh install signs in with a code, adds Face ID, signs out and signs back in.
- [ ] Deleting an account works end to end (B1), and the board still reads right afterwards.
- [ ] `curl -s https://playtally.app/.well-known/apple-app-site-association` lists `8445LWRG3B.app.playtally.ios`.
- [ ] The entitlements don't have `?mode=developer`.
- [ ] `/privacy`, the privacy manifest and the App Store label all say the same thing.
