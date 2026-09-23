# App Store listing — draft

Everything typed into App Store Connect for 1.0, in one place, so it can be reviewed like code
before anybody pastes it. The tracker is `app-store.md`. The voice rules are
`docs/business/04-brand.md` §4: dry, plain, no exclamation marks. **None of the brand's banned
words** (*bet, wager, odds, action, cash out, deposit, parlay…*) may appear in the listing. That
matters twice here, because App Review reads the listing to decide whether this is gambling.

Character limits are Apple's and the counts below were checked; re-run the check after editing:

```sh
python3 - <<'PY'
import re; t=open('docs/launch/listing.md').read()
for k in ['Name','Subtitle','Promotional text','Description','Keywords']:
    m=re.search(r'^### '+k+r'.*?\n\n```\n(.*?)\n```', t, re.S|re.M); print(k, len(m.group(1)))
PY
```

## The listing

### Name (30)

```
Tally: Pick'em Pools
```

The name on the Store has to be unique. The icon still says **Tally**
(`CFBundleDisplayName`). Fallbacks, in order: `Tally Pick'em`, `Tally — Football Pick'em`.
Decision D5.

### Subtitle (30)

```
Rank five games. Every week.
```

### Promotional text (170)

The one field that can change without a new build. Use it for the time of year.

```
Week 1 is the easy one to join. Start a pool, send the code to the group chat, and everybody picks from whatever games are left.
```

### Description (4000)

```
Tally runs a football confidence pool for you and the people you already argue with about football.

Every week, pick five games and rank them. Your surest pick is worth 5 points, your least sure is worth 1, and you only score when your team wins. Most points takes the week. Most points across the season takes the season.

HOW IT PLAYS
- Pick any five games in the week and put them in order.
- Each game locks at its own kickoff. Until then, change anything.
- Nobody sees your pick on a game until that game has started.
- A winner every week, so one bad Sunday is never fatal.

WHAT THE APP ADDS
- The week on your lock screen: a Live Activity that follows your five through Sunday.
- Widgets for the home screen and the lock screen.
- Face ID to sign in, and the same pool on the web for anyone who would rather not install anything.
- One phone can pick for the whole family.
- A board for the week and a board for the season, down to the tiebreak.

FOR THE COMMISSIONER
- Start a pool in a minute and invite people with a short code or a link.
- Post announcements to the pool.
- Results come in on their own. There is nothing to type on a Monday.

WHAT IT DOES NOT DO
No ads. No tracking. No email address or password. Tally keeps the name you chose, the picks you made and enough to sign your phone back in, and nothing else.

Free to play.
```

### Keywords (100)

Comma-separated, no spaces after commas. Words in the name and subtitle are already indexed, so
they are not repeated here.

```
football,confidence,pool,pickem,nfl,office pool,friends,family,league,standings,weekly,sunday,picks
```

Before submitting, check that "nfl" in keywords is acceptable. Apple rejects **trademarked terms
you have no rights to** in keywords (Guideline 2.3.7), and a keyword isn't describing a game the
way a team name on a pick is. The safe version replaces `nfl` with `gridiron`. See *Risks* below.

### Categories

- Primary: **Sports**
- Secondary: **Entertainment**

### URLs

| Field | Value |
| --- | --- |
| Support URL | `https://playtally.app/support` — does not exist yet (tracker B5) |
| Marketing URL | `https://playtally.app` |
| Privacy Policy URL | `https://playtally.app/privacy` |

### Copyright

`© 2026 Corey Wall` (tracker L5)

## App privacy ("nutrition label")

This has to agree with `/privacy` (`src/screens/Privacy.tsx`) and with
`ios/Tally/PrivacyInfo.xcprivacy`.

**Do you or your third-party partners collect data from this app?** Yes.

| Data type | Collected | Linked to the user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info → **Name** | Yes | Yes | No | App Functionality |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality |
| User Content → **Other User Content** (picks, golf cards, announcements) | Yes | Yes | No | App Functionality |
| Everything else | No | | | |

Two judgment calls, written down so they can be revisited:

- **The push token is not declared as a Device ID.** Apple's *Device ID* means an advertising or
  vendor identifier. An APNs token only addresses notifications to one install, and it is dropped
  when the app is deleted.
- **The IP address is not declared.** It is held briefly as a rate-limit key and expires. Apple
  counts data as collected when it is kept longer than needed to answer the request, and this is
  not.

Face ID never leaves the phone: the passkey's private key stays in the Secure Enclave, and the
server holds only a public key.

## Age rating answers

Every content question (violence, sexual content, profanity, horror, drugs and alcohol, mature
themes, medical) is **None**. The ones that need thought:

| Question | Answer | Why |
| --- | --- | --- |
| Gambling | **No** | No money is staked or paid through the app. See *Review notes*. |
| Simulated gambling | **None** | |
| Contests | **Yes** | Weekly and season standings among friends. Answer it honestly: hiding it is worse than whatever rating it produces. |
| User-generated content | **Yes** | Player names, announcements and golf cards. There's a profanity screen, and reporting is coming (B4). |
| Messaging and chat | **No** | Announcements are one-way, from the commissioner. |
| Unrestricted web access | **No** | The only web links open Tally's own pages. |

Let the questionnaire set the rating. Don't pick a rating first and fill in answers to match.

## Review notes

Paste into *App Review Information → Notes*. The code comes out of the demo database once it is
deployed (`demo-pool.md`, "The App Review sign-in"). It never goes in this file.

```
Tally is a free football confidence pool for private groups of friends and family. Each week a
player picks five games and ranks them; a correct pick scores 5 down to 1 point by rank.

SIGNING IN
Tally has no email or password. To see a pool in the middle of a season:
  1. Open the app and tap "Look around the demo pool".
  2. Tap "Already in this pool?", then tap the name "App Review".
  3. Enter the sign-in code: ________
That signs in to a demonstration pool whose players are made up, as a player with a season of
picks already made. Typing any new name on that screen also works: it joins the demo pool as a
new player. Face ID (a passkey) is offered after sign-in and is optional.

DELETING AN ACCOUNT
Account > Delete account. The name is removed and every device is signed out; past picks stay on
the board as "Former player" so other players' results don't change.

MONEY
Tally takes no payments, holds no money and pays nothing out. Some groups agree a small weekly
pot among themselves, the way an office pool does; the "Winnings" card is a record of what the
group agreed so nobody has to keep a spreadsheet. There is no purchase, no stake, no odds, and no
way to send or receive money in the app.

OTHER FEATURES
- Live Activity and widgets: follow a week in progress from the lock screen.
- Golf scorecard: off by default. Account > Labs > Golf cards turns it on.
- Pool links (playtally.app/p/...) open in the app through associated domains.

Contact: cwall800@gmail.com
```

## Risks to clear before submitting

- **Team names.** The logos are gone from the app (D7): a team is its colours and its
  abbreviation. The names remain, used to say which real game a pick is on, which is how every
  pick'em and scores app on the Store uses them. `nfl` in the keywords is the one use that isn't
  describing a game; swap it for `gridiron` if Apple objects.
- **The winnings card** (D3). It now says under it, on both surfaces, that Tally doesn't collect,
  hold or pay out money, and the review notes say the same.
- **The reviewer's pool** (D2). A reviewer who can't sign in rejects on the spot, and that is the
  most common rejection there is. The demo pool has to be deployed (C11) and the code pasted in
  before submitting.
