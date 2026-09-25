# Account screen clarity

September 21, 2026. Native-only follow-up based on the current `main` settings screen.

- Account owns a plain Account heading. Neither pool nor golf shells repeat a logo, contest name or contest-specific header controls on this tab.
- The identity action says “Change display name”, placed below the name so long names do not compete with the button. The editor labels the field “Display name”, saves with “Save name”, and explains that the account, entry and picks remain the same.
- Settings groups use subtle, solid inset separators instead of dashed rules. Decorative separators outside grouped settings rows are unchanged.
- No rename API, authentication, pick data or web changes.

Validation: require iOS CI (Swift tests and simulator compile). Before a device release, inspect Account from both pool and golf contexts, long account names, light/dark themes and VoiceOver; cancel a name edit and verify the account remains unchanged. This workspace cannot perform on-device visual verification.

PR #64 was prepared against the older `claude/nfl-pool-app-9tv2om` branch. This follow-up targets current `main`; do not merge that older review wholesale without reconciling intervening native changes.
