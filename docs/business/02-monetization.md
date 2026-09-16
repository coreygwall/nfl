# Monetization

*Conversion rates and revenue figures here are **models**, not measurements. Every assumption is
labelled. The purpose is to show which levers matter, not to predict.*

---

## 1. The money rule (read this first)

**Tally never holds, transfers, or takes a cut of prize money. Ever.**

This is not caution, it is strategy. The moment Tally touches a dollar of entry fee it acquires:

- **Money transmitter licensing** in up to 50 states, plus FinCEN registration.
- **Apple Guideline 5.3** exposure — real-money gaming apps must be licensed per jurisdiction,
  geo-restricted, and **free on the App Store**, and cannot use IAP for entry credit. **[sourced]**
  That single rule would kill the subscription business inside the iOS app.
- A compliance and support burden that two part-time people cannot carry.
- The family-and-office positioning that is the entire competitive premise (`01-strategy.md` § 2).

**What to build instead: the kitty tracker.** Tally records who owes what, shows a running ledger,
and hands off to Venmo / Cash App / Apple Cash via deep link. Money moves person-to-person, exactly
as it does today in the group chat. Tally is the scoreboard and the memory, never the bank. This is
*more* useful than escrow for a 15-person pool and carries none of the liability.

> The commissioner's actual pain is not "collecting money." It is *remembering who hasn't paid.*
> Solve that. It's a database column and a nudge.

---

## 2. Who pays, and why

**The commissioner pays. The players never do.**

This is the load-bearing decision in the whole model. The commissioner is the one with the pain —
the spreadsheet, the chasing, the result entry, the arguments. The players have no pain; they have
a link. Charging players puts a tollbooth in the middle of the viral loop and kills the product.

Equally important: **price per commissioner, not per player.** Per-player pricing makes the
commissioner do arithmetic about whether to invite the eleventh person, which is precisely the
behaviour that must never occur. Every pricing page in this category gets this wrong.

### The split-the-ante option (do this)

Most pools already ante. A "**the group covers it**" flow — the commissioner taps *split with the
pool*, everyone sees "$2.50 each" alongside the prize kitty — reframes a $29 ask as pocket change
and should lift conversion materially. It costs nothing to build on top of the kitty tracker
(§1) and it matches how the money already moves.

---

## 3. The freemium ladder

The paywall's job is to be **invisible to a first-time commissioner and obvious to a returning one.**
Nothing that makes a pool *work* is ever paid. What is paid is everything that makes a pool
*persist, multiply, and be fun to run.*

### Free — forever, and genuinely good

- One active pool, up to **20 players**
- The full game: picks, ranks, locking, hidden picks, weekly + season boards
- The share link, the welcome page, the rules page
- Face ID / passkeys, device codes, managed entries (up to 12)
- The iOS app, push notifications, Live Activities
- Automatic results and schedule sync
- Basic commissioner tools: roster, rename, remove, ready-tracker

**Why so generous?** Because the free tier *is* the marketing budget. Every free pool is 15 people
being shown the product by someone they trust. A stingy free tier at a $0.0002/player/month cost
structure is a strategic error.

### Tally Plus — **$29 / season** or **$49 / year**

Aimed at the commissioner running a real pool they care about.

| Feature | Why it converts |
|---|---|
| Up to **200 players** | The 21st person is the trigger. Hard paywall, unmissable, zero resentment. |
| **The record book** — every card, every call, running standings | The trigger for groups that never reach 20 people. See below. |
| **Multiple simultaneous pools** | Run High Five *and* Survivor off one link (see `06-engagement.md`). |
| **The Weekly Recap** — AI-written, group-specific, names names | The single highest-delight feature. Costs ~$0.007/pool/week (`03`). |
| **Season archive & history** | Last year's board, all-time records. Pure switching cost. |
| **Side games** — props, dares, rivalries | The engagement engine. |
| **The kitty tracker** + split-the-ante | The #1 commissioner pain. |
| **Custom pool branding** — name, colour, share card | Cheap to build, disproportionately loved. |
| CSV export, pick history, backfill | Already built. Move behind the wall. |

**The headcount wall only works for pools.** A golf foursome is four people forever and a poker
table is six to nine, so *"the 21st person"* never arrives for the families in
`09-competition-types.md`. Those need a second axis, and the ladder's own principle supplies it —
nothing that makes a competition *work* is ever paid; what is paid is everything that makes it
*persist*. A card works free: play the round, settle the skins, see the card. What costs money is
the record book — every card this year, the running standings, the head-to-heads. Free keeps the
current one and the last three.

Two consequences worth stating plainly. **Cards and Calls sell on the annual plan only**, because
"per season" means nothing to a group that plays in February and August alike — which pushes buyers
toward the plan § 6 already prefers. And the arithmetic changes: $49 a year across a foursome is
**$12.25 each**, not $1.93. Split-the-ante (§ 2) matters more for these groups, not less, because
they already settle money every time they play.

### Tally Clubhouse — **$99 / year per group**

For the group that plays all year. This is the **retention product**, and the real long-term business.

- Everything in Plus, across **unlimited pools**
- A group home at `/g/<slug>` — one place, every season
- **Cross-season, cross-sport standings**: *Group of the Year*
- Multiple commissioners / co-commissioners
- All-time record book: most weekly wins, longest streak, biggest collapse
- Group chat surface or a Slack/Discord bridge

> A group four years into a Clubhouse has a trophy case it cannot export. That, and not the game
> design, is the moat.

---

## 4. Secondary revenue — ranked by honesty

| # | Stream | Realistic? | Notes |
|---|---|---|---|
| 1 | **Commissioner subscriptions** | ✅ The business | 90%+ of revenue for the foreseeable future. Focus here. |
| 2 | **Group/Clubhouse subscriptions** | ✅ Year 2+ | Higher ARPU, far better retention. The compounding one. |
| 3 | **Sponsored pools (local)** | 🟡 Year 2–3 | A brewery or a realtor sponsors a 200-person community pool. $250–1,000/season. Genuine, but it is a *sales* business — it doesn't scale with two part-time people until there's self-serve. |
| 4 | **White-label / B2B** | 🟡 Year 2–3 | A golf club, a youth league, a company running a 500-person pool under its own brand. $500–2,500/yr. High ACV, low volume, real support burden. Splash already runs a "Partner Solutions" division here, which validates demand. |
| 5 | **Affiliate / referral** | 🟠 Careful | Sportsbook affiliate revenue is the easiest money in this category and it **detonates the brand**. Do not take it. If affiliate revenue is ever needed, take it from ticketing, merch, or streaming — not books. |
| 6 | **Prize handling / rake** | ❌ Never | See §1. |
| 7 | **Data / API licensing** | ❌ No | Nothing proprietary; nflverse is the source. |

---

## 5. The model

### Assumptions (change these, the sheet changes)

| Input | Value | Basis |
|---|---|---|
| Avg players per pool | 15 | Typical office/family pool size |
| Free → paid commissioner conversion | **8%** | Prosumer tool benchmark, 5–12% band. Unvalidated. |
| Plus / Clubhouse mix | 80 / 20 | Assumption |
| Blended ARPU (paying commissioner) | **$49/yr** | (0.8 × $39 avg) + (0.2 × $99) ≈ $51; rounded down |
| Annual paid-commissioner churn | 35% | Assumption; **this is the number to go measure** |

### Scenarios

| Scenario | Pools | Players | Paying | Gross revenue | Infra cost | Margin |
|---|---|---|---|---|---|---|
| **A — Today** | 1 | ~20 | 0 | $0 | **$0** | — |
| **B — Friends & referrals** | 500 | 7,500 | 40 | **$1,960** | ~$114/yr | ~94% |
| **C — First real season** | 10,000 | 150,000 | 800 | **$39,200** | ~$364/yr | ~99% |
| **D — Two-person business** | 50,000 | 750,000 | 4,000 | **$196,000** | ~$1,000/yr | ~99% |
| **E — Venture-scale** | 200,000 | 3,000,000 | 16,000 | **$784,000** | ~$16,900/yr | ~98% |

*Infra derivations in `03-unit-economics.md`. Revenue = paying commissioners × $49 blended ARPU.*

**The shape of this table is the point.** Revenue scales linearly; cost is effectively flat. There
is no scenario where infrastructure threatens the business. **The entire risk is on the top line** —
i.e. on go-to-market (`05`), not on engineering or ops.

### What each scenario means in practice

- **C ($39k)** is a good side business and pays for itself many times over. Reachable in one strong
  season with disciplined GTM. **This is the target for the 2026–27 cycle.**
- **D ($196k)** is where this could replace meaningful income for two people. Requires the
  playoffs and March pool types shipped and compounding across two consecutive NFL seasons.
  **This is the 3-year target.**
- **E ($784k)** is the only scenario where raising money makes sense — and by the time it's
  visible, you probably won't need to. See `07`.

---

## 6. Pricing sanity check

The paid pool-hosting market sits roughly in a **$15–30 per season** band (an NFL 33 pool on
RunYourPool is listed around **$16.95/season**). **[sourced — partial; RunYourPool's full pricing
page could not be retrieved, treat the band as indicative and re-verify before launch.]**

Tally at **$29/season** is priced slightly *above* that band, deliberately:

- It is not the same product. It includes an iOS app, passkeys, push, Live Activities, AI recaps,
  and a free tier competitors do not offer.
- Discount pricing in a category where the buyer spends ten seconds deciding signals "worse."
- $29 across a 15-person pool is **$1.93 per person per season**. With split-the-ante surfaced,
  the number the group sees is under two dollars. There is no price objection at two dollars.

**Do not launch an introductory discount.** Launch the annual plan ($49) with the seasonal plan
($29) beside it and let the annual look like the deal. The annual plan is the one that survives
the off-season.

---

## 7. What to build first (monetization only)

1. **The 20-player wall.** One number in config, one upgrade sheet. Ship before the paywall exists,
   set to a very high limit, and watch the pool-size distribution for a season before choosing where
   it really lands. Guessing the cap is the most expensive mistake available here.
2. **Stripe Checkout on web, IAP on iOS.** Apple takes 15% under the Small Business Program — budget
   for it. Steer commissioners to the web where legitimate, but never make the iOS path feel broken.
3. **The kitty tracker.** Highest pain-to-effort ratio on the board and it unlocks split-the-ante.
4. **The Weekly Recap.** The feature people will actually describe to a friend.

Everything else can wait a season.

---

## Sources

- [Apple Developer Forums — Sweepstakes and Contests (Guideline 5.3)](https://developer.apple.com/forums/thread/26098)
- [Fix Apple Gambling App Rejection (Guideline 5.3)](https://shopapper.com/fix-apple-gambling-app-rejection-guideline-5-3/)
- [RunYourPool pricing](https://www.runyourpool.com/pricing/) *(not retrievable from this environment — re-verify)*
- [Splash Inc. Partner Solutions division](https://splashsports.com/blog/splash-inc-closes-a2-funding-round-of-14-1m-launches-partner-solutions-division)
