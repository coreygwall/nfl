# Roadmap & AI Agent Leverage

---

## 1. The governing constraint

Two part-time people and a fleet of agents. Agents can write most of the code; they cannot decide
what to build, cannot talk to a commissioner, and cannot be accountable for a Sunday when the board
is wrong. **Sequence ruthlessly. Ship fewer things.**

One hard external date governs everything:

> ### Brackets must be live by mid-February 2027.
> March Madness is the widest funnel in American sports and the only acquisition moment before
> August 2027. Missing it costs a full year. Every other date on this page can move.

---

## 2. The sequence

### Now → December 2026 — *Instrument and delight*

**Unblock the app** *(highest leverage, smallest effort)*
- [ ] Generate the APNs `.p8`, `wrangler secret put APNS_KEY`, set `APNS_KEY_ID` — push is fully
      built and sends nothing until this is done (`CLAUDE.md`)
- [ ] TestFlight → App Store submission; set `APPLE_APP_STORE_ID` once listed
- [ ] File the App Store featuring nomination (`07` § Tier 1 ①)

**Instrument** *(you cannot make a single good decision without this)*
- [ ] Metrics 1–4 from `05-gtm.md` § 6, plus pool-size distribution
- [ ] A Tuesday-morning numbers email. Not a dashboard — a query and a paragraph.

**Build**
- [ ] **The Weekly Recap** (`06` § 2) — batched, prompt-cached, commissioner preview before posting
- [ ] **CSV importer** — "Steal the spreadsheet" (`05` § 3 ②)
- [ ] **Streaks** surfaced on the board + the one streak-at-risk push
- [ ] **Rivalry cards** — pure derivation, near-zero cost, disproportionate delight

**Ops / risk**
- [ ] Move to `main` with protected branches **at season's end, not during it** — the README is
      right that mid-season is the wrong time, and CI not gating the deploy is the largest
      operational risk in the product
- [ ] Choose and budget a commercial data feed fallback for nflverse

### January 2027 — *The off-season artifacts*
- [ ] **Pick Personality / season wrapped** (`06` § 3 ⑥) — the only shareable moment in January
- [ ] The record book: all-time bests, longest streaks, biggest collapse
- [ ] **Brackets build starts** — this is the month it has to start
- [ ] "The Spreadsheet Amnesty" campaign (`05` § 5)
- [ ] Pricing page drafted; paywall built but dark

### February–March 2027 — *March Madness*
- [ ] **Brackets live by mid-February.** Non-negotiable.
- [ ] 30–50 SEO pages indexed (published Oct–Dec so they rank by now)
- [ ] Paywall **on** — new pools only, and never retroactively on an existing pool mid-season
- [ ] First cohort of paying commissioners

### April–July 2027 — *The group*
- [ ] **Majors** (golf) — small, delightful, proves multi-sport
- [ ] **Clubhouse tier**: `/g/<slug>`, cross-season standings, Group of the Year
- [ ] Convert March bracket commissioners into groups
- [ ] Slack / Discord bot
- [ ] Build the August campaign

### August 2027 — *The season*
- [ ] **Survivor** live alongside High Five on one link (`06` § 3 ①)
- [ ] Full campaign; a year of SEO maturing at once
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

---

## 6. The one-sentence version

> **Run this season to learn, ship the recap and the importer to delight, have Brackets ready for
> March, turn the paywall on for new pools, and decide in the summer of 2027 — with two seasons of
> commissioner retention in hand — whether this is a very good side business or something bigger.**
