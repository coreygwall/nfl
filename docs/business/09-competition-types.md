# The Three Kinds of Competition

> *"One is where the participant is not involved in the outcome, and one where they are — friends
> playing golf, or poker. And making predictions about things to see what comes true."*

Everything Tally has shipped so far is one kind: you predict, a feed decides. This document adds
the other two, names them, and says what they cost.

---

## 1. The axis nobody had named

Two questions separate every competition a group of friends can have.

**Are you in the outcome?** In the NFL pool you are not — you predict, and eleven other people and
a football game do the rest. On a golf course you are the outcome.

**Who decides what happened?** A feed, or the group. The first is settled before anyone opens the
app. The second is somebody writing down a 5 on the par 4.

|  | **A feed decides** | **The group decides** |
|---|---|---|
| **You predict** | **Pools** — High Five, Survivor, playoffs, March, Majors | **Calls** — anything you can be right about |
| **You play** | *(mostly empty — see below)* | **Cards** — golf side games, the poker ledger |

The fourth quadrant — you play, a feed decides — is real but thin: a timed race, a step challenge,
a Strava segment. Each is a third data-integration problem for a smaller audience. **Not now.**

The two questions are not academic. They decide where the truth comes from, and *that* is the only
thing in the architecture this broadening actually breaks (§ 7).

---

## 2. Why this is one brand and not three

The case is already written down in `01-strategy.md` § 4:

> Tally is a **group** product wearing a **pool** product's clothes. The pool is the wedge; the
> group is the business.

Cards and Calls are that sentence taken seriously. The twelve people in the NFL pool are largely
the same people in the Saturday foursome and the same people arguing about whether Dana will
actually move to Denver. **The roster is the asset.** A pool is one thing that roster does for four
months of the year.

This does not dilute the monetization thesis — it is the thesis. `06-engagement.md` § 3 ⑦ already
imagines Group of the Year as "NFL + playoffs + a March pool + golf majors, one table," and calls it
the mechanic that makes Clubhouse worth $99. Every family added to that table makes the $99 easier
to justify and the switching cost higher. A group four seasons deep that also has three years of
Saturday golf cards in the same record book is not going anywhere.

There is one honest counter, and it is operational rather than strategic. `08-roadmap.md` § 1:
*"Two part-time people and a fleet of agents. Sequence ruthlessly. Ship fewer things."* Three
families is three surfaces. The answer is in § 8: one of them is nearly free because it is already
on the roadmap under another name, and the other is gated behind a decision that has to be made
anyway.

### The filter

Before anything joins the catalogue it passes all five. This is the no-machine, and it is meant to
be used to reject things.

1. **A closed group of people who know each other.** No strangers, no global leaderboard.
2. **A bounded or repeating set of events.** A season, a tournament, a round, a question with a
   date on it.
3. **Somebody currently keeps score by hand.** This is where the pain is, and it is the whole
   product. *(`01-strategy.md` § 2: the real competitor is Excel.)*
4. **It settles itself once the rule is agreed.** Arithmetic, not judgement.
5. **Winning is worth saying out loud.**

Golf skins passes. Poker night passes. "Will the Fed cut in March" passes. "Who is the better
cook" fails at four and always will. Public pools with strangers fail at one, which is why they are
already rejected in `06-engagement.md` § 3 Tier 3.

---

## 3. What these are called

`04-brand.md` § 6 has the naming architecture and one rule that matters: **Tally is never the name
of a game.** Extending it:

| Layer | Name | Example |
|---|---|---|
| The company / app | **Tally** | `playtally.app` |
| A **family** of competition | Pool · Card · Call | "start a card" |
| A *type* within a family | The game's name | High Five, Survivor, Skins, Nassau |
| An *instance* | The group's own name | "Wall Street Bowl 2026", "Saturday at Fossil Trace" |
| A group | The group's name | "The Walls" at `/g/the-walls` |

**Pool** stays exactly as it is. It is on the owned-words list and it is the right word for the
thing it describes.

**Card** is what a foursome already keeps. It is paper, it is the design language the product
already wears, and it sits naturally beside *board*: the card is what you fill in, the board is
where you stand. "Start a card" reads correctly to a golfer with no explanation.

**Call** is what you make and what you were right about. *I called it.* It is short, it is an
ordinary English idiom for exactly this act, and it carries no regulatory freight.

### Not "prediction market" — ever, in public

The instinct is understandable and the phrase should still never appear on a Tally surface. Three
reasons, in order of weight:

1. **It is the frame Tally is defined against.** `01-strategy.md` cites Splash's Polymarket
   partnership as the evidence that the industry is running toward gambling. Adopting the same
   vocabulary puts Tally in that sentence voluntarily.
2. **It is becoming a regulated term.** Prediction markets are a live question for the CFTC and an
   active area of App Store scrutiny. A product with no money in it does not need to answer
   questions that only apply to products with money in it.
3. **`04-brand.md` § 4 already has a hard list** of words Tally does not use, and it exists to stop
   exactly this drift. Add *prediction market*, *market*, and *odds-on* to it.

Internally it is a fine shorthand — it describes the mechanic accurately, and this document uses it
nowhere else. Externally the family is **Calls**.

---

## 4. Cards — where the players are the scorekeepers

### The golf formats, and the one that is actually the product

| Format | The rule | What it needs |
|---|---|---|
| **Skins** | Low score on a hole wins the skin. A tie carries it to the next hole. | Per-hole scores, carryover |
| **Match play** | Holes won, lost or halved. Ends when a player is up more holes than remain. | Running hole differential, "3 and 2" |
| **Nassau** | Three matches at once: front nine, back nine, and the eighteen. | Match play, three concurrent results |
| **Wolf** | The wolf rotates each hole, picks a partner after the tee shots or goes alone for more. | Order rotation, per-hole partner choice |
| **Stableford** | Points against par, so a blow-up hole costs you one hole rather than the round. | Net par per hole |

Four of those are arithmetic anybody can do. The fifth thing on the list is the actual product:

> **Handicap strokes are the reason the side game falls apart, and the reason Tally wins it.**
> Nobody abandons a skins game because they cannot subtract. They abandon it because nobody agrees
> who gets a stroke on the 7th. Hold the course's stroke index and each player's handicap, and a
> ten-minute argument on the tee becomes a setting nobody has to look at again.

That is the same shape as the pool's real value. The pool does not win because scoring five picks
is hard. It wins because *keeping* the score is a job, and Tally takes the job.

### Poker, honestly

Poker night is a **ledger**, not a scorer. Buy-ins, rebuys, what everyone walked away with. That is
the kitty tracker from `02-monetization.md` § 1 with a different noun on it, and it needs no new
engine.

Two disciplines apply. Tally records what the night came to; it does not deal, shuffle, run a clock
or hold a cent. And of the three families, this is the one whose optics sit closest to the line the
whole plan is built to stay behind — so it ships after Cards has proven itself on a golf course, not
alongside it.

### What is genuinely new

Cards are the expensive family. Four things are different in kind, not degree:

1. **The group is the authority.** Covered in § 7. This is the deep one.
2. **It is live and in your hand.** Four hours, one thumb, a phone in a back pocket, and cell
   coverage that is a rumour on half the course. Everything shipped so far assumes a request
   succeeds. Cards need local entry that syncs later.
3. **It lasts four hours, not four months.** A pool is a season with a stable roster. A card is a
   morning. That makes the *group* the durable object much sooner than the Year 3 plan in
   `01-strategy.md` § 4 assumed, because a foursome that plays monthly is a group with thirty short
   cards, not a pool.
4. **Results can be disputed.** A pool has no disputes, because the feed is the feed. Two people
   disagreeing about a 6 on the 12th is a support ticket with no right answer, and it weakens the
   "no support burden" claim in `03-unit-economics.md`. Design for it: every entry is attributable,
   every change is visible, and the group resolves it in the app rather than in a text thread.

### The money temptation, restated because it is stronger here

The parking-lot settle-up is a real pain and it will be tempting to solve it properly. Do not.
`02-monetization.md` § 1 holds without amendment: **track what is owed, hand off to Venmo, never
touch a cent.** Cards raise the temptation, not the rule.

### The gap in the 5.3 argument

`02-monetization.md` § 1 argues Apple Guideline 5.3 exposure entirely as a consequence of *touching
money*. That argument is correct and incomplete, and Cards are where the incompleteness starts to
matter:

> **App Review reads the screen, not the ledger.** A skins game with a dollar column, or a poker
> night with buy-ins and a running balance, looks like a book to a reviewer who has thirty seconds
> and no access to the fact that no money moves through Tally. Zero dollars in the system is a
> complete answer to the *law* and a partial answer to the *reviewer*.

Two rules follow, and they are cheap:

- **Denominate in the unit the game uses, not in dollars, by default.** Skins are skins. Holes are
  holes. A nassau is three matches. The money column is an optional commissioner setting that is
  off until someone turns it on, and it says *owed*, never *odds* or *stake*.
- **Read 5.3 against the actual screens before building the ledger UI**, not at submission.
  `07-partnerships-investors.md` § 5 already requires terms that say Tally does not handle prize
  money and is not a gambling service; the poker screen is the one that has to be able to stand
  behind that sentence visually.

---

## 5. Calls — the cheapest family, and the answer to the worst risk

A call is four things: a question, a window to answer it, a resolution, and a tally of who was
right. That is all.

- **Question shapes:** yes/no, over/under a number, one of several, a date.
- **Who resolves:** the commissioner, or a majority of the group, or a feed where one happens to
  exist. Never the person who wrote the question, alone.
- **The guardrail:** a call is about something that will be *knowably* true. "Will it snow in
  Denver on Christmas" is a call. "Is Dave a good driver" is an argument. This is filter question
  four doing its job.

**Calls are already on the roadmap under another name.** `06-engagement.md` § 3 ② is the Prop of
the Week — one question a week, binary answer, settles from data already pulled, with its own silly
little leaderboard. A Call is the same object with two changes: the commissioner writes the
question, and the group can resolve it. The engine is the same one.

And it answers the highest-severity risk in the entire plan. `01-strategy.md` § 5 puts
**seasonality** at the top: *"a pure NFL regular-season product is dead for most of the year."* The
existing counters are a January playoffs pool and a March product — both still tied to a sports
calendar. Calls have no schedule, no feed and no season. They work in July, which is the month the
product currently has nothing to do.

---

## 6. What it costs the business model

This is the part a taxonomy usually skips, and it is where the real damage is. Three load-bearing
things in `02-monetization.md` are written in the shape of a fifteen-person NFL pool and do not
survive the transfer intact.

### The paywall has no trigger for a foursome

The conversion mechanic is a headcount wall: free is one pool up to 20 players, Plus is up to 200,
and *"the 21st person is the trigger. Hard paywall, unmissable, zero resentment."* A golf foursome
is four people forever. A poker table is six to nine. **The wall never fires**, which means half the
broadened product has a free tier and no way out of it.

The second axis is already implied by the ladder's own stated principle:

> *"Nothing that makes a pool work is ever paid. What is paid is everything that makes a pool
> persist, multiply, and be fun to run."*

A card **works** for free — play the round, settle the skins, see the card. What costs money is that
it **persists**: the running record across every round this year, the head-to-heads, the recap, the
record book. So:

| Family | Free stops at | Paid unlocks |
|---|---|---|
| **Pools** | The 21st player *(unchanged)* | 200 players, multiple pools |
| **Cards** | The current card and the last three | The record book — every card, running standings, head-to-heads |
| **Calls** | The open questions | The history of who was right |

That is one number and one query, not a new pricing model, and it is a better trigger than a
frequency cap — which would tax exactly the groups worth keeping.

### "Per season" is undefined outside a sport

`02-monetization.md` § 3 sells **$29/season** beside **$49/year**, and its § 6 notes the annual plan
*"is the one that survives the off-season."* Golf side games and calls have no season, so the seasonal SKU
is meaningless for them. **Cards and Calls sell on the annual plan only.** This does not weaken the
pricing page; it pushes buyers toward the plan the plan already prefers.

### The arithmetic that sells $29 is fifteen-person arithmetic

*"$29 across a 15-person pool is $1.93 per person per season… There is no price objection at two
dollars."* Across a foursome, $49 a year is **$12.25 each**. Across a regular twelve-person golf
group, **$4.08**. The first number needs a different sentence than the second, and split-the-ante
(`02` § 2) matters more here rather than less, because these groups already settle money every
single time they play.

### And the commissioner premise bends

*"The commissioner is the one with the pain… The players have no pain; they have a link."* In a
foursome everybody has the pain and nobody has only a link. The model survives, because somebody
still sets the card up, holds the handicaps and settles it — the person with the app is the
commissioner whether or not anyone calls them that. But the *pitch* changes, and the pricing page
for Cards has to talk to a group rather than to an administrator.

---

## 7. What it costs the architecture

One change is deep. The rest is ordinary work.

### The league office inverts

`CLAUDE.md` states the rule that the whole results system is built on:

> Every pool scores the same NFL games, so results are never a commissioner's to set.

That is correct for Pools and wrong for the other two families. A golf card's truth belongs to the
four people who played it. A call's truth belongs to whoever the group said it belongs to.

So a contest needs to carry its **resolution authority** — `feed`, `commissioner`, `participants`,
or `consensus` — and the league office keeps absolute power over exactly one of them. This is the
single change worth getting right before a second feed-based pool type hardens the assumption
further.

### Trust changes shape, and there is already a precedent

With a feed, trust comes from nobody being able to touch the result. With the group as authority,
trust has to come from **visibility**: who entered what, when, and who agreed. Tally already has the
right pattern — `README.md` calls the append-only `pick_history` table "the trust story." Results
under a group authority get the same treatment: append-only, attributable, and shown in the app
rather than reconstructed from memory.

### The rest

| Change | Why | Size |
|---|---|---|
| Resolution authority on a contest | Above | Small, deep |
| Append-only result log | Trust under a group authority | Small |
| Offline entry with later sync | A golf course is not a network | **Large — the real cost** |
| Contest lifetime measured in hours | A card is a morning | Medium |
| `/g/<slug>` groups sooner than Year 3 | A foursome is a group, not a pool | Medium, already planned |
| Handicap and course data | § 4 | Medium |

One discipline to carry over: `06-engagement.md` § 6 caps push at **four per player per week**. A
live card could blow that budget in nine holes. A card's updates are the Live Activity and the app.
The only push a card sends is the one at the end.

---

## 8. Where this goes in the sequence

**The two real dates in `08-roadmap.md` do not move.** The playoffs pool before Wild Card weekend
and the March product before Selection Sunday are anchored to the largest pool-formation windows of
the year, and nothing here is worth spending one of them on.

| Family | When | Why there |
|---|---|---|
| **Calls** | Grows out of Prop of the Week, winter 2026–27 | The engine is being built anyway. Ship the prop first, then let a commissioner write the question. It is the only thing on any roadmap that works in July. |
| **Cards** | April–July 2027, with Majors | Golf season and the Masters are the same marketing moment, and `08` already holds that slot for Majors, conditionally. A pool *about* the Masters and a card *for your own Saturday* sell to the same person in the same week. |
| **Poker ledger** | After Cards has run a season | Same ledger, closest optics to the line. Not first. |
| **Play + feed** | Not scheduled | § 1. |

### What would make me not build Cards

Stated now, so it is checked rather than rationalised:

- **Commissioner retention comes in under 35%.** `01-strategy.md` § 6 already says that makes this a
  novelty rather than a business. A novelty does not get a second product.
- **The January decision log says Clubhouse is the product** (`08-roadmap.md` § 5 ④). If groups are
  the object, Cards become obviously right and *more* urgent — this is the one that would accelerate
  rather than cancel.
- **Offline sync turns out to be a month, not a fortnight.** Then Cards wait, because the two anchor
  dates matter more.

---

## 9. What this adds to the risk register

| Risk | Severity | Read |
|---|---|---|
| **Brand dilution** | Medium | "Tally does everything" is how a wedge dies. The through-line is the group, and the filter in § 2 is the defence. Use it to say no in public. |
| **Disputes become support** | Medium | New in kind. A feed has no arguments. Budget for it and design the resolution in-app. |
| **App Store optics on Cards** | **High** | The 5.3 argument in `02` § 1 is about money flow only. A poker ledger is a 5.3 risk with zero dollars in the system, because App Review reads the screen. § 4 has the two rules; the poker screen is the one to get in front of a reviewer's eyes deliberately rather than hopefully. |
| **A free tier with no exit** | Medium | The 20-player wall never fires for a foursome. § 6 proposes the record book as the second axis. Unresolved, this is half the broadened product on a permanent free plan. |
| **Surface count vs. two part-time people** | High | `08` § 1. This document adds two families and zero people. The sequencing in § 8 is the entire mitigation. |

---

## 10. What this changes elsewhere

Edits made with this document:

| Document | Change |
|---|---|
| `README.md` | Ninth conclusion; this document in the index |
| `01-strategy.md` | § 4 sequence names the three families; the seasonality risk cites Calls |
| `02-monetization.md` | § 3 gains the second paywall axis for small, seasonless groups |
| `04-brand.md` | § 4 adds *prediction market* to the words-not-used list; § 6 naming architecture gains the family layer |
| `06-engagement.md` | § 3 ② notes that the Prop of the Week is the Calls engine |
| `07-partnerships-investors.md` | Tier 3 distinguishes declining a Polymarket partnership from building Calls |
| `08-roadmap.md` | April–July 2027 gains Cards beside Majors; the decision log gains resolution authority |

### Three things left open on purpose

**① The venture-math denominator (`07` Part Two).** The case against raising leans on a TAM
argument: *"At $49 ARPU that's 2 million paying commissioners — roughly 25 million pools, seven
times the entire estimated annual US pool market."* Broadening past pools attacks that denominator
directly — golf groups and poker nights are not in the ~3.6M-pools-a-year figure. **The conclusion
still holds**, because the other two legs are untouched: there is nothing to spend the money on at
these costs, and venture money pushes toward the gambling model that is the entire thing being
avoided. But the strongest leg is now the weakest, and that should be a decision rather than a
drift. Revisit it with the January decision log.

**② The per-player cost model is written in NFL vocabulary.** `03-unit-economics.md` derives ~50
Worker requests per player per week from picks, board checks and incidentals across an 18-week
season, and assumes a near-zero off-season. Year-round families remove the off-season discount and
change the request mix — a round of golf is a burst of writes over four hours, a call is a handful
over a week. The direction of travel is favourable (feed-free formats need no cron, and cron
triggers are a hard ceiling at five per account) and the magnitudes are still immaterial. The line
that genuinely moves is AI: recaps are costed at 18 per pool-season, and a year-round group
generates nearer 52. **Nothing here changes a decision.** It is on the list so the numbers are
restated rather than quietly inherited.

**③ The metrics are denominated in seasons.** `05-gtm.md` § 6 measures commissioner
season-over-season return and weeks played out of 18. Neither has meaning for a golf group. Rolling
twelve-month analogues are needed before Cards ship, not after, or the one number the business is
supposed to be steered by stops covering half the product.

*Also noticed while reading, and not touched:* `03` § 3's headline says infrastructure is roughly
$4,000 a year at 3 million players while the scenario table on the same page gives ~$16,900 for
Scenario E. That is a pre-existing inconsistency and somebody should reconcile it before the number
is quoted to anybody.
