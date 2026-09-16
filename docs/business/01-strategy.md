# Tally — Strategy & Market

*Written September 2026, NFL Week 2. Figures marked **[sourced]** are from cited research; everything
else is a model with its assumptions stated inline.*

---

## 1. The one-paragraph thesis

Every company in this market is running toward gambling. Tally should run the other way. The
incumbents have concluded that the money is in real-money contests, and they are right — for them.
That decision vacates the largest and least-served part of the market: the ordinary group pool
played for $20 and bragging rights, the one that includes somebody's wife, somebody's kid, and
somebody's father-in-law who does not have the app and will not be getting it. Tally already has
the single hardest asset for serving that market — **an identity system where joining is typing
your name** — and an infrastructure cost of approximately zero. The business is not to out-gamble
Splash Sports. It is to become the default way a *group* keeps score, across every season of the
year, and to charge the one person who feels the pain: the commissioner.

---

## 2. What the market actually looks like

### Size

| Figure | Value | Source |
|---|---|---|
| Americans who participate in a betting pool annually | **~54 million** (≈1 in 4 adults) | AGA, via ESPN **[sourced]** |
| Americans betting on the NFL via pool / squares / paid fantasy | **11.8 million** | AGA **[sourced]** |
| Splash Sports active users (RunYourPool + OfficeFootballPool combined) | **2M+** | Splash **[sourced]** |
| Sleeper active users | **7M+** | Sleeper **[sourced]** |

The addressable universe is ~54M pool participants. If the average pool is 15 people, that is
**~3.6 million pools per year** across all sports, of which the NFL is the largest single season.
Splash's 2M users represent maybe 130k pools. **The incumbents have captured single-digit percentage
of the market.** The rest is on spreadsheets, in group texts, and on paper taped to a break-room wall.

That is the real competitor. Not Splash. **Excel.**

### Where the money has gone

- **Splash Sports** rolled up RunYourPool and OfficeFootballPool, raised **$28.6M total** (a $14.5M
  Series B in Oct 2025), and hosted **$6.4M in guaranteed contests** last NFL season — a 500% YoY
  increase. In June 2026 it announced a **Polymarket partnership** and a **$21M guaranteed survivor
  contest**. **[sourced]**
- **Sleeper** is at a **$400M valuation**, **~$85M ARR**, with **~60% of revenue from real-money
  gaming** (Sleeper Picks / Daily Draft). **[sourced]**

Read those two together and the industry's direction is unambiguous: *the pool is a customer
acquisition funnel for a betting product.* Guaranteed prize pools, prediction-market tie-ins,
player props.

### Why that is the opening

A product whose business model is real-money gaming cannot be the product you put your 11-year-old
on. It cannot be the app you text to your mother-in-law. It cannot be the thing HR is comfortable
with in a company Slack. Splash and Sleeper are structurally barred from following Tally into the
family-and-office segment, because doing so means building a second product that cannibalizes the
first.

There is also a hard platform constraint that works in Tally's favor. **Apple App Store Guideline
5.3** requires that apps offering real money gaming be licensed in every jurisdiction they operate,
be geo-restricted, and **be free on the App Store**; it also bars using in-app purchase to buy
credit for real-money gaming. **[sourced]** Every competitor pays a compliance tax Tally does not
have to pay — provided Tally never touches the money. *See `02-monetization.md` § "The money rule."*

---

## 3. Positioning

> **Tally is where your group keeps score. Not a sportsbook. Not a fantasy platform. The pool,
> done properly, for everyone you'd actually invite.**

| | Sleeper / Underdog | Splash (RYP / OFP) | ESPN / Yahoo | **Tally** |
|---|---|---|---|---|
| Core business | Real-money picks | Paid host tools → guaranteed contests | Ad-supported, portfolio filler | Commissioner subscription |
| To join a pool | Create account | Create account | Create account | **Type your name** |
| Can you enter for your kid? | No | Clumsy | No | **Yes — managed entries, built** |
| Feels like gambling? | Yes, deliberately | Increasingly | No, but feels abandoned | **No, deliberately** |
| Commissioner burden | Low | Low | Medium | **Low** |
| Cost to run per player | High | Medium | High | **≈ $0.0002/mo** (see `03`) |

### The three defensible assets

1. **Frictionless identity.** Name → in. Passkey/Face ID on the way past. Device codes for a second
   phone. This is not a feature, it is the entire funnel. Every competitor loses 40–70% of invited
   players at account creation. Tally loses ~0. *This is already built and shipped.*
2. **Managed entries.** One account can run up to 12 entries — kids, a partner, the friend who
   won't install anything. No competitor does this well because their business model needs each
   entry to be a monetizable account. *Already built.*
3. **Cost structure.** One Cloudflare Worker, one D1 database. At 1.5M players the infrastructure
   bill is roughly **$1,500/year**. That is not a rounding error on a competitor's bill — it is a
   different category of business, and it means Tally can give away a free tier that is genuinely
   good forever.

### The one thing that is *not* defensible

The game itself. High Five is a nice confidence-pool variant, but anyone can copy it in a weekend.
**Do not build the moat on game design.** Build it on identity, on the group's history, and on the
fact that the same twelve people have four seasons of standings living in one place.

---

## 4. The strategic sequence

Tally is a **group** product wearing a **pool** product's clothes. The pool is the wedge; the group
is the business. The order matters:

1. **Year 1 (now through next August):** prove the flagship weekly pool retains its commissioner,
   and prove the pool-type architecture can ship fast — a playoffs pool for January, a
   non-traditional tournament pool for March — so the *same group* has a reason to exist beyond
   just the NFL regular season. This isn't sequential with step 2; it starts immediately.
2. **Year 2:** round out the pool-type catalogue (Survivor, Majors, a traditional bracket if it
   still earns its place) once real usage data says which formats people actually want.
3. **Year 3:** the group itself becomes the object — `/g/<slug>`, cross-season standings,
   a Group of the Year. Now churn means abandoning years of history, and it stops happening.

A pool is only one of the three things a group of friends competes at, and the catalogue in step 2
is only the first family. The other two — competitions the group *plays* and resolves itself
(golf, poker), and predictions about anything at all — are named and sequenced in
`09-competition-types.md`. They change nothing above. They are the reason step 3 is worth more
than it looks: the group table gets deeper every time a family is added to it.

The schema is already shaped for this (`pools`, `pool_commissioners`, players global to Tally with a
`pool_players` join, `/g/<slug>` reserved). That is unusually good positioning for a product this
young and it should be protected — **do not take a shortcut that re-couples a player to a single pool.**

---

## 5. The honest risks

| Risk | Severity | Read |
|---|---|---|
| **Seasonality** | High | A pure NFL regular-season product is dead for most of the year. The counter isn't waiting for one big spring launch — it's the playoffs pool (January) and a non-traditional March product, both shipped on the existing pool-type architecture in weeks, not months. Nothing else on the roadmap matters as much as proving that cadence. The one structural answer is Calls (`09` § 5): no schedule, no feed, no season, and they work in July. |
| **Commissioner churn** | High | The whole business rests on one person per pool returning next season. Unmeasured today. Instrument it *this season* — it is the only metric that decides whether to raise money. |
| **Splash/Sleeper ship a free family tier** | Medium | Unlikely (cannibalization), but if Sleeper ever decouples identity, the moat narrows fast. Response: own the group-history layer, which they cannot retrofit. |
| **Apple rejection** | Low | Only becomes a risk if Tally touches prize money. Don't. |
| **nflverse dependency** | Medium | Free community data feed with no SLA. It is the single point of failure in weekly ops. Budget for a paid fallback feed (~$50–200/mo) before it matters, not after. |
| **Founder bandwidth** | High | Two part-time people. This is the real constraint, and it is why the roadmap in `08` is ruthless about sequencing. |

---

## 6. What would make me abandon this thesis

Stated up front so it can be checked against reality rather than rationalized later:

- **Commissioners don't come back.** If season-over-season commissioner retention is under ~35%,
  this is a novelty, not a business, and the right move is to keep it as a great free thing for
  friends and stop spending on it.
- **Players won't be commissioners.** If pools never spawn new pools — if the viral coefficient
  from player → commissioner is near zero — then CAC is real and the economics change completely.
- **Free tier is enough.** If paid conversion is under 3% after two full seasons with the paywall
  properly placed, the willingness-to-pay isn't there and the business is sponsorship or nothing.

---

## Sources

- [America's growing love of office pools — ESPN](https://www.espn.com/sports-betting/story/_/id/27531317/america-growing-love-office-pools)
- [Splash Sports Raises $14.5M Series B — Business Wire](https://www.businesswire.com/news/home/20251008204652/en/Splash-Sports-Raises-$14.5M-Series-B-to-Redefine-the-Way-Fans-Compete)
- [Polymarket and Splash Sports Partnership, $21M Guaranteed — Business Wire](https://www.businesswire.com/news/home/20260618552782/en/Polymarket-and-Splash-Sports-Announce-Strategic-Partnership-Launching-Worlds-Largest-Pro-Football-Survivor-Contest-with-$21-Million-Guaranteed)
- [Sleeper More Than Quadruples Valuation to $400M — Front Office Sports](https://frontofficesports.com/sleeper-more-than-quadruples-valuation-to-400m/)
- [Sleeper company profile — Tracxn](https://tracxn.com/d/companies/sleeper/__tYRPrSSLrnRPC8acmkCAeOaxsx0KdaGUvtWC_RIl9Ng)
- [Apple Developer Forums — Sweepstakes and Contests (Guideline 5.3)](https://developer.apple.com/forums/thread/26098)
