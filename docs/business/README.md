# Tally — Business Plan

*September 2026. A complete plan for turning [playtally.app](https://playtally.app) from a working
product into a business.*

---

## The thesis, in one paragraph

Every company in this market is running toward gambling — Splash Sports has raised $28.6M and just
partnered with Polymarket; Sleeper is at a $400M valuation with 60% of revenue from real-money
picks. That vacates the largest part of the market: the ordinary group pool played for $20 and
bragging rights, the one that includes somebody's kid and somebody's father-in-law who will not be
creating an account. Tally already owns the hardest asset for serving that market — **joining is
typing your name** — and runs at an infrastructure cost of roughly **$0.00013 per player per month**.
The business is not to out-gamble the incumbents. It is to become the default way a *group* keeps
score across every season of the year, and to charge the one person with the pain: the commissioner.

---

## The documents

| # | Document | What's in it |
|---|---|---|
| 1 | [Strategy & Market](01-strategy.md) | Market sizing, the competitive read, positioning, the three defensible assets, honest risks |
| 2 | [Monetization](02-monetization.md) | The money rule, freemium ladder, pricing, revenue scenarios |
| 3 | [Unit Economics](03-unit-economics.md) | Cost to run, modelled to 3M players, AI cost line, margin analysis |
| 4 | [Brand Narrative](04-brand.md) | The story, positioning statement, voice rules, visual identity, the enemy |
| 5 | [Go-To-Market](05-gtm.md) | The timing call, channels ranked, the work split, six campaigns, five metrics, first 90 days |
| 6 | [Engagement](06-engagement.md) | Games on top, the incentive model, the Weekly Recap, retention moments |
| 7 | [Partnerships & Investment](07-partnerships-investors.md) | Partner tiers, the case against raising, the acquisition path |
| 8 | [Roadmap](08-roadmap.md) | Sequencing, AI agent autonomy, what's explicitly not being built |
| 9 | [The Three Kinds of Competition](09-competition-types.md) | Pools, Cards and Calls: the taxonomy, the naming, what golf costs the architecture, where it lands in the sequence |

---

## The nine conclusions

1. **Don't touch prize money — ever.** It triggers money-transmitter licensing and Apple Guideline
   5.3, and it destroys the only differentiated position available. Build a kitty *tracker* that
   hands off to Venmo instead. → `02` § 1
2. **Charge the commissioner, never the players, and never per-player.** Per-player pricing makes
   the commissioner hesitate over the eleventh invite, which is the one behaviour that must never
   happen. → `02` § 2
3. **Don't wait for one big spring launch — ship continuously.** The bulk NFL pool-formation window
   closes in September, but that's an argument against a big generic re-launch push, not against
   marketing or building. An NFL playoffs pool ships before Wild Card weekend, and a non-traditional
   March Madness product (not another bracket clone) ships with real runway before Selection Sunday
   — both fast builds on the existing pool-type architecture, both with marketing running the whole
   time. → `05` § 1
4. **Cost is not a variable in this business.** Gross margin is ~98% at every scale from 20 players
   to 3 million. Stop optimising it; spend every hour on distribution. → `03`
5. **The Weekly Recap is the highest-value unbuilt feature.** It costs ~$0.002/pool/week, it's the
   most natural paywall in the product, and it's *distribution* — it's the thing a commissioner
   forwards to the group chat. → `06` § 2
6. **Side games run on standing, not money.** Being named, streak loss-aversion, and social debt.
   Not one of them needs a prize. → `06` § 4
7. **Don't raise.** There's nothing to spend it on at $60/year of infrastructure, the metric that
   would justify it takes twelve months to measure, and venture money will push the product toward
   the gambling model that is the whole thing being avoided. → `07` Part Two
8. **Measure one number above all others: what percentage of commissioners run a second season.**
   Below ~35%, this is a novelty. Above 50%, it's a business. Nothing else is decidable until it's
   known. → `05` § 6
9. **There are three kinds of competition here, not one.** A **pool** is you predicting something a
   feed decides. A **card** is you playing something the group decides — golf, poker. A **call** is
   you predicting anything at all, resolved by the group. The roster of people is what makes them
   one product rather than three, and Calls are the only thing on any roadmap that works in July.
   → `09`

---

## What's already built (and why it matters commercially)

Most of the hard engineering is done. The commercial significance is easy to miss from the code:

| Built | Commercial meaning |
|---|---|
| Name-to-play identity, passkeys, device codes | **The funnel.** Competitors lose 40–70% at account creation. |
| Managed entries (12 per account) | **The family segment.** Nobody else serves it. |
| Slate-based push + Live Activities | Engagement infrastructure the Recap and streaks ride on for free. |
| Automatic results + schedule sync via cron | Weekly ops cost ≈ zero. No support burden on Sundays. |
| Append-only `pick_history` | The trust story, and what makes aggressive agent autonomy safe. |
| `pools` / `pool_commissioners`, players global to Tally | **Multi-pool and Clubhouse are a migration, not a rewrite.** |
| Native iOS app, SwiftUI / iOS 26 | The App Store featuring pitch — the best free channel available. |
| Single Worker + D1 | The 98% gross margin. |

**Where the product goes after the pool:** three families, one group — see `09`. The pool is the
only one built; the other two are named, sequenced and costed there.

**The three things blocking revenue right now:** the APNs key (push is built and silent), the App
Store listing, and a paywall that doesn't exist yet. None of them is hard. → `08` § 2
