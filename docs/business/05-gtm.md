# Go-To-Market

*Written 14 September 2026 — NFL Week 2.*

---

## 1. The timing call, stated bluntly

**The 2026 NFL acquisition window has closed.** Pools form in the two weeks before Week 1 and
essentially never after. Launching hard at pick'em commissioners now means spending effort on
people who already committed to a spreadsheet three weeks ago.

That is not bad news, it's a scheduling fact, and pretending otherwise is how a season gets wasted.
So:

> **The 2026 NFL season is not a growth season. It is the instrumentation season.**
> **March Madness 2027 is the first real swing. August 2027 is the big one.**

This has a clean implication for the roadmap: **Brackets must ship by mid-February 2027.** It is the
only thing on the board with a hard external deadline, and missing it costs a full year. Everything
else can move. (See `08-roadmap.md`.)

### What the next five months are for

| Window | Job |
|---|---|
| **Sep–Dec 2026** | Run the live pool. Instrument everything. Ship iOS to TestFlight → App Store. Build the Recap. Get 5–20 pools from your own network and watch them like a hawk. |
| **Jan 2027** | End-of-season artifacts (Pick Personality, record book). The only off-season marketing you get. Build Brackets. |
| **Feb–Mar 2027** | **March Madness.** First real acquisition push. Bracket pools are the widest-funnel product in American sports. |
| **Apr–Jul 2027** | Majors (golf). Convert bracket commissioners into Clubhouse groups. Build the August campaign. |
| **Aug 2027** | **The season.** Everything above was preparation for these three weeks. |

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

## 5. The four campaigns

### Campaign 1 — "The Spreadsheet Amnesty" (Jan–Feb 2027)
**Target:** commissioners who just finished a painful season in Excel, while it's fresh.
**Hook:** *"Upload last season's spreadsheet. Get a link. Never open Excel again."*
**Channels:** Reddit, SEO, direct outreach.
**Why now:** the pain is at maximum in January and gone by August.

### Campaign 2 — "March Madness" (Feb–Mar 2027) — **the big one**
**Target:** everyone. Bracket pools are the widest-funnel product in American sports, and a bracket
commissioner converts to an NFL commissioner in August.
**Requirement:** Brackets must be live and polished by **mid-February**.
**Hook:** *"Everyone's bracket. Nobody makes an account."* — the friction difference is most acute
here, because bracket pools include people who play one pool a year and will not create an account
to do it.
**Channels:** Reddit, SEO (start indexing in October), App Store feature pitch, local/office.

### Campaign 3 — "The Group" (Apr–Jul 2027)
**Target:** the bracket commissioners acquired in March.
**Hook:** *"Your group's still here. Golf's on."* Convert pool → Clubhouse.
**Why:** this is the retention campaign that makes the $99 tier real.

### Campaign 4 — "Season" (Aug 2027) — **the money**
**Target:** NFL commissioners, three-week window.
**Hook:** everything. Recaps, testimonials, the App Store listing, a year of SEO maturing at once.
**Preparation starts in March, not August.**

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

**Weeks 5–8 (Oct–Nov 2026)**
- [ ] Ship the Weekly Recap (`06` § 2) — preview-and-edit before it posts
- [ ] Ship the CSV importer ("Steal the spreadsheet")
- [ ] Publish the first 15 SEO pages, agent-written, human-reviewed
- [ ] Submit to the App Store; file the featuring pitch

**Weeks 9–12 (Nov–Dec 2026)**
- [ ] Start Brackets — the hard February deadline governs everything here
- [ ] Build end-of-season artifacts (Pick Personality, record book)
- [ ] Draft the pricing page; do **not** turn on the paywall mid-season
- [ ] Decide the player cap from a season of real pool-size data, not a guess

**Explicitly not in the first 90 days:** the paywall, Clubhouse, Survivor, partnerships, investors.
All of them are better decisions in January with a season of data than in October with none.
