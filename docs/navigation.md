# One app, more than one kind of contest

Tally used to be an app for a pool. Four tabs — Home, Picks, Board, Account — and the only question
the frame ever had to answer was *which pool*. Golf breaks that, and it breaks it in the way that
matters: a scramble card is not a pool with different content, it is a different **shape of thing**.
A pool is a season you visit twice a week; a card is four hours you spend inside. A pool has a
board; a card has a scorecard. A pool has picks that lock; a card has a hole you are standing on.

So the question is not "where do we put golf". It is: **what is global in this app, and what belongs
to the contest you are standing in?** Getting that wrong is how apps end up with eleven tabs, four of
which are grey most of the time. This is the answer, written down before the second family ships so
the third one has a rule to follow.

## The rule

> **The first tab is everywhere you can stand. The rest are the contest's. Account is always the
> last one.**

Three sentences, and each is load-bearing.

**The first tab is everywhere you can stand.** Home, in both shells, at the same index with the
same icon: every pool and every card on the phone as one card each, sorted by what each one wants
from you and dressed to say so, with the count on the tab. It is the switcher. It used to be a menu
behind the chip in the navigation bar, and a menu can list names and nothing else — a phone with
three pools had to open each to learn that Thursday's picks were still owed in one. A card can say
that. The header at the top of a contest's own tabs still names where you are; it just no longer opens
anything, because a second switcher two taps from the first is how apps grow eleven tabs.

Every card on it is the same object — `ContestCard` owns the badge, the name, the line under it,
the divider, the chevron and the tap, and a family fills only the body — so a golf afternoon and an
NFL season read as one kind of thing on the screen that holds both. The body has a floor rather
than a fixed height: a pool with four entries genuinely has more to say than a card nobody has teed
off on. A third family costs a body, not a card.

Under the cards are the two things that are not about a contest you are already in: a carousel of
what you could start, and a button to join one. The carousel's tiles wear drawn symbols rather than
the marks, because nothing there has been started yet and so has no family to name — and a pool
played over four days of golf would otherwise wear the football.

Home is *not* where a launch lands. The pool you were in last night is the pool you are in this
morning, on the tab you left. Home is one tap to the left, and if nothing is owed you never need
to visit it.

**The tabs are the contest's.** A pool draws Pool · Picks · Board. A card draws Round · Tally ·
Scorecard. The tab bar after Home is a property of the family you are in, not of the app, so
neither family carries a tab that is dead weight for it — no Board on a card, no Round in a pool.

**Account is always the last tab.** It is the one thing that is the *person's* rather than the
contest's: the same name, the same passkey, the same appearance and notification settings, whichever
contest you happen to be standing in. It appears in both tab sets, at the same index, with the same
icon, and drops the sections that only make sense in a pool (`AccountView(inPool:)`).

## Why not the alternatives

Four other shapes were on the table. Each is wrong in an instructive way.

| Shape | Why not |
|---|---|
| **A fifth tab, "Golf"** | It makes golf a room inside the pool. The pool's chip would still be in the bar while you were on a green, and a card would live one level deeper than a pool forever. The families are siblings, not parent and child. |
| **A tray or sheet over the pool** | What the user vetoed, and rightly: "I don't want it to be just like a tray that opens." A sheet cannot hold three tabs and four hours. It also gives the pool a permanence golf does not get, which is a statement about the product we do not mean. |
| **One tab set that changes labels** | Home/Picks/Board renamed to Round/Tally/Scorecard is the same four boxes wearing different words. It breaks the moment a family needs two tabs or five, and it makes muscle memory lie: the third tab means a different thing depending on a state you cannot see from the tab bar. |
| **A global "everything" home above both** | This one was built, and it is the first tab rather than a level above the shells: a root that the contests are pushed onto puts a tab bar inside a pushed view, which iOS does not want to draw. As a first tab it costs nothing while there is one pool — the card is still useful, it says whose picks are in — and it is the only shape that scales past three. The pool's own page keeps its name-sized job (Pool); the two may yet merge once the card carries everything the page does. |

## What other apps do, and which half applies

Multi-context navigation splits cleanly by whether the contexts are the *same shape*.

**Homogeneous contexts keep one tab set and swap the data.** Slack's workspace rail, Apple Home's
house picker, Splitwise's groups, Notion's workspace switcher. Every context has the same verbs, so
only the content changes. This is what Tally did with pools, and it is why pool-to-pool switching
keeps the tab you were on — it should feel like changing the subject, not changing the app.

**Heterogeneous contexts swap the tab set.** Sleeper puts a league switcher above tabs that differ by
what kind of league it is. ESPN Fantasy's football and baseball leagues do not draw the same
screens. The Apple Watch's Workout app is the strongest version: one identical way in, and then a
run and a swim show you different numbers, because a run and a swim *are* different. Nobody is
confused by this, because the way in never moved.

Tally is the second kind pretending to be the first. The fix is not to make golf look like a pool;
it is to keep the **way in** identical and let the inside differ.

## The seams in the code

| Piece | Job |
|---|---|
| `AppModel.context` (`ContestContext`) | The one fact: standing in the pool, or in card *X*. Persisted, so the phone reopens on the ninth tee. |
| `RootView` | Picks the shell from that one fact. The only place the choice is made. |
| `PoolShellView` / `GolfShellView` | One per family. Neither knows the other exists. Both put `HubView` first. |
| `HubView` / `HubModel` | The switcher: every pool and card as a card. The model asks each pool with its own Keychain session and keeps the widgets' snapshot of it; `Hub` in TallyKit is the rule for what a card wants and how it says so. |
| `ScreenHeader` | The mark and the name at the top of every tab: where you are, not where else you could be. Page content rather than a toolbar item, because the iOS 26 bar sizes a leading item's glass to a width of its own choosing. |
| `AppModel` vs `GolfModel` vs `HubModel` | The pool's object owns a session, a bootstrap and a week. A card has none of those, and the home tab is about every pool at once, so each gets its own object rather than optional properties on the pool's. |
| `ContestCard` (`HubView.swift`) | One card's whole shape. A family supplies the body and nothing else, and `HubAttention` is the only input to how it is dressed. |
| `JoinPoolForm` | A code or a link, behind two doors: the home tab's button and `PoolsView`. One form, so an invitation is never explained twice. |
| `AccountView(inPool:)` | The one screen both families draw besides Home. |

Two rules fall out of this and should be enforced by review, because they are what keeps the blast
radius at zero:

1. **Nothing in `Features/Golf` imports the pool's screens, and nothing in the pool's screens imports
   golf.** The shared surface is the design system, `HubView`, and `AccountView`. That is why a
   broken card cannot break a Sunday.
2. **A new family is a new shell plus a case on `ContestContext`.** If adding one requires editing
   `PoolShellView`, the seam has been crossed.

## What this deliberately leaves open

- **A card is one phone's, for now.** Saturday is logged by whoever has the app open. The model is
  already shaped for the fix — every card has an id, every hole carries `updatedAt`, and the
  catalogue is plain JSON with ISO dates — so shared cards are a Worker endpoint and a merge rule
  (last write wins per *hole*), not a rewrite.
- **Home and the pool's page are two screens, for now.** Once the pool's card on Home carries
  picks-in, who owes and where you stand, the Pool tab has about two things left — the last
  finished week and the season race — that belong on Board anyway. The additive version shipped
  first on purpose: a new navigation idea and the dismantling of an old page in one change is twice
  the blast radius. If the Pool tab turns out to be a page nobody opens, it goes and Home takes its
  place at four tabs.
- **Golf is behind a Labs switch, off by default** (Account ▸ Settings ▸ Labs). Nothing about the
  pool changes until it is switched on: the menu draws exactly as it did, and the golf shell is
  unreachable. Turning it off is not a reset — the cards stay on the phone.
- **Naming.** The business plan calls this family a **Card** (`docs/business/09-competition-types.md`)
  — a competition the participants both play in and score. The app says "golf card" in the menu and
  "card" everywhere inside one. Pools stay pools.
