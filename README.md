# High Five — NFL confidence pool

Pick five NFL games a week, rank them 1–5, and score **5 / 4 / 3 / 2 / 1** points for each correct pick by rank.
Win your #1, #2 and #5 picks: 5 + 4 + 1 = **10**. Most points over the season wins.

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
| Weeks | Regular season, weeks 1–18. The Picks tab opens to the earliest week that still has an unstarted game. |
| Identity | Type your name on first visit; the device is handed a token and a short **device code**. The token rides in `localStorage` *and* in a long-lived `HttpOnly` cookie, so a browser that clears one still knows you — you stay signed in indefinitely. The code claims the same name on a second device and stays hidden behind **Pick on another device** until you need it. A claimed name cannot be taken without the code; a name nobody holds is claimed by the first device that asks, which is how everyone who joined before codes existed keeps their place. |
| Face ID / Touch ID | Optional, and offered rather than required: tap your name → **Turn on Face ID**. After that a new phone signs in from the **Sign in with Face ID** button with nothing typed — the passkey is discoverable, so the credential names the player. A passkey belongs to the domain it was created on (`worker/routes/passkeys.ts` takes the relying party from the request), so one made on `workers.dev` will not be offered on `playtally.app`; the device code covers that, and every browser without biometrics. |
| Picking for others | The commissioner can add other players to their own phone (account sheet → **Add someone I pick for**, admin PIN once). Switching between them is one tap, no code, and each set of picks still obeys every kickoff lock. Those devices are marked admin-issued, so the CSV export's `entered_by` column reads `commissioner` rather than `player`. |

## Deploying (one-time, ~5 minutes)

The D1 database `nfl-pool` already exists in the Cloudflare account, its id is in `wrangler.jsonc`, and it is
**already seeded**: schema applied and all 272 regular-season games loaded. There is no migration step to run.
(The Worker also applies the schema and upserts the schedule itself on its first request, so a fresh or wiped
database heals on its own.)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick `coreygwall/nfl`.
2. Worker name **`nfl`** (must match `name` in `wrangler.jsonc`, and Cloudflare defaults it to the repo name). Build command `npm run build`. Deploy command `npx wrangler deploy` (the default). Root directory `/`.
3. After the first deploy: Worker → **Settings** → **Variables and Secrets** → add a **secret** `ADMIN_PIN` (the commissioner PIN). Redeploy or push again.
4. Optional: **Settings → Builds** → enable non-production branch builds to get a preview URL on every pull request.
5. Share `https://playtally.app/p/high-five` (or the `workers.dev` URL, which still works). Pool name and slug are `POOL_NAME` and `POOL_SLUG` in `wrangler.jsonc`.

From a laptop instead: `npx wrangler login && npm run deploy && npx wrangler secret put ADMIN_PIN`.

## Sharing the link

Send people the pool's URL — `https://playtally.app/p/<slug>`. It unfurls in iMessage, WhatsApp and Slack with `public/og.jpg` and the pool name; the
Worker fills in the absolute image URL and `POOL_NAME` at request time, so no config is needed when the host
changes. `npm run og:build` regenerates the image. First-time visitors land on a welcome page that asks for a name,
with the rules in three steps and a full `/rules` page one tap away. The roster is capped at 200 names.

## How the URLs are laid out

The app is **Tally** (`playtally.app`); **High Five** is a pool *type*; this season's NFL pool is one
*instance* of it. That maps onto the paths:

| Path | What it is |
| --- | --- |
| `/` | The Tally landing page — `public/landing.html`, a static file with its own copy and share card. |
| `/p/<slug>` | A pool instance. The React app mounts here: the router's basename is read from the URL (`src/lib/basename.ts`), so every in-app link is still written as if it were at the root, and the same bundle will serve any pool. |
| `/api/*` | The API. Single-pool today; the natural shape for many is `/api/pools/<slug>/*`. |
| `/welcome`, `/week/*`, `/board*`, `/rules`, `/admin` | Where the pool used to live. They 301 into `/p/<slug>/…`, query string intact, so links already texted around keep working. |

`POOL_SLUG`, `POOL_NAME` and `POOL_TYPE` in `wrangler.jsonc` name this instance. Renaming the pool's
URL is a one-line change there (people's sign-in links change with it, so do it before sharing widely).

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

- **Send everyone a sign-in link.** Open `/admin` **on the new domain** → Players → **Copy sign-in link**
  for each person and text it to them. One tap signs that device in; the code is stripped from the
  address bar afterwards.
- **Or let them do it:** open the new address, tap **I already entered**, pick their name, and type the
  code they can still read on the old address (or that you read to them from `/admin`).

Passkeys follow the same rule — one created on `workers.dev` will not work on `playtally.app`, and the person just adds another (or uses their code).

## Weekly ops

- **Results:** open `/admin`, enter the PIN, then either tap **Pull final scores** to fill the week in from nflverse, or tap the winner of each game by hand (tap again to clear, or **Tie**). Boards update instantly. Any device works.
- **About the pull:** it only fills games with no result recorded, only after kickoff, and only from a feed that still covers the schedule. Anything you entered by hand stands; if the feed disagrees it says so and changes nothing — clear that game and pull again to take the feed's version. nflverse usually posts a final within an hour or two of the whistle.
- **Someone texted picks after kickoff:** the commissioner can backfill past locks:
  ```sh
  curl -X PUT https://<host>/api/admin/players/<playerId>/weeks/3/picks \
    -H 'x-admin-pin: <PIN>' -H 'content-type: application/json' \
    -d '{"picks":[{"gameId":"2026_03_KC_BUF","team":"KC","rank":1}]}'
  ```
  Player ids are listed at `GET /api/bootstrap`; game ids look like `2026_03_AWAY_HOME`.
- **Rename / remove a player:** `/admin` → Players.
- **Who's squared away:** `/admin` → Players → tap the circle beside a name. Filter with **All / Ready / Waiting** to see who still needs chasing. It is commissioner-only: nothing about it reaches the pool, the board, or the API anyone else can call.
- **Picking for your family:** tap your name → **Add someone I pick for** → enter the admin PIN once → tap their name. They appear beside you in the account sheet; switching is a tap. Their own devices keep working.
- **Lost code / locked out / wrong person claimed a name:** `/admin` → Players → **Reset access**. It issues a new code and signs out that player's devices; send them the code and the next device to use it becomes them. Eight wrong codes locks claiming for 15 minutes; a reset clears the lock.
- **Flexed kickoff times:** handled for you. A Cron Trigger checks nflverse every morning (10:00 UTC) and moves any kickoff the NFL has flexed. It only ever changes kickoff time and venue, never picks, results, weeks or teams, and it refuses to apply a feed that doesn't cover the games it already knows. `/admin` → Tools shows when it last ran and has a "Check nflverse now" button.
- **Backup:** `/admin` → Tools → "Download picks CSV" gives every pick with its game, result and points.
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
| `npm run test:e2e` | Playwright smoke test: two players, picks, ranking, admin results, frozen picks after kickoff |
| `npm run typecheck` | Type-checks the client and the Worker |
| `npm run schedule:build` | Regenerates the schedule JSON from nflverse (`games.csv`) |
| `npm run logos:extract` | Rebuilds `public/logos` from the npm package plus `scripts/custom-logos/` (tight-cropped, with a baked die-cut outline) |
| `npm run deploy` | `vite build` + `wrangler deploy` |

## How it's put together

```
shared/     pure rules shared by client and Worker: validatePicks (locks, frozen ranks), scoring, week windows, teams
worker/     Hono API on Cloudflare Workers + D1; self-bootstraps schema + schedule; admin routes behind ADMIN_PIN
src/        React 19 + Vite + Tailwind 4 + motion; TanStack Query for data; react-router
migrations/ D1 schema (players, games, picks, meta)
scripts/    schedule builder, logo extractor
public/logos  32 team stickers (30 vectors from react-nfl-logos, Browns + Titans as PNG, Commanders drawn here)
```

API (all JSON, under `/api`): `GET /bootstrap`, `POST /players`, `GET /weeks/:w`, `PUT /weeks/:w/picks`,
`GET /board/week/:w`, `GET /board/season`, and `x-admin-pin` guarded `/admin/*` routes for results, players,
backfill, schedule sync, status and `export.csv`. Player identity is the `x-player-id` header the client sends
from localStorage.

Resilience notes: the client reloads itself if a redeploy invalidates a cached chunk and shows an "update ready"
bar when the server's build id changes; drafts live in localStorage so a killed tab loses nothing; the Worker
maps database constraint races to a 409 the client recovers from; and a broken logo image degrades to a
team-colour monogram rather than a broken-image icon.
