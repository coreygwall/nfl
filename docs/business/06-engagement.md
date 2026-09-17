# Engagement — Games On Top, and Why Anyone Would Play Them

> *"Can we offer fun games on top of whatever you got invited to play here?
> What incentive might people have to do those?"*

The short answer: **yes, and the incentive is never money. It is standing in the group.**

---

## 1. The principle everything here follows

Tally cannot offer prizes (`02-monetization.md` § 1) and shouldn't want to. That looks like a
constraint and is actually a clarifying advantage, because it forces the honest question: *why do
people keep playing a pool they're losing?*

They don't play for the $200. They play because **twelve people they know will see the result.**
The pool is a device for generating things to say to each other. Points are just the excuse.

So the design rule for every side game:

> **A side game is worth building if it produces something the group will talk about.
> If it only produces a number, it's a leaderboard, and nobody needs another leaderboard.**

The three levers that actually work, in order of strength:

1. **Being named.** Public, specific, by-name recognition inside a group you belong to. Vastly more
   motivating than points. *"Corey has taken the Bears at 5 for three straight weeks"* is worth more
   than any badge.
2. **Loss aversion on a streak.** A thing you have kept going that you could break today. The
   strongest retention mechanic in consumer software and it costs nothing.
3. **Owing someone something.** A forfeit, a dare, a text you have to send. Social debt outperforms
   social credit.

---

## 2. The Weekly Recap — build this first

**What it is:** every Tuesday morning, an AI-written wrap of the group's week. Not a stats dump —
a piece of writing, in Tally's voice, about these specific people.

> **Week 6 — The Walls**
>
> Dana won the week with 13, which she will mention. The 5-pointer on Detroit was the only one
> anybody had, and she had it while the rest of the group took Kansas City for the fourth week
> running.
>
> Corey is now 0–3 on his own 5-point picks and has not moved off the Bears. This is week four.
>
> Mike and Sarah finished level on 9, which is the third time this season they've tied. Neither of
> them has won a week yet. At some point that becomes a story about both of you.
>
> Everyone survived. Nobody is more than 11 back. Thursday is Green Bay at Chicago, and one of you
> should probably take Green Bay.

**Why this is the single highest-value feature on the roadmap:**

- It is the **only** thing on this list that *creates* group conversation rather than waiting for it.
- It is the thing a commissioner forwards to the group chat — which means it is **distribution**,
  not just retention. Every recap is a Tally artifact landing in a group text, with a link.
- It is trivially cheap: **~$0.002 per pool per week** fully optimised (`03-unit-economics.md` § 4).
- It is the most natural paywall in the product. *The board is free. The story costs $29.*
- It is **defensible in a way features aren't.** A competitor can copy the feature in a week; they
  cannot copy four years of your group's history feeding the prompt.

**Build notes:**
- Generate Tuesday ~9am local, batched (−50% cost), prompt-cached (−70% on input).
- Feed it: the week's board, every pick with rank and outcome, *and the group's running history* —
  streaks, head-to-heads, repeated picks, previous recaps' callbacks. History is what makes it good.
- Hard rules in the prompt: never mean about ability, never about money, never invent a fact,
  always name at least three different people, always end on the next slate.
- Ship with a **commissioner preview + edit** before it posts. A recap that gets one fact wrong in
  week 1 kills the feature.

---

## 3. Side games — ranked by leverage

### Tier 1 — Build these

**① A second game on the same link.**
The schema already supports it (`pools`, players global to Tally). One invite, two games running:
High Five *and* Survivor off the same roster.

- **Effort:** medium — Survivor's rules are simple and the notification/segment machinery exists.
- **Why it wins:** doubles engagement with zero new acquisition, and Survivor is *the* format people
  already search for. It also converts a High Five pool into a group with two reasons to return.
- **Incentive:** Survivor's elimination mechanic does the work for free. Being out while your
  friends are alive is the most powerful thing in this entire category.

**② The Prop of the Week.**
One non-outcome question per week, asked to everyone. *"Will any game go to overtime?"* *"Will
anyone score a safety?"* *"Over/under 4 lead changes on Sunday night?"*

- **Effort:** low. One question, one binary/range answer, settles from data already pulled.
- **Why it wins:** it's the only surface where the person in last place can win something, which is
  precisely who you're trying to keep. Cheap, funny, weekly.
- **Incentive:** a separate tiny leaderboard — *Prop King* — that has nothing to do with the main
  standings. Someone will care about it specifically *because* it's silly.
- **Build it knowing what it grows into.** A prop is a question, a window, a resolution and a tally.
  Let the commissioner write the question and the group resolve it, and the same engine is **Calls**
  — the third family in `09-competition-types.md`, and the only thing on any roadmap that works in
  July. Build the prop first; do not build it in a way that assumes the question came from a feed.

**③ Streaks, surfaced aggressively.**
Not a badge cabinet. Three or four streaks that are visible on the board and in push:

- Weeks with a correct 5-point pick
- Weeks not finishing last
- Weeks with picks in before Thursday
- Consecutive weeks played (**the retention one — this is the streak that matters**)

- **Effort:** low, mostly query work.
- **Incentive:** loss aversion. A Thursday push that says *"your 8-week streak ends in 3 hours"*
  converts better than any feature you could build, and it already has the notification
  infrastructure (`shared/notify-plan.ts`) to ride on.

**④ The Rivalry.**
Auto-detect two players who keep finishing within a couple of points and just... say so. A small
head-to-head card on the board: *Corey 4 — 3 Mike, this season.*

- **Effort:** low. Pure derivation from existing data.
- **Why it wins:** it manufactures a story out of nothing. People adopt a rivalry the moment a
  scoreboard names it, and then they check the app to see it.
- **Incentive:** pure standing. This is the cheapest fun in the product.

### Tier 2 — Build after a season of data

**⑤ The Forfeit Ledger.**
Last place each week owes something the group agreed on up front — a text, a photo, buying the
coffee, a team's hat as a profile picture for a week. Tally just *tracks who owes what* and
whether it's been paid.

- **Why it's tier 2:** it's culturally excellent and completely dependent on the group already
  having that culture. Ship it as an *optional* commissioner toggle with a few presets, never a
  default. Lands beautifully in the right group and is baffling in the wrong one.

**⑥ Confidence Curve / Pick Personality.**
End-of-season profile: *"You are a Chalk Merchant. 71% of your 5-point picks were favourites, and
you finished 4th."* Archetypes — Chalk Merchant, Homer, Contrarian, Coin Flip.

- **Why it works:** it's the shareable artifact. This is the Spotify Wrapped of the pool, and the
  off-season is exactly when you need something to post.
- **Timing:** ship for the end of the 2026 season. It's the only marketing you get in January.

**⑦ Group of the Year.**
Cross-pool, cross-season standing for Clubhouse groups. NFL + playoffs + a March pool + golf majors, one table.

- **Why:** it is the mechanic that makes the Clubhouse tier worth $99, and it is the switching cost.

### Tier 3 — Considered and rejected (or deferred)

| Idea | Verdict |
|---|---|
| **Tally Chips** (non-cashable virtual currency) | **Defer.** Legally clean, but it imports casino grammar into a brand built on not being one (`04-brand.md` § 4). Standing is a better currency than points-shaped points. |
| **Live in-game side bets** | **No.** This is the sportsbook line. Crossing it costs the positioning. |
| **Expert picks / consensus data** | **No.** Turns Tally into a handicapping product and puts it in a fight with PoolGenius, Rotowire and every content site. |
| **Public / global pools with strangers** | **Defer indefinitely.** Everything good about Tally comes from the group being real people. A global leaderboard is a different product with moderation costs and no moat. |
| **Chat inside Tally** | **Defer.** The group chat already exists and Tally will lose to it. Build *for* iMessage/WhatsApp/Slack — shareable artifacts that land there — rather than trying to replace them. |

---

## 4. The incentive model, stated plainly

When someone asks "why would anyone play the side games," this is the answer:

| Mechanic | The actual incentive | Cost to build |
|---|---|---|
| Weekly Recap | **Being named in front of people you know.** | Low |
| Survivor alongside | **Elimination.** Being out while friends are alive. | Medium |
| Prop of the Week | **A way to win when you're losing.** | Low |
| Streaks | **Loss aversion on something you've kept going.** | Low |
| Rivalry | **A named opponent.** | Low |
| Forfeit Ledger | **Social debt.** You owe someone something. | Low |
| Pick Personality | **A shareable identity.** | Low |
| Group of the Year | **Years of history you'd have to abandon.** | Medium |

**Not one of these requires a prize, a deposit, or a dollar.** That is the whole design.

---

## 5. Retention: the three moments that decide everything

Most of this product's fate is settled in three specific moments. Instrument them before building
anything else.

**Moment 1 — The invited player's first 60 seconds.**
They tap a link in a group text. The bar is: *name typed → first pick saved, without leaving the
message thread's momentum.* Already close to best-in-class. Measure the drop-off at every step and
defend it. This number is the company.

**Moment 2 — Week 3, when someone is out of it.**
A player 30 points back has no reason to open the app. The weekly reset helps (it's the right design
— *"one bad Sunday is never fatal"*), but it isn't enough. This is what side games are for: the
Prop of the Week and the Rivalry exist almost entirely to serve the player in 9th place.

**Moment 3 — Next August, when the commissioner decides.**
The single most important moment in the business (`01-strategy.md` § 5). It is not won in August —
it is won in December, with an end-of-season recap and a record book worth coming back to, and
across the winter with a playoffs pool and a March product that kept the group alive between seasons.

> **The metric that matters more than any other: what percentage of commissioners run a second
> season.** Everything in this document is ultimately in service of that one number.

---

## 6. Notification discipline

Tally already has an unusually good notification design — slate-based, one message per slate you had
a pick in, deduplicated (`shared/notify-plan.ts`, `shared/segments.ts`). That restraint is an asset.
Protect it as side games are added.

**The budget: at most 4 pushes per player per week.**

| Push | When | Why it earns its place |
|---|---|---|
| Picks due | ~2h before the first slate you haven't picked | The one genuinely useful message |
| Slate settled | As each slate you had picks in finishes | The payoff moment |
| Streak at risk | Only if a streak ≥ 3 is actually live | Highest-converting, lowest-frequency |
| Weekly Recap | Tuesday morning | The delight moment |

Everything else — a rivalry update, a prop result, a badge — goes **in-app only**. The fastest way
to lose the family-friendly, low-pressure positioning is to start behaving like an app that needs
your attention.
