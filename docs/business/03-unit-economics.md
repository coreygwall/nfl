# Unit Economics — What It Costs to Run

*The headline: **at 3 million players, Tally's infrastructure bill is roughly $4,000 a year.**
This document shows the work.*

---

## 1. Published rates (September 2026)

| Resource | Free plan | Paid plan | Source |
|---|---|---|---|
| **Workers** requests | 100,000 / day | $5/mo, incl. 10M/mo, then **$0.30/M** | Cloudflare **[sourced]** |
| **Workers** CPU | 10ms/request | incl. 30M CPU-ms/mo, then **$0.02/M CPU-ms** | Cloudflare **[sourced]** |
| **D1** rows read | 5M / day | incl. **25 billion**/mo, then **$0.001/M** | Cloudflare **[sourced]** |
| **D1** rows written | 100,000 / day | incl. **50M**/mo, then **$1.00/M** | Cloudflare **[sourced]** |
| **D1** storage | 5 GB | 5 GB-month, then **$0.20/GB-mo** | Cloudflare **[sourced]** |
| **Cron Triggers** | Free (max **5 per account**) | Free | Cloudflare |
| **Static assets** | Free | Free | Cloudflare |
| **APNs** push | Free | Free | Apple |
| **Claude Haiku 4.5** | — | **$1.00/M in, $5.00/M out** (−50% batch, −90% cached input) | Anthropic **[sourced]** |

Two platform facts that matter operationally:

- **Five Cron Triggers per *account*, not per Worker.** Tally already uses two of five. This is a
  real ceiling and it is shared with every other Worker on the account. Multi-sport scheduling must
  be built as *one* sweep that dispatches internally, never one cron per sport.
- **D1 rows-read is the resource that binds first** at very large scale, not requests. Board queries
  are the read-heavy path. Cache aggressively (§5).

---

## 2. The per-player model

### Request derivation

A player during an active NFL week:

| Action | Sessions/wk | API calls each | Subtotal |
|---|---|---|---|
| Making / editing picks | 2 | 8 | 16 |
| Checking the board after a slate | 5 | 5 | 25 |
| Incidental (push tap, rules, account) | 2 | 4 | 8 |
| **Total Worker requests / player / week** | | | **~50** |

Rounding to **50 requests/player/week → ~215/month** during an 18-week season. Off-season is
effectively zero for a single-sport product, which flatters the annual average and is exactly the
seasonality problem `01-strategy.md` § 5 flags.

### Cost per player per in-season month

At paid-plan marginal rates, ignoring included allowances:

```
Requests:   215      × $0.30/1M           = $0.0000645
CPU:        215 × 3ms × $0.02/1M CPU-ms   = $0.0000129
D1 reads:   215 × 50 rows × $0.001/1M     = $0.0000108
D1 writes:  ~45 rows × $1.00/1M           = $0.0000450
                                            -----------
                            TOTAL          ≈ $0.00013 / player / month
```

**About one-hundredth of a cent per player per month.** A 15-person pool costs roughly
**$0.002/month** to run — a fifth of a cent.

> Perspective: a single paying commissioner at $29/season covers the infrastructure for
> approximately **18,000 players for a month**.

---

## 3. Scenario cost model

Assumes an 18-week NFL season (~4.5 in-season months) and negligible off-season load.

### Scenario B — 500 pools / 7,500 players

| Line | Monthly (in season) | Annual |
|---|---|---|
| Requests: 1.6M/mo → within 10M included | $5.00 (plan floor) | $60 |
| CPU, D1 reads/writes, storage | $0 (all within included) | $0 |
| Apple Developer Program | — | $99 |
| Domain (`playtally.app`) | — | ~$15 |
| **Total** | **$5** | **~$174/yr** |

*Note: at this size the **free** plan (100k req/day = ~3M/mo) still technically covers it. Move to
paid anyway — the $5 buys headroom and removes the daily cliff that would take the pool down mid-Sunday.*

### Scenario C — 10,000 pools / 150,000 players

| Line | Calculation | Monthly |
|---|---|---|
| Requests | 32.3M/mo; (32.3 − 10) × $0.30 + $5 | **$11.69** |
| CPU | 97M CPU-ms; (97 − 30) × $0.02 | **$1.34** |
| D1 rows read | ~1.6B/mo — within 25B included | $0 |
| D1 rows written | ~6.8M/mo — within 50M included | $0 |
| Storage | <1 GB — within 5 GB included | $0 |
| **Infra subtotal** | | **~$13/mo → $59/season** |
| Apple + domain | | $114/yr |
| AI recaps (§4) | 180k recaps/season | ~$590/season |
| **Total** | | **~$763/yr** |

Against Scenario C revenue of **$39,200**, that is a **~98% gross margin** — and note that
**AI is already the largest line item**, bigger than all infrastructure combined.

### Scenario D — 50,000 pools / 750,000 players

| Line | Monthly |
|---|---|
| Requests (161M/mo) | $50.30 |
| CPU (484M CPU-ms) | $9.08 |
| D1 reads (8.1B/mo) — within included | $0 |
| D1 writes (34M/mo) — within included | $0 |
| Storage (~2 GB) | $0 |
| **Infra** | **~$60/mo → $270/season** |
| AI recaps | ~$2,950/season |
| Apple, domain, paid data feed fallback (~$100/mo) | ~$1,314/yr |
| **Total** | **~$4,534/yr** |

Against **$196,000** revenue: **~98% gross margin.**

### Scenario E — 200,000 pools / 3,000,000 players

| Line | Monthly |
|---|---|
| Requests (645M/mo) | $195.50 |
| CPU (1.94B CPU-ms) | $38.14 |
| D1 rows read (**32.3B/mo — exceeds 25B included**) | $7.30 |
| D1 rows written (135M/mo — exceeds 50M) | $85.00 |
| Storage (~6 GB) | $0.20 |
| **Infra** | **~$326/mo → $1,467/season** |
| AI recaps | ~$11,800/season |
| Support tooling, data feed, misc | ~$3,600/yr |
| **Total** | **~$16,900/yr** |

Against **$784,000** revenue: **~97.8% gross margin.**

**Observation:** across a 200,000× increase in scale, gross margin never moves. The cost structure
is not a variable in this business. Every strategic conversation should therefore be about
distribution, never about efficiency.

---

## 4. The AI cost line (the one that actually scales)

The Weekly Recap is the only component whose cost grows with usage in a way worth watching.

**Per recap**, using Claude Haiku 4.5:

```
Input:  ~4,000 tokens (board, picks, results, group history)
Output:   ~500 tokens (the recap itself)

  4,000 / 1M × $1.00 = $0.0040
    500 / 1M × $5.00 = $0.0025
                       -------
                       $0.0065 per recap
```

**Optimisations available immediately:**

- **Batch API (−50%)** — recaps are generated Tuesday morning, nothing is latency-sensitive.
  → **$0.0033/recap**
- **Prompt caching (−90% on cached input)** — the rules, format, and voice prompt are identical
  across every pool. Only the board data varies. Realistically cuts input cost ~70%.
  → **~$0.0020/recap**

**Fully optimised, a weekly recap costs about one-fifth of a cent.**

| Scale | Recaps/season | Naïve | Optimised |
|---|---|---|---|
| 10,000 pools | 180,000 | $1,170 | **~$360** |
| 50,000 pools | 900,000 | $5,850 | **~$1,800** |
| 200,000 pools | 3,600,000 | $23,400 | **~$7,200** |

**Recommendation: gate recaps to paid tiers.** Not because the cost is threatening — it isn't —
but because it is the clearest, most delightful thing to put behind the wall, and gating it aligns
the one usage-scaling cost with the revenue that pays for it. A free pool gets the board; a paid
pool gets the story.

---

## 5. Engineering decisions with real cost leverage

Ranked by how much they matter:

1. **Cache the board.** The season and week boards are the read-heavy path and they only change when
   a game settles. Cache in KV or the Cache API with invalidation on result write. At Scenario E this
   is the difference between comfortably inside the D1 read allowance and paying for it.
2. **One cron, many sports.** Five triggers per account is a hard ceiling. The existing two-expression
   design is already correct — preserve that discipline as sports are added.
3. **Batch + cache the AI calls.** ~70% saving for an afternoon's work, on the only line that scales.
4. **Keep `pick_history` append-only but prune-able.** It is the trust story and it must not be
   deleted — but a 10-year archive at Scenario E scale will eventually pass 5 GB. Plan an R2 cold
   archive for seasons older than ~3 years before it is urgent.
5. **Don't add a server you have to run.** The single-Worker architecture is the reason for the
   margin. Every "just a small Postgres" is a permanent tax on the business.

---

## 6. What actually costs money

Infrastructure is free. The real cost structure of this business is **time and attention**:

| Cost | Annual | Notes |
|---|---|---|
| Apple Developer Program | $99 | Non-negotiable |
| Domain | ~$15 | |
| Infrastructure | $60 – $1,500 | Scale-dependent, trivially small |
| AI | $360 – $7,200 | Scale-dependent, gate to paid |
| Paid data feed fallback | $0 – $2,400 | Insurance against nflverse; buy before you need it |
| Stripe fees | ~2.9% + $0.30 | ~$1,140 on Scenario D revenue |
| Apple IAP commission | 15% | Small Business Program, on iOS-originated subs only |
| **Design / brand / assets** | $0 – $3,000 | The one place worth spending real money |
| **Founder time** | *the whole thing* | The binding constraint |

> **The strategic conclusion:** stop optimising cost. There is nothing there. Spend every available
> hour on distribution and on the commissioner's return rate.

---

## Sources

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Claude Haiku 4.5 API pricing](https://pricepertoken.com/pricing-page/model/anthropic-claude-haiku-4.5)
- [Anthropic API pricing — batch & caching](https://www.finout.io/blog/anthropic-api-pricing)
