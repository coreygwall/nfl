# High Five — NFL confidence pool

Pick five NFL games a week, rank them 1–5, and score **5 / 4 / 3 / 2 / 1** points for each correct pick by rank.
Win your #1, #2 and #5 picks: 5 + 4 + 1 = **10**. Most points wins the week, and most points across the season wins the season.

Built as a single Cloudflare Worker (Hono API + D1 database + static React app). Free to run, no accounts to manage,
results entered by the commissioner in about a minute a week.

## How it plays

| Rule | Detail |
|---|---|
| Picks | Any 5 games in the week. Rank them 1–5. |
| Scoring | Rank 1 = 5 pts … rank 5 = 1 pt, only if your team wins. A tie scores 0. No picks = 0. |
| Locking | Each game locks at its kickoff. Until then you can change anything. A locked pick is frozen: team *and* rank. |
| Reveal | Other people's picks for a game are hidden until that game kicks off. Your own are always visible. |
| Standings | Points, then correct picks, then 5-point hits, then name. Ties share a place. |
| Two prizes | Every week has its own winner on that week's points. The season race is the running total from `SEASON_START_WEEK` (`shared/week.ts`, currently **week 2**) onward, so a pool that opens partway through week 1 starts everyone level. Week 1 still crowns a weekly winner; it just does not carry forward, and the season board hides it. |
| Weeks | Regular season, weeks 1–18. The Picks tab opens to the earliest week that still has an unstarted game. |
| Identity | Type your name on first visit; the device is handed a token and a short **device code**. The token rides in `localStorage` *and* in a long-lived `HttpOnly` cookie, so a browser that clears one still knows you — you stay signed in indefinitely. The code claims the same name on a second device and stays hidden behind **Pick on another device** until you need it. A claimed name cannot be taken without the code; a name nobody holds is claimed by the first device that asks, which is how everyone who joined before codes existed keeps their place. |
| Face ID / Touch ID | Offered on the way past after every sign-in, and never required. Turning it on is the one step that makes every other surface free: the **iOS app tries it the moment it opens** and signs you straight in, and on the web the passkey waits in the name field's own suggestions (`autocomplete="username webauthn"`), so a returning player taps their name rather than hunting for a code. The credential names the player, so nothing is typed either way. A passkey belongs to the domain it was created on (`worker/routes/passkeys.ts` takes the relying party from the request), so one made on `workers.dev` is not offered on `playtally.app`; the device code covers that, and every browser without biometrics. |
| Moving to a second device | Tap your name → **Play on another device** → **Send myself a sign-in link**. Texting or AirDropping that link signs the next device in with one tap — and opens the iOS app rather than the browser on any iPhone that has it. The code is still there underneath for reading aloud. |
| Picking for others | Anyone can add entries their account manages (account sheet → **Add an entry**) — for kids, a partner, a friend who won't install anything. Each entry gets its own picks, its own row on the board and no sign-in of its own: the account's passkey or code is the way back in, and up to 12 hang off one account. Switching between them is one tap. When someone texts their picks in, the commissioner can enter them on their behalf; the CSV export's `entered_by` column then reads `commissioner` rather than `player`. |
| Limits | The two doors a stranger with the link can push on are counted per caller (`migrations/0007_rate_limits.sql`): 8 wrong owner PINs earns a 15-minute cool-off, and 20 new names an hour from one address is the ceiling. A room full of friends joining over one wifi never reaches it; a script trying to fill all 200 seats does. The counter is per caller, so nobody can lock the commissioner out by hammering the PIN. |

## Deploying (one-time, ~5 minutes)

The D1 database `nfl-pool` already exists in the Cloudflare account, its id is in `wrangler.jsonc`, and it is
**already seeded**: schema applied and all 272 regular-season games loaded. There is no migration step to run.
(The Worker also applies the schema and upserts the schedule itself on its first request, so a fresh or wiped
database heals on its own.)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick `coreygwall/nfl`.
2. Worker name **`nfl`** (must match `name` in `wrangler.jsonc`, and Cloudflare defaults it to the repo name). Build command `npm run build`. Deploy command `npx wrangler deploy` (the default). Root directory `/`.
3. After the first deploy: Worker → **Settings** → **Variables and Secrets** → add a **secret** `ADMIN_PIN` (the owner PIN — typed once to take the keys, see [Two offices](#two-offices)). Redeploy or push again.
4. Optional: **Settings → Builds** → enable non-production branch builds to get a preview URL on every pull request.
   When the iOS app is set up, `APPLE_APP_IDS` in `wrangler.jsonc` names it (see [`ios/README.md`](ios/README.md)).
5. Share `https://playtally.app/p/high-five` (or the `workers.dev` URL, which still works). Pool name and slug are `POOL_NAME` and `POOL_SLUG` in `wrangler.jsonc`.

From a laptop instead: `npx wrangler login && npm run deploy && npx wrangler secret put ADMIN_PIN`.

## How code ships (and the move to `main`)

**Today there is no `main`.** `claude/nfl-pool-app-9tv2om` is the branch Cloudflare Workers Builds
deploys from, so a push to it *is* a release. Everyone works on that one branch.

The consequence worth knowing: **CI does not gate the deploy.** The Cloudflare build and the GitHub
Actions run start from the same push and finish independently, so a commit that fails the tests is
already live by the time CI goes red. Until that changes, run `npm run typecheck`, `npm test` and
`npm run test:e2e` locally before pushing — the suite takes about a minute and is the only thing
standing between a mistake and the people making picks.

**The plan is to move to `main`**, which fixes exactly that: with pull requests into a protected
branch, only code that passed CI can merge, and only merged code deploys. It is deliberately *not*
being done mid-season, because two of the steps live in dashboards rather than in this repo, and if
they are done out of order pushes stop deploying silently — which, during a week when picks are
live, is the worst way to find out.

The order matters. Nobody should push to `main` until step 2 is done:

1. `git branch main claude/nfl-pool-app-9tv2om && git push -u origin main` — same history, new name.
2. Cloudflare → Workers & Pages → `nfl` → **Settings → Builds** → set the **production branch** to
   `main`. Until this happens, `main` is a branch that deploys nothing.
3. GitHub → repo **Settings** → set the **default branch** to `main`.
4. GitHub → **Settings → Rules** → protect `main`: require the `CI` check to pass before merging.
5. Point the agents at it: work happens on feature branches, pull requests go into `main`. Claude
   sessions take their branch from the session config; Codex needs telling separately.
6. Optional and worth it: Cloudflare → **Settings → Builds** → enable non-production branch builds,
   which gives every pull request its own preview URL to click through before merging.

## Sharing the link

Send people the pool's URL — `https://playtally.app/p/<slug>`. It unfurls in iMessage, WhatsApp and Slack with `public/og.jpg` and the pool name; the
Worker fills in the absolute image URL and `POOL_NAME` at request time, so no config is needed when the host
changes. `npm run og:build` regenerates the image. First-time visitors land on a welcome page that asks for a name,
with the rules in three steps and a full `/rules` page one tap away. The roster is capped at 200 names.

## The iOS app

`ios/` is a native SwiftUI app for the same pool — see [`ios/README.md`](ios/README.md) for the
runbook (TestFlight in an afternoon) and the architecture. It talks to this Worker's API and
shares its accounts: a passkey made on the website signs into the app with Face ID and the other
way round. Two things on this side make that work:

- `worker/apple.ts` serves `/.well-known/apple-app-site-association`, which tells Apple the app
  may use the domain's passkeys and open `/p/*` links. The app is named by `APPLE_APP_IDS` in
  `wrangler.jsonc` (`<team id>.app.playtally.ios`) — set it once the app exists in App Store
  Connect, before the first TestFlight install.
- `worker/routes/passkeys.ts` accepts `https://<host>` as a credential origin alongside the page
  origin, because a native app signs the domain rather than a page.
- `APPLE_APP_STORE_ID` in `wrangler.jsonc` turns on Safari's "Open in the app" banner
  (`worker/unfurl.ts`). A pool link pasted into the address bar never fires a universal link, so
  without the banner someone who has the app still ends up in the browser. Leave it empty until
  the app has an App Store listing; an empty one makes Safari log an error and show nothing.

## How the URLs are laid out

The app is **Tally** (`playtally.app`); **High Five** is a pool *type*; this season's NFL pool is one
*instance* of it. That maps onto the paths:

| Path | What it is |
| --- | --- |
| `/` | The Tally landing page (`src/screens/Landing.tsx`) — what Tally is, and each pool type's own explainer in a sheet. It links to no live pool on purpose. |
| `/p/<slug>` | A pool instance. The React app mounts here: the router's basename is read from the URL (`src/lib/basename.ts`), so every in-app link is still written as if it were at the root, and the same bundle will serve any pool. |
| `/api/*` | The API. Single-pool today; the natural shape for many is `/api/pools/<slug>/*`. |
| `/p/<slug>` | **Home** — which pool you are in, what it wants from you this week, and where you stand. The landing for every visit after the first. |
| `/welcome`, `/week/*`, `/board*`, `/rules`, `/admin`, `/commissioner`, `/league` | Where the pool used to live. They 301 into `/p/<slug>/…`, query string intact, so links already texted around keep working. `/admin` is the old name for `/commissioner` and redirects to it. |

`POOL_SLUG`, `POOL_NAME` and `POOL_TYPE` in `wrangler.jsonc` name this instance. Renaming the pool's
URL is a one-line change there (people's sign-in links change with it, so do it before sharing widely).

One HTML document serves both faces. Its own tags describe Tally, which is what `/` is; for a pool the
Worker writes the pool's name, description and share card over them (`worker/unfurl.ts`), and the app
reads which face to render from the path. So a pool link unfurls as that pool and the brand link
unfurls as Tally, from a single build with no host baked in.

**Pool copy lives in `shared/pools.ts`** — the name, the steps, the fine print, one entry per pool type.
The landing page's sheet, the pool's own *How to play* page and the Worker's share description all read
from it, so there is one place to edit and no second copy to drift.

**When a second pool arrives**, the shape is ready for it: `pools(id, slug, type, sport, season, name)`,
players stay global to Tally (one identity, many pools) with a `pool_players` join, and picks key on
`(pool_id, player_id)`. Groups slot in above pools as `/g/<slug>` without disturbing pool URLs, and chat
hangs off either. None of that is built yet — the point is that nothing in the current shape blocks it.

## The custom domain

`playtally.app` is wired up in `wrangler.jsonc` as a Worker custom domain, so `wrangler deploy` — which
is what the GitHub build runs — provisions and keeps it. `workers_dev` stays `true` so the old
`nfl.<subdomain>.workers.dev` URL keeps serving through the transition. Nothing else names a host:
every URL is relative and the unfurl tags are made absolute from the request (`worker/unfurl.ts`).

If a deploy ever fails with a zone or hostname error, the domain is not active in the account yet —
wait for it to finish provisioning and re-run the build; the previous version keeps serving meanwhile.

One thing to plan for: **browser storage is per-origin, so every device forgets who it is at a new
address.** Nobody loses picks, points or history — those live in D1 against the player, not the device —
but each person has to claim their name again. Two ways through it:

- **Send everyone a sign-in link.** Open `/commissioner` **on the new domain** → Players → **Copy sign-in link**
  for each person and text it to them. One tap signs that device in; the code is stripped from the
  address bar afterwards.
- **Or let them do it:** open the new address, tap **I already entered**, pick their name, and type the
  code they can still read on the old address (or that you read to them from `/commissioner`).

Passkeys follow the same rule — one created on `workers.dev` will not work on `playtally.app`, and the person just adds another (or uses their code).

## Where things are

Four places, on both surfaces:

| | What it answers |
| --- | --- |
| **Home** | What does this pool want from me? The week, whose picks are missing, where you stand, who took last week. On iOS the other pools are a strip underneath, each saying whether it needs picks. |
| **Picks** | This week's five. |
| **Board** | Who is winning. |
| **Account** | Grouped like Settings, in the order things get touched: your entries in this pool, the office doors for whoever holds one, notifications and appearance, the other-device link, and about Tally. |

The brand is in the navigation bar of every tab as the pool chip — the fuller lockup on Home, the
mark and the pool's name elsewhere — rather than repeating as a block at the top of every tab's
content.

**Dark mode** follows the device by default; Account → Appearance sets Light or Dark instead. It is
a re-light rather than an inversion — cards sit above a warm dark ground, the hard offset shadow
stays black so it still reads as a shadow, and filled accents keep dark text. iOS ships a dark app
icon to match. Every colour pair clears 4.5:1.

Two things deliberately *not* in that list:

- **Switching pools** is a context change, not a destination — it swaps the whole app and keeps the
  tab you were on. It lives on the pool chip in the header, where iOS and the web both put workspace
  and account pickers: on iOS a native menu with the pools ticked, on the web a sheet. It costs
  nothing at one pool: the header looks exactly as it did.
- **Rules** is a document you read once and then send to someone. It was holding a quarter of the
  navigation; it now opens from Home and from the board, which is where the question occurs.

## Two offices

Two different jobs used to share one PIN.

**The commissioner** runs a pool: its roster, its name, its invite, who still needs chasing, the
backup. That is attached to an *account* — `pool_commissioners` in `migrations/0010_roles.sql` —
so it travels with the person rather than with whoever knows a secret. `/commissioner` on the web;
Account → **Commissioner** in the app, and the button is not drawn at all for anyone else.

**The league office** owns the results, the schedule and the score feed. Every Tally pool scores
the same fourteen NFL games, so there is exactly one authority on who won them and it sits above
every pool rather than inside one — a pool that could set its own results is a pool that can
disagree with the one next door. That is `platform_admins`, and it is `/league` on the web,
Account → **League office** in the app. Today it is a person with a feed to pull from; when it is
fully automated the screen becomes a window onto a job that runs itself and nothing else moves.

**`ADMIN_PIN` is now break-glass, not a login.** It does one thing: `POST /api/roles/claim` attaches
both offices to the account that typed it. Sign in, open `/commissioner`, click *I own this pool and
lost access*, type it once. Losing that account is still recoverable — typing it again attaches the
offices to the new one — and it remains a valid header on both route groups so a locked-out owner is
never stuck. It is counted per caller: 8 wrong guesses earns a 15-minute cool-off, and the counter
is per address so nobody can lock the commissioner out by hammering it.

## Weekly ops

- **Results:** mostly they arrive on their own. A Cron Trigger sweeps every half hour through the
  windows games end in — Sunday afternoon and evening, and Sunday, Monday and Thursday nights — and
  fills in any game that has no result yet. A super admin can still open `/league`, tap **Pull final
  scores**, or set the winner of each game by hand (tap again to clear, or **Tie**). Every pool's
  board updates instantly. Results are deliberately *not* a commissioner's job — see
  [Two offices](#two-offices).
- **Why the automatic pull is safe to leave running:** it only fills blanks. A result already
  recorded is either confirmed or reported as a conflict for you to settle — never overwritten, so
  a winner you entered by hand always stands. It ignores games that have not kicked off, refuses
  the whole feed if it covers less than 95% of the season, and on an unattended run waits until a
  game is 3.5 hours past kickoff before believing a score, because nothing is watching it. A firing
  with nothing finished and unrecorded never even downloads the feed.
- **Cost:** none. Cron Triggers are on the free plan and these firings are a rounding error against
  the daily request allowance. The one real limit is **five Cron Triggers per account**, shared with
  every other Worker on it — which is why this uses two expressions rather than one per kickoff
  window.
- **About the pull:** it only fills games with no result recorded, only after kickoff, and only from a feed that still covers the schedule. Anything you entered by hand stands; if the feed disagrees it says so and changes nothing — clear that game and pull again to take the feed's version. nflverse usually posts a final within an hour or two of the whistle.
- **Someone texted picks after kickoff:** the commissioner can backfill past locks:
  ```sh
  curl -X PUT https://<host>/api/commissioner/players/<playerId>/weeks/3/picks \
    -H 'x-player-token: <the commissioner's device token>' -H 'content-type: application/json' \
    -d '{"picks":[{"gameId":"2026_03_KC_BUF","team":"KC","rank":1}]}'
  ```
  Player ids are listed at `GET /api/bootstrap`; game ids look like `2026_03_AWAY_HOME`.
- **Rename / remove a player:** `/commissioner` → Players.
- **If someone says their picks are gone:** they are not. Every set of picks ever saved is copied
  into an append-only `pick_history` table in the same transaction as the save, and nothing in the
  app ever deletes from it — not even removing the player. Read it back at
  `/api/commissioner/pick-history?name=<name>&week=<n>` as the commissioner, which returns every
  save newest first, including ones belonging to a player who no longer exists.
  This is deliberately *not* D1's own point-in-time recovery, which is there as a backstop but is
  all-or-nothing: rolling the database back to before a mistake also throws away every pick
  everybody else made in between. On a Sunday that cure is worse than the disease. The history
  table puts one person's picks back exactly, and touches nothing else.
- **Who's squared away:** `/commissioner` → Players → tap the circle beside a name. Filter with **All / Ready / Waiting** to see who still needs chasing. It is commissioner-only: nothing about it reaches the pool, the board, or the API anyone else can call.
- **Picking for your family:** tap your name → **Add an entry** → give it a name. It appears beside you in the account sheet and switching is a tap; the entry has no separate sign-in, so your account is its recovery.
- **Lost code / locked out / wrong person claimed a name:** `/commissioner` → Players → **Reset access**. It issues a new code and signs out that player's devices; send them the code and the next device to use it becomes them. A reset also puts the name behind its code for good: zero devices is how an *untouched* roster name lets its owner in without one, and a name that has been claimed before should never go back on the shelf. Eight wrong codes locks claiming for 15 minutes; a reset clears the lock.
- **Flexed kickoff times:** handled for you. A Cron Trigger checks nflverse every morning (10:00 UTC) and moves any kickoff the NFL has flexed. It only ever changes kickoff time and venue, never picks, results, weeks or teams, and it refuses to apply a feed that doesn't cover the games it already knows. `/league` → Schedule & feed shows when it last ran and has a "Check nflverse now" button.
- **Backup:** `/commissioner` → Pool → "Download picks CSV" gives every pick with its game, result and points.
- **From Claude:** with the Cloudflare MCP connected, results can also be recorded straight into D1, e.g. `UPDATE games SET winner = 'KC' WHERE id = '2026_03_KC_BUF'`.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # ADMIN_PIN=1234, ENVIRONMENT=dev
npm run dev                      # http://localhost:5173 — Vite + Workers runtime + local D1
```

Time travel in dev: add `?now=2026-09-13T20:00:00Z` to any URL. The client forwards it to the API, which honours it only when `ENVIRONMENT=dev`.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (pick validation, scoring, week logic, DST, CSV parsing) and API tests running inside `workerd` against real D1, including the schedule-sync guards |
| `npm run test:e2e` | Playwright smoke test: two players, picks, ranking, the two offices, frozen picks after kickoff |
| `npm run typecheck` | Type-checks the client and the Worker |
| `npm run schedule:build` | Regenerates the schedule JSON from nflverse (`games.csv`) |
| `npm run logos:extract` | Rebuilds `public/logos` from the npm package plus `scripts/custom-logos/` (tight-cropped, with a baked die-cut outline) |
| `npm run ios:assets` | Rebuilds the iOS asset catalogue (team stickers, icon) and the static font files from the web's own sources |
| `npm run deploy` | `vite build` + `wrangler deploy` |

## How it's put together

```
shared/     pure rules shared by client and Worker: validatePicks (locks, frozen ranks), scoring, week windows, teams
worker/     Hono API on Cloudflare Workers + D1; version-gates schema + schedule setup; /commissioner and /league behind account roles
src/        React 19 + Vite + Tailwind 4 + motion; TanStack Query for data; react-router
migrations/ D1 schema (players, games, picks, meta)
scripts/    schedule builder, logo extractor, iOS asset + font builders
ios/        the native app: TallyKit (Swift package: API, rules, auth) + the SwiftUI app
public/logos  32 team stickers (30 vectors from react-nfl-logos, Browns + Titans as PNG, Commanders drawn here)
```

API (all JSON, under `/api`): `GET /bootstrap`, `POST /players`, `GET /weeks/:w`, `PUT /weeks/:w/picks`,
`GET /board/week/:w`, `GET /board/season`, and two role-guarded groups: `/commissioner/*` (roster, pool
settings, backfill, pick history, `export.csv`) and `/league/*` (results, schedule sync, feed status).
Identity is the `x-player-token` header the client holds; `/roles` reports what that identity may open.

Resilience notes: the client reloads itself if a redeploy invalidates a cached chunk and shows an "update ready"
bar when the server's build id changes; bootstrap failures leave the schedule-backed pool doorway usable and
retry quietly in the background; drafts live in localStorage so a killed tab loses nothing; the Worker checks a
single readiness marker on a cold isolate instead of replaying migrations; database constraint races map to a
409 the client recovers from; and a broken logo image degrades to a team-colour monogram rather than a
broken-image icon.
