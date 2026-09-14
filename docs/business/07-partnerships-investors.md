# Partnerships & Investment

---

## Part One — Partnerships

Ranked by *what they're actually worth divided by what they cost to get.*

### Tier 1 — Pursue now, cheap, high leverage

**① Apple.**
The most valuable partner available and it costs nothing but craft. The iOS app is SwiftUI on
iOS 26, using Liquid Glass, passkeys, Live Activities, associated domains and push — exactly the
profile Apple's editorial team features, because featuring apps that showcase current-OS
capabilities is what that team is *for*.

- **Ask:** App Store featuring around the NFL season and March Madness.
- **How:** submit through App Store Connect's featuring nomination form, 6–8 weeks ahead of the
  seasonal moment. Lead with the passkey/Live Activity story, not the pool.
- **Worth:** a single feature placement exceeds every paid channel available at this budget.
- **Blocked on:** the app actually shipping. It is the highest-leverage unblocked item on the board.

**② nflverse (and the open data community).**
Tally's entire results and schedule pipeline runs on nflverse — a free community project with no SLA.

- **What to do:** sponsor it. A small recurring contribution plus public credit costs very little
  and materially de-risks the single point of failure in weekly ops (`01-strategy.md` § 5).
- **Also:** identify and budget a commercial fallback feed (SportsDataIO, Sportradar, or similar)
  **before** you need it. Roughly $50–200/mo. The moment to buy insurance is not the Sunday it breaks.

**③ Venmo / Cash App / Apple Cash — as deep links, never integrations.**
The kitty tracker (`02-monetization.md` § 1) hands off to whichever app the group already uses.

- Deliberately *not* a partnership. No API, no agreement, no money touched. Just a link.
- If a real partnership is ever offered, decline anything that involves holding funds.

### Tier 2 — Real value, requires a season of proof

**④ Slack and Discord.**
A Tally bot that posts the board into the channel where the office pool already lives. Directory
listings in both app marketplaces are genuine free distribution into the workplace segment, and the
workplace segment is where the sportsbook competitors are least welcome.

**⑤ Golf clubs, youth leagues, community organisations.**
White-label pools under their own name (`02` § 4). High ACV ($500–2,500/yr), low volume, real
support burden. Worth 5–10 pilot customers to learn the shape; not worth a sales motion yet.

**⑥ Group-chat surfaces — iMessage / WhatsApp.**
Not integrations: **artifacts**. A weekly recap that unfurls beautifully in iMessage, a board image
worth pasting. The product's distribution already runs through group chats; make the things that
land there good enough to be forwarded. Higher return than any formal partnership on this list.

### Tier 3 — Considered, declined

| Partner | Verdict |
|---|---|
| **Sportsbooks (DraftKings, FanDuel, ESPN Bet)** | **No.** The most available money in this category and the fastest way to become the thing Tally exists in opposition to. Decline in advance, in writing, so it isn't decided under revenue pressure. |
| **Prediction markets (Polymarket, Kalshi)** | **No.** Splash has taken this road (a $21M guaranteed survivor contest, June 2026). That road is now taken and it isn't Tally's. |
| **Fantasy platforms (Sleeper, Underdog)** | Not as partners — as **acquirers** (Part Two § 4). |
| **Media (Barstool, The Athletic, local radio)** | **Later.** Genuine reach into exactly the right audience, but they will want revenue share or equity and there's nothing to share yet. Revisit at 50,000 pools. |
| **Team / league licensing** | **No.** Expensive, slow, and Tally's value has nothing to do with official marks. |

---

## Part Two — Investment

### 1. The recommendation: **don't raise. Not yet, and possibly not ever.**

This is the opinionated part, so here is the reasoning rather than the conclusion.

**Why raising now would be a mistake:**

- **There is nothing to spend it on.** Infrastructure costs ~$60/year at current scale
  (`03-unit-economics.md`). The constraint is founder attention, and capital doesn't buy that back
  for two people with day jobs — it converts a great side project into an obligation with a
  liquidation preference attached.
- **The key metric doesn't exist yet.** Commissioner season-over-season retention takes twelve months
  to measure. Raising before you know it means raising on a story; if the number comes back at 20%,
  you've sold equity in something you'd otherwise have cheerfully wound down.
- **Venture math doesn't fit.** A fund needs a plausible path to $100M+ revenue. At $49 ARPU that's
  2 million paying commissioners — roughly 25 million pools, seven times the entire estimated annual
  US pool market (`01-strategy.md` § 2). The honest answer is that **this is a great $1–5M revenue
  business and a poor venture business**, and the second you take venture money you're obliged to
  pretend otherwise.
- **Capital would push the product toward gambling.** A board looking at Sleeper's 60%-from-real-money
  revenue mix will ask the obvious question every quarter. The positioning in `01` and `04` survives
  only as long as nobody at the table needs it not to.

**The bootstrap case is genuinely strong:**

At Scenario D (`02-monetization.md` § 5) this is **~$196,000/year at ~98% gross margin**, run by two
people, with costs under $5,000. That's not a consolation prize — it's a better outcome for the
founders than most venture paths, and it keeps every strategic decision in-house.

### 2. What would change the answer

Raise only if **all three** of these are true:

1. Commissioner season-over-season retention is **>50%** — measured, over two real seasons.
2. There's a specific thing money buys that time cannot: a licensed data feed at scale, a real
   support team, or a March Madness window that will not wait.
3. There's an investor who understands that *not* being a gambling company is the thesis, and will
   still be saying so in year three.

### 3. If you do raise: the shape

| Stage | Amount | Use | When |
|---|---|---|---|
| **Angel / friends** | $100–250k | Contract iOS + design help; buy back founder time | Only after two seasons of retention data |
| **Pre-seed** | $500k–1.5M | 2–3 hires, multi-sport buildout, the Aug 2027 push | 2028 at the earliest, and only if §2 holds |
| **Seed** | $3–5M | Only if Clubhouse retention proves a genuine platform | 2029+ |

**The right angel profile** is not a sports-betting investor. It's someone from consumer subscription
or family/social software who has personally run an office pool and found it annoying. They exist,
they write $25–50k checks, and they will be more useful than a fund.

### 4. The acquisition path (the likeliest good outcome)

This is worth planning for deliberately, because it's the most probable meaningful exit and the
things that make Tally attractive to an acquirer are things worth building anyway.

**Who would buy it, and for what:**

| Acquirer | What they'd actually be buying |
|---|---|
| **Splash Sports** | The free/family tier they structurally cannot build, plus frictionless identity to cut their own funnel drop-off. They have raised $28.6M and are consolidating this exact category — they are the most likely buyer. |
| **Sleeper** | The under-25 and over-45 segments their real-money product can't reach, and a clean iOS/passkey implementation. |
| **Yahoo / ESPN** | A modern replacement for pick'em products that have been on maintenance for a decade. |
| **A media company** | An audience-retention product that isn't a sportsbook — increasingly valuable as gambling partnerships get politically expensive. |

**What makes Tally acquirable, in priority order:**

1. **The identity system.** Name-to-play with passkey upgrade and managed entries, proven at scale.
   This is a hard engineering problem with a measurable conversion delta, and it's the asset any
   acquirer can drop into their own funnel on day one.
2. **Commissioner retention data.** A defensible number beats any narrative.
3. **The brand.** Being the non-gambling option becomes *more* valuable as regulatory and reputational
   pressure on the category increases, not less.
4. **The cost structure.** An acquirer running a similar product on conventional infrastructure will
   find a 98% gross margin genuinely interesting.

**What to avoid doing** if this is the likely path: don't take sportsbook money (poisons the asset
for a non-gambling acquirer and doesn't help a gambling one), don't build a real-money feature
(destroys the only differentiated thing), and don't sign an exclusive with any single platform.

### 5. Practical housekeeping, cheap and worth doing now

- **Form an LLC** before taking the first dollar. Separates personal liability from a product that
  hosts other people's contests, however innocuous.
- **Trademark "Tally"** in the relevant class — it is a common word and the mark will be contested
  eventually. `playtally.app` is already held, which helps.
- **Terms of Service and Privacy Policy** before the paywall. Say explicitly that Tally does not
  handle prize money and is not a gambling service. That paragraph is both legal protection and
  brand statement.
- **Keep a clean cap table.** No advisor equity, no handshake splits. The single most common reason
  a good small acquisition falls apart.

---

## Sources

- [Splash Sports Raises $14.5M Series B — Business Wire](https://www.businesswire.com/news/home/20251008204652/en/Splash-Sports-Raises-$14.5M-Series-B-to-Redefine-the-Way-Fans-Compete)
- [Polymarket × Splash Sports, $21M guaranteed — Business Wire](https://www.businesswire.com/news/home/20260618552782/en/Polymarket-and-Splash-Sports-Announce-Strategic-Partnership-Launching-Worlds-Largest-Pro-Football-Survivor-Contest-with-$21-Million-Guaranteed)
- [Sleeper valuation — Front Office Sports](https://frontofficesports.com/sleeper-more-than-quadruples-valuation-to-400m/)
- [Splash Partner Solutions division](https://splashsports.com/blog/splash-inc-closes-a2-funding-round-of-14-1m-launches-partner-solutions-division)
