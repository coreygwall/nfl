# Calling the score

Drop a recording in this folder and the app says it when a hole closes. Nothing else — no code
change, no registration, no asset catalog. The **file name is the wiring**.

## The eight names

One per word a hole can be called. Name the file for the word, in any format below:

| File | When it plays |
| --- | --- |
| `ace` | a hole in one |
| `albatross` | three under, and not an ace |
| `eagle` | two under |
| `birdie` | one under |
| `par` | level |
| `bogey` | one over |
| `double` | two over |
| `worse` | three over or more — the whole tail, because there is no recording of "+5" |

Formats, best first: `m4a`, `caf`, `aac`, `mp3`, `wav`, `aiff`. Record on a phone and you get
`.m4a`; the rest are here so a file never has to be converted before it can be used. The first
one found wins, so `birdie.m4a` beats `birdie.wav`.

A missing word is silent, and silent is a working state — there is no placeholder beep, and a
build with three recordings in it says three words and nothing else. The list is
`ScrambleTally.callNames`, and `ScrambleTests` pins it against the scores, so a renamed word is a
failed build rather than an app that has quietly gone quiet.

## What to record

Keep them under about a second and a half. The stamp on screen waits for the voice before the
next tee slides up (`RoundView.stamped`), so a long recording holds up the round — it is capped at
four seconds, which is a guard rather than a budget.

Say the word, not a sentence. It lands on top of a screen that already says everything else, and
it is going to be heard nine or eighteen times in an afternoon.

## What the app does around it

- **The music keeps playing.** The session is `.ambient`, so the word is heard over whatever is
  on in the cart rather than stopping it. It does not duck the music: ducking is only legal on
  `.playback`, which also overrides the silent switch, so the two travel together.
- **The ring/silent switch wins.** A phone on silent plays nothing, whatever the menu says. That
  is deliberate; the menu row says *out loud* for this reason. Record a little hot — the word is
  competing with a playlist, not replacing it.
- **The menu row only appears once a recording exists.** Card menu ▸ *Call the score out loud*.
