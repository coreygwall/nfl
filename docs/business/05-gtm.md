# Go-To-Market

*Written 14 September 2026 — NFL Week 2.*

---

## 1. The timing call, stated bluntly

**The bulk NFL pick'em market forms in the two weeks before Week 1** — most people who were going
to start a *weekly confidence pool* this season already did. That's a real fact about that one
funnel, and it's the reason a generic "come start your NFL pool" push in late September is spending
effort on people who already committed to a spreadsheet three weeks ago.

**It is not a reason to stop shipping or marketing until March.** It was read that way in an earlier
draft of this plan, and that reading is wrong — there are three live surfaces between now and March
Madness, each with its own acquisition window, and the right posture is to work all three
concurrently rather than treat September–February as a quiet instrumentation season:

1. **The weekly NFL pool, marketed continuously.** The bulk-formation window is closed, but
   commissioners don't stop churning through November — someone's league falls apart, someone
   decides mid-season that a group text isn't cutting it. Small and constant beats a big push with
   nothing behind it. Keep Reddit, SEO and network outreach running the whole season.
2. **An NFL playoffs pool, shipped for January.** Different funnel entirely: lower commitment (a
   handful of games, not eighteen weeks), and it lands right when regular-season pool fatigue peaks
   and playoff excitement is highest — a natural point for someone to try a *second* thing without
   having missed anything. This is buildable fast on the existing pool-type architecture and it
   should exist before the Wild Card round, not be treated as a stretch goal.
3. **A March Madness product, but not a traditional bracket.** The market is saturated with bracket
   fillers — that's precisely why a bracket clone isn't the move. Ship something built for the
   people already in Tally's world. What it is, is yours to define; the plan's job is to make sure
   the calendar gives it real runway, not to prescribe the format.

None of these needs five months of lead time. If a pool type takes days to build, the constraint
isn't the calendar — it's sequencing the work and getting the marketing muscle moving now instead of
waiting for a deadline to justify it.

### What the next five months are for

| Window | Job |
|---|---|
| **Sep–Oct 2026** | Run the live weekly pool and market it continuously — Reddit, SEO, network. Instrument metrics 1–4 (§6). Ship iOS to TestFlight → App Store. Build the Recap. |
| **Nov–Dec 2026** | Ship the CSV importer. Build and ship the **NFL playoffs pool** — ready before Wild Card weekend, not after. Keep marketing running, not paused. |
| **Jan 2027** | Playoffs pool live and marketed. End-of-season artifacts for the weekly pool (Pick Personality, record book). Start building the non-traditional March product. |
| **Feb–Mar 2027** | **March Madness.** The non-traditional product ships and gets pushed hard — this is the biggest acquisition swing before August, but it is not the *first* one; the playoffs pool and continuous weekly marketing came first. |
| **Apr–Jul 2027** | Majors (golf), if it earns its place. Convert March commissioners into Clubhouse groups. Build the August campaign. |
| **Aug 2027** | **The season.** The biggest single push, prepared for by everything above rather than preceded by a five-month quiet period. |

---

## 2. The only acquisition unit that matters

**One commissioner brings 15 players. Players cost nothing to acquire. Commissioners are the entire
funnel.**

```
1 commissioner
   → 15 players (free, via a link in a group text)
      → ~1–2 of them start their own pool next season (the loop)
         → repeat
```

Every dollar and hour of GTM goes into one of exactly two questions:

1. **How does a commissioner find Tally?**
2. **How does a player become a commissioner?**

Question 2 is the one almost nobody optimises and it is where the compounding lives. Concretely:
at the end of the season, every player who finished in the top 3 gets *"Run your own pool next
season — your group's already here."* That is a one-screen feature with a higher long-run return
than any paid channel.

---

## 3. Channels, ranked by realism for two part-time people

### Tier 1 — Do these

**① Your own network, instrumented.**
You already have a live pool. Get to 10–20 pools among people you actually know before touching a
public channel. Not for the revenue — for the observation. You need to watch a commissioner who
isn't you set up a pool without help, and find out what they get stuck on. **No amount of strategy
substitutes for this and it is available immediately.**

**② "Steal the spreadsheet" — a CSV importer.**
The single highest-ROI GTM *feature* on the board. Someone runs their pool in Excel. They upload the
sheet; Tally reads the names and creates the roster; they get a link to paste in the group chat.

- It targets the exact switching moment, which is otherwise the hardest thing in this category.
- It is a piece of *content* as much as a feature: "Paste your pool spreadsheet, get a link" is a
  Reddit post, a landing page, and a demo video all at once.
- Effort: a day or two. The roster API already exists.

**③ Reddit, earned not spammed.**
r/fantasyfootball, r/nfl, r/CFB, r/golf, and the March Madness subs during bracket season. The rule:
**never post a link first.** Answer "what's the best free pick'em site" threads — they appear
constantly — with a genuine answer that happens to include Tally and is honest about what it doesn't
do yet. One credible commenter beats fifty posts.

- **AI agent leverage:** an agent monitors these subs and drafts replies for a human to review and
  post. Drafting is cheap; posting must stay human, and must be a real account with real history.

**④ The App Store itself.**
Underrated free channel and Tally is unusually well positioned for it. The iOS app is SwiftUI on
iOS 26 with Liquid Glass, passkeys, Live Activities and push — which is precisely the profile Apple
features editorially. Apple actively promotes apps that showcase current-OS capabilities.

- Submit for featuring consideration ahead of the NFL season and March Madness.
- A single App Store feature is worth more than any amount of paid acquisition available at this
  budget.
- **Prerequisite:** the app has to actually ship. Blocked today on the APNs key and an App Store
  listing (see `CLAUDE.md` and `ios/README.md`).

**⑤ SEO, agent-written, published early.**
Long-tail intent in this category is enormous and stable: *"how does a confidence pool work"*,
*"NFL survivor pool rules"*, *"free pick em pool no account"*, *"March Madness bracket pool app"*.
Search intent is seasonal but indexing is slow — **pages published in October rank in March.**

- **AI agent leverage:** this is where agents do genuinely unsupervised work. Rules explainers,
  strategy pages, comparison pages, a page per pool type per sport. Written in Tally's voice
  (`04-brand.md` § 4), reviewed by a human, published continuously.
- Target: 30–50 solid pages live before February 2027.

### Tier 2 — Worth trying once, with a time limit

**⑥ Local / community distribution.** Youth sports leagues, golf clubs, church groups, small offices.
High trust, high conversion, zero scale. Genuinely good for the first 100 pools and for
understanding the non-technical commissioner. Best done by whoever is more comfortable walking into
a clubhouse and saying "I'll set it up for you in five minutes."

**⑦ Short-form video.** The demo is unusually good on video — *text a link, type a name, you're in,
compared to 90 seconds of account creation on a competitor.* That's a 20-second clip that makes the
point without narration. Worth 10 attempts before judging.

**⑧ Slack / Discord app.** A bot that posts the board to the channel where the pool actually lives.
Strong for the office segment and a real differentiator for workplace pools.

### Tier 3 — Don't

| Channel | Why not |
|---|---|
| Paid social / search | CAC in any sports-adjacent keyword is set by sportsbooks with ~$300 LTVs. You cannot compete at a $49 ARPU and shouldn't try. |
| Influencer / creator deals | Priced by the gambling industry. Same problem. |
| Sportsbook affiliate partnerships | Revenue that destroys the brand (`04-brand.md` § 9). |
| App Store paid search | Possibly viable at very small scale in March. Test $200, no more. |
| PR agency | Nothing to announce yet. Revisit after a season of real numbers. |

---

## 4. Splitting the work

Two part-time people. The split should follow comfort, not title.

**You (product, systems, agents):**
- Product, roadmap, pricing, the analytics that answer the questions in §2
- Directing the AI agents that write code, content, and recap prompts
- Reddit / HN / technical community presence
- App Store submission and featuring pitch
- The partnership conversations in `07`

**Your wife (the human-distribution half):**
The reason this split is real and not a courtesy: **the single most valuable test available is
whether a non-engineer can set up a pool without help.** If that test passes, the product is ready;
if it fails, no amount of marketing fixes it.

- **The set-up test.** Run it before every major release. Un-coached, timed, watched. Where they
  hesitate is the bug.
- **Community and local channels (Tier 2 ⑥).** Parent groups, clubs, workplaces, friend groups —
  the segments that convert on trust and are completely unreachable through Reddit.
- **Voice check on all outbound copy.** The brand's whole risk is drifting toward sportsbook
  register (`04-brand.md`). A reader who isn't immersed in the category catches that instantly.
- **Founding-commissioner relationships.** The first 50 commissioners should each get a real
  message from a real person. That is a moat for about 18 months and it doesn't scale — which is
  exactly why it's worth doing now.

**The agents (the third teammate):**
- Code (already true — the entire git history is agent-authored sessions)
- SEO content at volume
- Weekly recap generation
- Support triage and draft replies
- Competitive monitoring — pricing changes, feature launches, Reddit sentiment
- Draft Reddit/social replies for human review

---

## 5. The six campaigns

### Campaign 1 — "Still Time" (Sep–Nov 2026) — ongoing, not a launch moment
**Target:** the steady trickle of people whose office/family pool falls apart mid-season, or who
finally get fed up with a spreadsheet in October.
**Hook:** *"Your league's three weeks in. Nobody has to start over."*
**Channels:** Reddit (answering, not posting), SEO pages going live continuously, your own network.
**Why it's a campaign and not a footnote:** this is what fills the gap instead of five quiet months.
Small and constant, running the whole season.

### Campaign 2 — "One More Pool" (Dec 2026–Jan 2027)
**Target:** people already in a Tally pool, or in any pool, once the regular season winds down.
**Hook:** *"Your bracket for the real bracket."* The NFL playoffs are single-elimination drama —
a much lower-commitment pool than an 18-week confidence pool, and an easy yes for someone who
enjoyed the regular season but wouldn't have signed up in September.
**Requirement:** the playoffs pool ships **before Wild Card weekend**.
**Channels:** the existing weekly-pool user base (in-app prompt), Reddit, SEO.

### Campaign 3 — "The Spreadsheet Amnesty" (Jan–Feb 2027)
**Target:** commissioners who just finished a painful season in Excel, while it's fresh.
**Hook:** *"Upload last season's spreadsheet. Get a link. Never open Excel again."*
**Channels:** Reddit, SEO, direct outreach.
**Why now:** the pain is at maximum in January and gone by August.

### Campaign 4 — "Not Another Bracket" (Feb–Mar 2027) — **the big one before August**
**Target:** everyone. March Madness is the widest-funnel moment in American sports, but the bracket
format itself is a commodity — every site has one.
**Requirement:** the non-traditional March product ships with enough runway to be polished, not
enough to justify sitting on it. Runway is set by the marketing calendar, not by an arbitrary date.
**Hook:** *"Everyone's tired of the bracket."* — lead with what's different, not with "we have one too."
**Channels:** Reddit, SEO (pages need to be indexed well before tip-off — start them now), App Store
feature pitch, local/office.

### Campaign 5 — "The Group" (Apr–Jul 2027)
**Target:** the commissioners acquired via the playoffs pool and the March product.
**Hook:** *"Your group's still here. Golf's on."* Convert pool → Clubhouse.
**Why:** the retention campaign that makes the $99 tier real — and it now has two off-season
products' worth of commissioners to convert, not just one.

### Campaign 6 — "Season" (Aug 2027) — **the biggest push**
**Target:** NFL commissioners, three-week window.
**Hook:** everything. Recaps, testimonials, the App Store listing, a year of SEO and two off-season
products' worth of proof maturing at once.
**Preparation starts now, not in March.**

---

## 6. Metrics — the five that matter

Ignore everything else. Instrument these now, this season, while the numbers are small enough to
understand individually.

| # | Metric | Target | Why |
|---|---|---|---|
| 1 | **Commissioner season-over-season return rate** | >50% | The business. Below 35%, rethink everything (`01` § 6). |
| 2 | **Invite → first pick conversion** | >70% | The differentiator, quantified. If this isn't excellent, the core premise is wrong. |
| 3 | **Player → commissioner rate** | >5%/season | The viral loop. The compounding term. |
| 4 | **Weeks played per player per season** | >12 of 18 | Engagement. What the side games in `06` move. |
| 5 | **Free → paid conversion** | >6% | Revenue. Meaningless before #1 and #2 are healthy. |

**Don't build a dashboard yet.** At 20 pools, a SQL query and a Tuesday morning is better than a
dashboard, and you'll learn more.

---

## 7. The first 90 days — concrete

**Weeks 1–4 (Sept–Oct 2026)**
- [ ] Ship iOS to TestFlight; set `APNS_KEY` and turn push on (blocked on the .p8 — `CLAUDE.md`)
- [ ] Instrument metrics 1–4; get a weekly numbers email working
- [ ] Recruit 10 commissioners from your own network; watch every setup un-coached
- [ ] Run the first set-up test with your wife, timed and unassisted
- [ ] Start the ongoing "Still Time" motion — Reddit answers, first SEO pages. This does not pause.

**Weeks 5–8 (Oct–Nov 2026)**
- [ ] Ship the Weekly Recap (`06` § 2) — preview-and-edit before it posts
- [ ] Ship the CSV importer ("Steal the spreadsheet")
- [ ] Publish the first 15 SEO pages, agent-written, human-reviewed
- [ ] Submit to the App Store; file the featuring pitch
- [ ] **Start building the NFL playoffs pool** — target: live before Wild Card weekend

**Weeks 9–12 (Nov–Dec 2026)**
- [ ] **Ship the playoffs pool** and push Campaign 2 ("One More Pool")
- [ ] Build end-of-season artifacts (Pick Personality, record book)
- [ ] Spec the non-traditional March product — this is where your own concept gets scoped
- [ ] Draft the pricing page; do **not** turn on the paywall mid-season
- [ ] Decide the player cap from a season of real pool-size data, not a guess

**Explicitly not in the first 90 days:** the paywall, Clubhouse, a traditional bracket product,
Survivor, partnerships, investors. All of them are better decisions in January with a season of
data than in October with none — but the playoffs pool and the March product are *not* on this
list; they have real calendar deadlines and belong in the first 90 days' build queue.
