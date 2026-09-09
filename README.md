# High Five — NFL confidence pool

Pick five NFL games a week, rank them 1–5, and score **5 / 4 / 3 / 2 / 1** points for each correct pick by rank.
Win your #1, #2 and #5 picks: 5 + 4 + 1 = **10**. Most points over the season wins.

Built as a single Cloudflare Worker (Hono API + D1 database + static React app). Free to run, no accounts to manage,
results entered by the commissioner in about a minute a week.

## How it plays

| Rule | Detail |
|---|---|
| Picks | Any 5 games in the week (fewer is allowed, e.g. if you join late in the week). Rank them 1–5. |
| Scoring | Rank 1 = 5 pts … rank 5 = 1 pt, only if your team wins. A tie scores 0. No picks = 0. |
| Locking | Each game locks at its kickoff. Until then you can change anything. A locked pick is frozen: team *and* rank. |
| Reveal | Other people's picks for a game are hidden until that game kicks off. Your own are always visible. |
| Standings | Points, then correct picks, then 5-point hits, then name. Ties share a place. |
| Weeks | Regular season, weeks 1–18. The Picks tab opens to the earliest week that still has an unstarted game. |
| Identity | Tap your name (or add it). It is remembered on the device. Switch with the chip in the header. No passwords. |

## Deploying (one-time, ~5 minutes)

The D1 database `nfl-pool` already exists in the Cloudflare account and its id is in `wrangler.jsonc`.
The Worker creates its own tables and loads the schedule the first time it runs, so there is no migration step.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick `coreygwall/nfl`.
2. Worker name **`nfl-pool`** (must match `name` in `wrangler.jsonc`). Build command `npm run build`. Deploy command `npx wrangler deploy` (the default). Root directory `/`.
3. After the first deploy: Worker → **Settings** → **Variables and Secrets** → add a **secret** `ADMIN_PIN` (the commissioner PIN). Redeploy or push again.
4. Optional: **Settings → Builds** → enable non-production branch builds to get a preview URL on every pull request.
5. Share `https://nfl-pool.<your-subdomain>.workers.dev`. Pool name is `POOL_NAME` in `wrangler.jsonc`.

From a laptop instead: `npx wrangler login && npm run deploy && npx wrangler secret put ADMIN_PIN`.

## Weekly ops

- **Results:** open `/admin`, enter the PIN, tap the winner of each game (tap again to clear, or **Tie**). Boards update instantly. Any device works.
- **Someone texted picks after kickoff:** the commissioner can backfill past locks:
  ```sh
  curl -X PUT https://<host>/api/admin/players/<playerId>/weeks/3/picks \
    -H 'x-admin-pin: <PIN>' -H 'content-type: application/json' \
    -d '{"picks":[{"gameId":"2026_03_KC_BUF","team":"KC","rank":1}]}'
  ```
  Player ids are listed at `GET /api/bootstrap`; game ids look like `2026_03_AWAY_HOME`.
- **Rename / remove a player:** `/admin` → Players.
- **Flexed kickoff times:** `npm run schedule:build` refreshes `shared/schedule-2026.json` from nflverse. Commit and push; the deployed Worker upserts kickoff times on its next request without touching results or picks.
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
| `npm test` | Unit tests (pick validation, scoring, week logic, DST) and API tests running inside `workerd` against real D1 |
| `npm run test:e2e` | Playwright smoke test: two players, picks, ranking, admin results, frozen picks after kickoff |
| `npm run typecheck` | Type-checks the client and the Worker |
| `npm run schedule:build` | Regenerates the schedule JSON from nflverse (`games.csv`) |
| `npm run logos:extract` | Rebuilds `public/logos` (tight-cropped SVGs with a baked die-cut outline) |
| `npm run deploy` | `vite build` + `wrangler deploy` |

## How it's put together

```
shared/     pure rules shared by client and Worker: validatePicks (locks, frozen ranks), scoring, week windows, teams
worker/     Hono API on Cloudflare Workers + D1; self-bootstraps schema + schedule; admin routes behind ADMIN_PIN
src/        React 19 + Vite + Tailwind 4 + motion; TanStack Query for data; react-router
migrations/ D1 schema (players, games, picks, meta)
scripts/    schedule builder, logo extractor
public/logos  32 team stickers (31 from react-nfl-logos, Commanders + Browns drawn here, Titans as PNG)
```

API (all JSON, under `/api`): `GET /bootstrap`, `POST /players`, `GET /weeks/:w`, `PUT /weeks/:w/picks`,
`GET /board/week/:w`, `GET /board/season`, and `x-admin-pin` guarded `/admin/*` routes for results, players,
backfill and schedule sync. Player identity is the `x-player-id` header the client sends from localStorage.
