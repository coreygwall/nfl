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

## 3. What is paid, and what is never paid

**Price what costs. Never price what counts.**

That is the whole rule, and it is sharper than the one it replaces (*"what makes a pool persist,
multiply and be fun to run"*), which turned out to justify charging for almost anything.

- **What costs**: compute that runs per use (anything generative), atoms (something printed and
  posted), and time (support, setup, custom work). These have a marginal cost and it is honest to
  price them. A person can be told *why*.
- **What counts**: players, entries, pools, cards, rounds, seasons, years of history. Every one of
  these is a number that goes up, costs a fraction of a cent, and is either growth or retention.
  Pricing any of them taxes the thing you most want to happen.

Two rules follow, and both are absolute:

1. **No feature is ever made worse to create a reason to pay.** If something is good and cheap, it
   ships free and stays free. A product that is deliberately worse than it could be is a product
   that deserves the churn it gets.
2. **A group's own history is never paid.** More on this below, because it is the one the plan got
   most wrong.

### Why history has to be free

`02` used to put the record book — every card, the running standings, the four-year head-to-head —
behind the wall, as the conversion trigger for groups too small to hit a headcount cap. That is
wrong three times over.

It costs a query. Under the rule above that ends the argument on its own.

It is the moat, and the plan says so: *"A group four years into a Clubhouse has a trophy case it
cannot export. That, and not the game design, is the moat."* A trophy case you have to pay to look
into is not a switching cost. It is a fence, and the lesson it teaches is *don't put four years of
your group's results somewhere that can be taken away.* The moat only works if people keep looking
in, and they only keep looking in if it is always there.

And it taxes exactly the wrong group. The four-year head-to-head is what makes somebody open the app
in March, when nothing is running. Charging for it means the groups who have been here longest hit
the most friction, which is backwards in every direction.

**Decision: the record book, the archive and all cross-season history are free, permanently, at
every tier.**

### And the headcount wall goes with it

Consistency demands it. The 21st player costs a fraction of a cent, and one more person in a pool is
the single best thing that can happen to it. § 2 already says per-player pricing *"makes the
commissioner do arithmetic about whether to invite the eleventh person, which is precisely the
behaviour that must never occur"* — a 20-player cap is that same arithmetic with one big step in it
instead of twenty small ones.

This is expensive to admit, because the cap was the plan's primary conversion trigger and there is
no drop-in replacement. What replaces it is not another gate. See *What is actually left to sell*,
below.

### Free — forever, and genuinely good

- Pools, cards and calls, with **as many people in them as you like**
- The full game: picks, ranks, locking, hidden picks, weekly + season boards
- **Every season you have ever played**: the archive, the record book, the head-to-heads
- The share link, the welcome page, the rules page
- Face ID / passkeys, device codes, managed entries (up to 12)
- The iOS app, push notifications, Live Activities
- Automatic results and schedule sync
- Basic commissioner tools: roster, rename, remove, ready-tracker

**Why so generous?** Because the free tier *is* the marketing budget. Every free pool is 15 people
being shown the product by someone they trust. A stingy free tier at a $0.0002/player/month cost
structure is a strategic error.

### What is actually left to sell

Four things, in descending order of how well they survive contact with the rule.

**1. Compute, at cost-plus.** The Weekly Recap and every generative feature after it. This is the
one line in `03-unit-economics.md` that genuinely scales with use — at Scenario E the recaps cost
**$11,800 of a $16,900 bill**, more than everything else combined. Charging for it is honest,
explicable in one sentence (*"this one costs us money every time it runs"*), and self-limiting.

**2. Atoms.** The end-of-season record book, printed and posted. A trophy with the winner's name on
it. Stickers. A real scorecard for a golf group's season. Higher margin than software, no recurring
obligation, and emotionally a *gift* rather than a toll — which is the right register for a product
people are already sentimental about. This is also the honest answer to *"what do we sell a
foursome?"*: nothing recurring. We sell them an object in December.

**3. Support, not features.** An optional paid tier with no gate behind it — or a cosmetic one
(a badge, a colour, a custom share card) — that carries the recaps and says plainly what it funds.
This works precisely *because* the free product is complete. It is also the only model that fits the
actual numbers; see below.

**4. Partnerships.** § 4 ranks them. The two that fit are a club, league or company running its own
pools (already #4 there), and local sponsorship of a large community pool (#3). Cards make the first
one materially better, because a member-guest *is* a Card and a golf club is a buyer that already has
a budget line for it. Sportsbook affiliate money remains a no (#5), at any price.

### The arithmetic that makes this work

Strip the recaps out of `03` and the free product costs almost nothing to run:

| Scale | Infra without recaps | Supporters at $25 net to break even | As a share of commissioners |
|---|---|---|---|
| **C** — 10,000 pools | ~$173/yr | **7** | 0.07% |
| **D** — 50,000 pools | ~$1,584/yr | **64** | 0.13% |
| **E** — 200,000 pools | ~$5,100/yr | **204** | 0.10% |

**About one commissioner in a thousand, at $25 a year, funds a free product for everyone else** — and
the ratio barely moves across three orders of magnitude, because the cost is flat and the base is
not. That is not a SaaS conversion problem. It is a public-radio problem, and it is a much easier
one.

So the goal is stated plainly rather than modelled optimistically: **cover the cost of running it,
then whatever is above that is a business if it wants to be.** Objects, partnerships and B2B are the
upside, and none of them is load-bearing.

### Tally Club — **$29 / year**, and nothing is behind it

One paid tier, annual only (*"per season"* means nothing to a golf group that plays in February and
August alike). What it carries:

- **The Weekly Recap** and everything generative after it — the things that cost per use
- Custom branding: pool colour, share card, the group's name on things
- A supporter mark, if they want one shown
- First access to whatever is in Labs
- The kitty tracker + split-the-ante, if it turns out to cost support time rather than compute

What it does **not** carry: player counts, pool counts, history, export, the archive, the record
book, or any part of the game. Cancelling loses the recaps and the paint. It never loses the group's
own record.

> The old ladder's Clubhouse tier promised *"a trophy case it cannot export"*. The trophy case is now
> free and exportable, and the moat is that nobody wants to leave the place their group's whole
> history already lives. That is a better moat. It is built on affection rather than on hostage-taking.

---

## 4. Secondary revenue — ranked by honesty

| # | Stream | Realistic? | Notes |
|---|---|---|---|
| 1 | **Tally Club (§ 3)** | ✅ Covers the bill | Funds the free product at ~0.1% take-up. Not a growth engine, and not meant to be. |
| 2 | **Objects** — printed record books, trophies, stickers | 🟢 Seasonal | Real margin, no recurring obligation, and the one thing a four-person golf group will genuinely buy. December business. Needs a print partner, not a platform. |
| 3 | **Sponsored pools (local)** | 🟡 Year 2–3 | A brewery or a realtor sponsors a 200-person community pool. $250–1,000/season. Genuine, but it is a *sales* business — it doesn't scale with two part-time people until there's self-serve. |
| 4 | **White-label / B2B** | 🟡 Year 2–3 | A golf club, a youth league, a company running a 500-person pool under its own brand. $500–2,500/yr. High ACV, low volume, real support burden. Splash already runs a "Partner Solutions" division here, which validates demand. **Cards raise this**: a member-guest is a Card, and a club has a budget line for it. |
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

> **These scenarios predate § 3 and no longer follow from it.** They assume 8% conversion driven by a
> headcount gate that no longer exists. Read the *cost* column, which is measured and still true, and
> treat the *revenue* column as the ceiling of a model that has been deliberately abandoned. The
> replacement target is in § 3: cover the bill, then decide. Redo this table when there is one real
> season of take-up to put in it rather than a benchmark.

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

1. **The Weekly Recap.** It is both the feature people describe to a friend *and* the only thing
   there is to charge for. It was fourth on this list when a wall was doing the converting; with no
   wall it is first by a distance.
2. **The record book, free and good.** Every season, every head-to-head, exportable. It is the moat,
   it costs a query, and under § 3 it can now be built without arguing about which half is paid.
3. **Stripe Checkout on web, IAP on iOS.** Apple takes 15% under the Small Business Program — budget
   for it. Steer commissioners to the web where legitimate, but never make the iOS path feel broken.
4. **The kitty tracker.** Highest pain-to-effort ratio on the board and it unlocks split-the-ante.

Everything else can wait a season. The headcount cap, previously first here, is **not being built**.

---

## Sources

- [Apple Developer Forums — Sweepstakes and Contests (Guideline 5.3)](https://developer.apple.com/forums/thread/26098)
- [Fix Apple Gambling App Rejection (Guideline 5.3)](https://shopapper.com/fix-apple-gambling-app-rejection-guideline-5-3/)
- [RunYourPool pricing](https://www.runyourpool.com/pricing/) *(not retrievable from this environment — re-verify)*
- [Splash Inc. Partner Solutions division](https://splashsports.com/blog/splash-inc-closes-a2-funding-round-of-14-1m-launches-partner-solutions-division)
