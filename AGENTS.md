# Agents working in this repo

Claude and Codex both work on Tally. This file is Codex's entry point, and `CLAUDE.md` is Claude's.
They are not two sets of rules:

- **Read `CLAUDE.md` first.** It is the project's memory: how the pool plays, why the code is
  shaped the way it is, and the traps that have already been hit once. Everything in it applies to
  every agent.
- **The shared to-do list is `docs/launch/app-store.md`**, the App Store launch tracker. Claim an
  item there (your name and branch in its *Owner* cell) before starting it, and move it to done in
  the pull request that does the work. The other agent reads the same file, and claiming is the
  only thing that stops the two of you doing the same work twice.

## The rules that most often go wrong

- **`main` deploys.** Work on a branch, open a pull request into `main`, and never push to `main`
  directly. `claude/nfl-pool-app-9tv2om` is retired: pushing there releases nothing, and it looks
  exactly as successful as it always did.
- **Run the checks before opening a pull request**, since `CI` runs the same ones and blocks the
  merge:

  ```sh
  npm run typecheck && npm test && npm run test:e2e
  ```

- **Swift doesn't build in the Linux container.** `.github/workflows/ios.yml` builds it on macOS,
  so an iOS change is only proven once that check is green.
- **Rules live twice, once per language, and a parity test holds them together**: the live
  activity, pool codes, golf, winnings, contact and theme. Change the TypeScript and the Swift
  together, or the `*Parity.test.ts` for it fails.
