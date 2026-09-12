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
| Identity | Type your name on first visit; it is remembered on the device. Joining from a second device? Tap **I already entered** and pick your name. A name already in the pool cannot be taken by accident — you either continue as that player or pick a name that differs. Switch with the chip in the header. No passwords. |

## Deploying (one-time, ~5 minutes)

The D1 database `nfl-pool` already exists in the Cloudflare account, its id is in `wrangler.jsonc`, and it is
**already seeded**: schema applied and all 272 regular-season games loaded. There is no migration step to run.
(The Worker also applies the schema and upserts the schedule itself on its first request, so a fresh or wiped
database heals on its own.)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick `coreygwall/nfl`.
2. Worker name **`nfl`** (must match `name` in `wrangler.jsonc`, and Cloudflare defaults it to the repo name). Build command `npm run build`. Deploy command `npx wrangler deploy` (the default). Root directory `/`.
3. After the first deploy: Worker → **Settings** → **Variables and Secrets** → add a **secret** `ADMIN_PIN` (the commissioner PIN). Redeploy or push again.
4. Optional: **Settings → Builds** → enable non-production branch builds to get a preview URL on every pull request.
5. Share `https://nfl.<your-subdomain>.workers.dev`. Pool name is `POOL_NAME` in `wrangler.jsonc`.

From a laptop instead: `npx wrangler login && npm run deploy && npx wrangler secret put ADMIN_PIN`.

## Sharing the link

Send people the root URL. It unfurls in iMessage, WhatsApp and Slack with `public/og.jpg` and the pool name; the
Worker fills in the absolute image URL and `POOL_NAME` at request time, so no config is needed when the host
changes. `npm run og:build` regenerates the image. First-time visitors land on a welcome page that asks for a name,
with the rules in three steps and a full `/rules` page one tap away. The roster is capped at 200 names.

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
