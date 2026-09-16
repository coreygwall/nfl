# Brand Narrative

---

## 1. The story

Before there were apps, there was a sheet of paper on the break-room wall. Somebody drew the grid.
Somebody else wrote the names down the side. Every Monday one person — always the same person —
updated it in pen, and everybody walked past to see where they stood.

That person is the reason any of it happened. Not the picks, not the scores. **The keeper of the
tally.**

Somewhere along the way the industry decided this was a gambling funnel. Pools became a way to get
you to the real product: the odds, the props, the cash-out button. The paper on the wall became a
sportsbook with a scoreboard glued to the front.

**Tally is the paper on the wall, done properly.** It knows who won. It tells you Monday morning.
It lets your daughter play. It never asks you to deposit anything, and there is nothing to cash out,
because the whole point was never the money — it was walking past the wall.

---

## 2. Positioning statement

> **For the person who runs the pool** — the one with the spreadsheet, the group text and the
> unpaid administrative job — **Tally is the place your group keeps score.** Unlike the pool sites
> that have become sportsbooks, Tally is free to join with nothing to install, works for everyone
> you'd actually invite, and remembers every season you've played together.

## 3. The one-liners

Ranked. The first is the recommendation.

1. **"Where your group keeps score."** — Ownable, true across every sport, works for the Clubhouse
   product, no expiry date. **Use this.**
2. "The pool, done properly."
3. "Everyone's in. Nothing to install."
4. "Simple, fun games to play with your friends." — *current landing copy; warm, but it could be any
   product. Keep as a subhead, not the line.*
5. "Keeper of the tally." — for the commissioner-facing surfaces specifically.

## 4. Voice

The existing product copy is already the strongest brand asset Tally has. The README, the rules
page and the pool notes are written by someone with a genuine ear:

> *"Showing up late is okay — pick from the games that are left."*
> *"A winner every week. One bad Sunday is never fatal."*
> *"Fill it in, watch it burn by the second round."*

That voice is: **dry, plain-spoken, generous, quietly funny, never hyped.** It assumes you are an
adult. It explains a rule in one sentence and then stops.

**Write everything in that voice.** The landing page, the emails, the App Store listing, the support
replies, the AI recaps. It is more differentiated than the logo.

### Rules of voice

| Do | Don't |
|---|---|
| "Games lock one at a time at kickoff." | "Never miss a deadline with our advanced locking engine!" |
| "One bad Sunday is never fatal." | "Stay in the hunt all season long!" |
| Short sentences. Full stops. | Exclamation marks. Ever. |
| Name the awkward case and handle it | Pretend edge cases don't exist |
| "Free to play" | "Free forever!*" |
| Say the number | "Affordable pricing" |

**Words Tally does not use:** *bet, wager, odds, odds-on, action, lock (as a noun), degen, sweat,
juice, cash out, deposit, parlay, book, prediction market, market.* This is a hard list. The brand's
entire premise is that it is not that thing, and one stray "lock of the week" undoes a lot of
careful work. The last two were added with `09-competition-types.md`: *prediction market* describes
the Calls mechanic accurately and is the exact frame `01-strategy.md` shows the industry running
toward, so it stays an internal shorthand and never reaches a surface.

**Words Tally owns:** *pool, card, call, pick, board, week, season, group, commissioner, tally,
standings, the wall.*

---

## 5. Visual identity

The existing system is good and already coherent — **paper** and **ink** as the two primitives,
hard offset shadows, heavy dashed rules, Bricolage Grotesque for display, Inter for text, die-cut
team stickers. It reads as *newsprint, scoreboard, school notice-board* — which is exactly right,
and exactly not what a sportsbook looks like.

**Protect this.** The temptation as the product grows will be to "modernise" toward the dark-mode,
neon-green, live-odds look of every competitor. That would be a strategic error: the visual
distance from a sportsbook *is* the positioning.

Extensions worth making:
- **The tally mark** (⟋⟋⟋⟋̸) as a repeating motif — loading states, streaks, the record book, the
  app icon's secondary mark. It's in the name and it isn't being used yet.
- **Paper texture** on the group's archive/record-book surfaces, where nostalgia is the point.
- **One accent colour per pool**, commissioner-chosen (a Plus feature that costs almost nothing and
  makes a group's board feel like theirs).

---

## 6. Naming architecture

Already correct in the codebase — worth writing down so it stays that way:

| Layer | Name | Example |
|---|---|---|
| The company / app | **Tally** | `playtally.app` |
| A *family* of competition | Pool · Card · Call | "start a card" — see `09-competition-types.md` |
| A *type* within a family | The game's name | High Five, Survivor, Brackets, Majors, Skins, Nassau |
| An *instance* | The group's own name | "Wall Street Bowl 2026" at `/p/wall-street-bowl` |
| A group | The group's name | "The Walls" at `/g/the-walls` |

The discipline that matters: **Tally is never the name of a game.** High Five is a game. Tally is
where the games live. Every competitor collapses these and ends up unable to launch a second product.

---

## 7. What Tally stands against

A brand needs an enemy. Tally's is not Splash or Sleeper — it is what happened to the office pool.

> Somebody decided the best thing about the pool — that everybody's in it — was a customer
> acquisition cost. So they put an account form in front of it, then a deposit screen, then live
> odds down the side. The pool still exists. It just isn't for your kid anymore, or your
> mother-in-law, or the guy in accounts who doesn't have the app.
>
> We think the pool was fine.

This paragraph, or something close to it, is the About page. It is also the pitch to investors,
to partners, and to a journalist. It says what the product is by saying what it refuses to be.

---

## 8. Proof points to lead with

When there are 30 seconds, these are the three things:

1. **"Your friends join by typing their name. That's it."** — demonstrably true, technically hard,
   and the thing every competitor cannot say.
2. **"You can enter picks for your kids."** — instantly legible, emotionally specific, zero
   competitors.
3. **"There's no money in it, and that's the feature."** — reframes the missing sportsbook as the
   reason to choose it.

---

## 9. Brand risks

- **Being read as "the kids' version."** Mitigate with visual seriousness and dry adult voice —
  never cartoon it. It is the *family-inclusive* pool, not the children's pool.
- **Taking sportsbook affiliate money.** One placement destroys everything above. Decline in advance
  so it doesn't have to be decided under revenue pressure.
- **Feature creep toward the competition.** Live odds, expert picks, "sharp money" indicators — each
  looks like a growth idea and each moves Tally toward a fight it cannot win, away from the market
  nobody else is serving.
