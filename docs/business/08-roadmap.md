# Roadmap & AI Agent Leverage

---

## 1. The governing constraint

Two part-time people and a fleet of agents. Agents can write most of the code; they cannot decide
what to build, cannot talk to a commissioner, and cannot be accountable for a Sunday when the board
is wrong. **Sequence ruthlessly. Ship fewer things.**

Two dates on this page are real, not aspirational, and the rest can move around them:

> ### The NFL playoffs pool must be live before Wild Card weekend (January 2027).
> ### The March product must be live with runway before Selection Sunday.

Neither requires the long lead time a generic feature roadmap would assume — the pool-type
architecture (`pools`, `pool_commissioners`, players global to Tally) already supports standing up
a new format quickly, and the constraint is sequencing the work now, not waiting for a deadline to
justify starting. Marketing runs continuously alongside all of it — there is no quiet stretch where
GTM pauses and only building happens. (See `05-gtm.md` § 1.)

---

## 2. The sequence

### Now → October 2026 — *Unblock, instrument, market*

**Unblock the app** *(highest leverage, smallest effort)*
- [ ] Generate the APNs `.p8`, `wrangler secret put APNS_KEY`, set `APNS_KEY_ID` — push is fully
      built and sends nothing until this is done (`CLAUDE.md`)
- [ ] TestFlight → App Store submission; set `APPLE_APP_STORE_ID` once listed
- [ ] File the App Store featuring nomination (`07` § Tier 1 ①)

**Instrument** *(you cannot make a single good decision without this)*
- [ ] Metrics 1–4 from `05-gtm.md` § 6, plus pool-size distribution
- [ ] A Tuesday-morning numbers email. Not a dashboard — a query and a paragraph.

**Market — starts now, does not wait for a bigger moment**
- [ ] Reddit answers, first SEO pages, network outreach — the "Still Time" motion (`05` § 5)
- [ ] Recruit 10 commissioners from your own network; watch every setup un-coached
- [ ] Run the first set-up test with your wife, timed and unassisted

### October–November 2026 — *Delight, then build the playoffs pool*

**Build (weekly pool)**
- [ ] **The Weekly Recap** (`06` § 2) — batched, prompt-cached, commissioner preview before posting
- [ ] **CSV importer** — "Steal the spreadsheet" (`05` § 3 ②)
- [ ] **Streaks** surfaced on the board + the one streak-at-risk push
- [ ] **Rivalry cards** — pure derivation, near-zero cost, disproportionate delight

**Build (the next pool type)**
- [ ] **Start the NFL playoffs pool.** Lower-commitment format, single-elimination drama, built on
      the existing pool-type architecture. Target: live and tested before Wild Card weekend.

**Ops / risk**
- [ ] Move to `main` with protected branches **at season's end, not during it** — the README is
      right that mid-season is the wrong time, and CI not gating the deploy is the largest
      operational risk in the product
- [ ] Choose and budget a commercial data feed fallback for nflverse

### December 2026 — *Ship the playoffs pool*
- [ ] When the **Prop of the Week** is built (`06` § 3 ②), build it so the question can come from a
      commissioner and the answer from the group. That is the Calls engine, and it is the only
      family with no season (`09` § 5)
- [ ] **Playoffs pool live before Wild Card weekend.** The first real test of shipping a second
      pool type on the existing architecture, and the first proof that "days, not months" holds.
- [ ] Push Campaign 2, "One More Pool" (`05` § 5) — in-app prompt to existing players, Reddit, SEO
- [ ] Spec the non-traditional March product — this is where the format gets decided, not guessed at

### January 2027 — *The off-season artifacts, and the March build*
- [ ] **Pick Personality / season wrapped** (`06` § 3 ⑥) — the only shareable moment in January
- [ ] The record book: all-time bests, longest streaks, biggest collapse
- [ ] **Build the March product** — whatever it turns out to be, it is not a traditional bracket
      (the market is saturated with those); scope it against the calendar in `05-gtm.md` § 1
- [ ] "The Spreadsheet Amnesty" campaign (`05` § 5)
- [ ] Pricing page drafted; paywall built but dark

### February–March 2027 — *March Madness*
- [ ] **The March product live with real runway before Selection Sunday** — polished, not rushed,
      because the build started in January rather than being deferred to a hard deadline
- [ ] 30–50 SEO pages indexed (published continuously since October so they rank by now)
- [ ] Paywall **on** — new pools only, and never retroactively on an existing pool mid-season
- [ ] First cohort of paying commissioners, likely across three pool types by now

### April–July 2027 — *The group, and the golf moment*
- [ ] **Majors** (golf) — small, delightful, proves multi-sport, only if it earns its place against
      what the playoffs and March pools actually taught about demand
- [ ] **Cards** — the first participant-played family: skins, nassau, match play for your own
      Saturday round (`09-competition-types.md` § 4). Same marketing moment as Majors and the same
      audience in the same week, but a different product: a pool *about* the Masters and a card
      *for your foursome*. Gated on the January decision log below — this is the one that needs
      offline entry and a resolution authority that is not the league office
- [ ] **Clubhouse tier**: `/g/<slug>`, cross-season standings, Group of the Year
- [ ] Convert playoffs- and March-pool commissioners into groups
- [ ] Slack / Discord bot
- [ ] Build the August campaign

### August 2027 — *The season*
- [ ] **Survivor** live alongside High Five on one link (`06` § 3 ①)
- [ ] Full campaign; a year of SEO and two off-season products' worth of proof maturing at once
- [ ] App Store featuring pitch, round two

---

## 3. What the agents do

The entire codebase is already agent-authored — every commit in `git log` is a Claude session. The
question isn't whether agents can build this; it's which work to hand over completely.

| Work | Autonomy | Notes |
|---|---|---|
| **Feature implementation** | High | Already proven. Keep the test discipline (`typecheck && test && test:e2e`) — it's what makes autonomy safe. |
| **SEO content at volume** | High | 30–50 pages in Tally's voice. Human review for voice drift, not for facts. Highest-volume agent task on the board. |
| **Weekly recap generation** | High | Runs on cron, batched. Commissioner preview is the human check. |
| **Support triage & draft replies** | Medium | Agent drafts, human sends. Never auto-send to a commissioner. |
| **Competitive monitoring** | High | Pricing changes, feature launches, Reddit sentiment → a weekly digest. |
| **Reddit / social reply drafting** | Low | Draft only. Posting stays human on a real account with real history — anything else gets you banned and deserves it. |
| **Weekly ops (results, schedule)** | High | Already automated via cron and correctly designed: fills blanks only, never overwrites, reports conflicts. |
| **Pricing, roadmap, partner decisions** | None | Yours. |
| **Talking to commissioners** | None | The most valuable hour either of you spends. |

**The pattern worth keeping:** agents write, tests gate, humans decide. The existing test suite and
the append-only `pick_history` table are what make aggressive agent autonomy defensible — there's a
safety net under both the code and the data.

---

## 4. Explicitly not building

Writing these down so they stop being reconsidered every month:

| Not building | Why |
|---|---|
| Real-money entry / prize escrow | `02` § 1. Licensing, Apple 5.3, and the entire positioning. |
| Live odds, expert picks, consensus | Turns Tally into a handicapping product in a fight it can't win. |
| In-app chat | The group chat exists and Tally loses to it. Build artifacts that land *there*. |
| Public pools with strangers | Moderation cost, no moat, and it breaks the premise that the group is real people. |
| Android | Not before 2028. The web app is good and works everywhere; iOS is where the design leverage and the featuring opportunity are. |
| A second backend service | The single-Worker architecture is the 98% margin (`03` § 5). |
| Virtual currency | `06` § 3 Tier 3. Casino grammar in a non-casino brand. |
| Anything called a prediction market | `09` § 3. The mechanic is fine and the vocabulary is not. |
| Play-and-feed formats (timed races, step challenges) | `09` § 1. A third data integration for a smaller audience. |

---

## 5. The decision log — revisit each in January

Open questions that should be settled with a season of data rather than argued about now:

1. **Where does the free player cap actually land?** 20 is a guess. The pool-size distribution will
   say. Setting it wrong is the most expensive mistake available in `02`.
2. **Is $29/season right?** Test $19 vs $29 vs $39 in March. The category band is ~$15–30 and Tally
   is priced above it deliberately (`02` § 6) — verify that survives contact.
3. **Does split-the-ante lift conversion?** If it does, it changes the whole pricing page.
4. **Is Clubhouse a tier or the product?** If cross-season retention is dramatically better, the
   right move may be to make the *group* the primary object and demote the pool.
5. **Does the Recap actually get forwarded?** It's the distribution bet. Measure shares, not opens.
6. **Where does a contest's result come from?** Pools take it from a feed and the league office owns
   it absolutely. Cards and Calls cannot (`09` § 7). Settling the resolution-authority model is the
   one architectural decision that gets more expensive with every feed-based pool type shipped
   before it.
7. **What replaces the 20-player wall for a foursome?** ~~`02` § 3 proposes the record book.~~
   **Settled, and not the way this asked.** `02` § 3 now runs on *price what costs, never price what
   counts*: the record book is free, the headcount cap is not being built, and there is one annual
   tier carrying the things that cost per use. Nothing replaces the wall, because ~0.1% support
   covers the bill at every scale in the model. What is open instead is whether **objects** — a
   printed record book in December — is a real business or a hobby; that is answerable only by
   making fifty of them.

---

## 6. The one-sentence version

> **Market continuously starting now, ship the recap and the importer to delight, get a playoffs
> pool live before Wild Card weekend and a non-traditional pool live for March Madness, turn the
> paywall on for new pools, and decide in the summer of 2027 — with two seasons of commissioner
> retention in hand — whether this is a very good side business or something bigger.**
