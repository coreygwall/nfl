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

> **The switcher is global. The tabs are the contest's. Account is always the last one.**

Three sentences, and each is load-bearing.

**The switcher is global.** One control, top-left of every screen of every contest, naming where you
are standing and listing everywhere else you could stand. It is `PoolMenu`, it is already the pool
chip, and golf cards are a second section inside it. You never have to leave a contest to change
contests, and you never have to learn a second way to do it.

**The tabs are the contest's.** A pool draws Home · Picks · Board. A card draws Round · Tally ·
Scorecard. The tab bar is a property of the family you are in, not of the app, so neither family
carries a tab that is dead weight for it — no Board on a card, no Round in a pool.

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
| **A global "everything" home above both** | The honest version of this is a real product — one screen that says what needs doing across every pool and every card. It is also a screen nobody needs while there is one pool and one card. Home already lists the *other* pools as a strip (`PoolPeek`), which is the cross-contest fact worth having today. Revisit when somebody genuinely holds four contests at once. |

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
| `PoolShellView` / `GolfShellView` | One per family. Neither knows the other exists. |
| `PoolMenu` | The shared switcher, wrapped by `PoolChip` in a pool and `CardChip` in a card. |
| `AppModel` vs `GolfModel` | The pool's object owns a session, a bootstrap and a week. A card has none of those, so it gets its own object rather than three optional properties on the pool's. |
| `AccountView(inPool:)` | The one screen both families draw. |

Two rules fall out of this and should be enforced by review, because they are what keeps the blast
radius at zero:

1. **Nothing in `Features/Golf` imports the pool's screens, and nothing in the pool's screens imports
   golf.** The shared surface is the design system, `PoolMenu`, and `AccountView`. That is why a
   broken card cannot break a Sunday.
2. **A new family is a new shell plus a case on `ContestContext`.** If adding one requires editing
   `PoolShellView`, the seam has been crossed.

## What this deliberately leaves open

- **A card is one phone's, for now.** Saturday is logged by whoever has the app open. The model is
  already shaped for the fix — every card has an id, every hole carries `updatedAt`, and the
  catalogue is plain JSON with ISO dates — so shared cards are a Worker endpoint and a merge rule
  (last write wins per *hole*), not a rewrite.
- **There is no cross-contest home.** See the table above. The trigger to build one is somebody
  holding more than about three live contests, not the second family shipping.
- **Golf is behind a Labs switch, off by default** (Account ▸ Settings ▸ Labs). Nothing about the
  pool changes until it is switched on: the menu draws exactly as it did, and the golf shell is
  unreachable. Turning it off is not a reset — the cards stay on the phone.
- **Naming.** The business plan calls this family a **Card** (`docs/business/09-competition-types.md`)
  — a competition the participants both play in and score. The app says "golf card" in the menu and
  "card" everywhere inside one. Pools stay pools.
