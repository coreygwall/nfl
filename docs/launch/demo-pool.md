# The demo pool

`demo.playtally.app` is a second copy of the Tally Worker with its own database (`nfl-demo`). A
dozen made-up players pick every week, the games and results are the real ones, and nothing in it
can reach a real pool. Two things depend on it:

- **The iOS front door.** A fresh install from the App Store no longer lands in High Five. It asks
  for a code or a link, and offers *Look around the demo pool* to anybody who has not been invited
  to anything (`FrontDoorView`).
- **App Review.** The reviewer signs in to the demo pool as **App Review**, a made-up player with a
  season of picks already made, so they never appear on a real group's board.

## What is already done

| Piece | Where |
| --- | --- |
| The `demo` environment: its own name (`nfl-demo`), address, database, one cron, `DEMO=true` | `wrangler.jsonc` → `env.demo` |
| The D1 database `nfl-demo` | Created in the Cloudflare account, id `254f2862-3f6c-4bad-94c5-a9d25af62624` |
| The made-up players, topped up on every cron firing | `worker/demo.ts`, `test/worker/demo.test.ts` |
| The app's way in | `PoolRef.demo`, `AppModel.openDemo()`, `FrontDoorView` |

The schema applies itself on the first request, as it does for every Tally database. The first
cron firing after deploy (within 30 minutes) creates the players and fills every week so far.

## Switching it on (Corey, once, about five minutes)

Deploying needs a Cloudflare login, which the agents don't have. It's the same kind of connection
that already deploys the main site:

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** →
   `coreygwall/nfl`.
2. **Worker name: `nfl-demo`.** It has to match `env.demo.name` in `wrangler.jsonc`.
3. **Build command:** `CLOUDFLARE_ENV=demo npm run build`
   **Deploy command:** `npx wrangler deploy` (the default).
   **Production branch:** `main`.
   The Vite plugin chooses the environment at build time, so `CLOUDFLARE_ENV=demo` is what makes
   this the demo rather than a second copy of High Five.
4. Save and deploy. Wrangler creates `demo.playtally.app` as a custom domain on the `playtally.app`
   zone by itself.
5. Check it: `https://demo.playtally.app/p/demo` should show *Tally Demo*. Within half an hour the
   board should have eleven made-up names and **App Review**.

From then on every merge into `main` redeploys both Workers.

**If the deploy complains about cron triggers:** the free plan allows five per account, shared by
every Worker on it. The demo uses one and the main site uses two. If the account is already full,
remove an unused trigger from another Worker, or move the account to the paid plan.

## The App Review sign-in

Once the players exist, an agent can read App Review's code out of the demo database with the
Cloudflare connector:

```sql
SELECT claim_code FROM players WHERE name = 'App Review';
```

It goes into App Store Connect → *App Review Information* → the notes (`listing.md` has the text).
**It is not committed to this repo.** It is only a way into a made-up pool, but it is still a
password.
