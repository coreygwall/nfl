/**
 * Where to write when something is wrong.
 *
 * A plain constant rather than a build-time variable, and deliberately so: `VITE_SUPPORT_EMAIL`
 * was the first shape of this, and `.env` is gitignored — so every production build would have
 * read it as undefined and quietly shipped a privacy page with no way to contact anybody, which
 * is the exact failure the gating was meant to prevent.
 *
 * It is not a secret. A support address is published on purpose: the App Store listing needs one,
 * the privacy policy needs one, and a settings page that offers no way to get help is a settings
 * page that sends people to whoever runs their pool for things that are not their pool's fault.
 *
 * Mirrored in `ios/TallyKit/Sources/TallyKit/Rules/Contact.swift`; `contactParity.test.ts` fails
 * if the two drift, because a Swift build cannot see this file and a wrong address is a message
 * nobody receives.
 */
export const SUPPORT_EMAIL = "cwall800@gmail.com";

/** The subject line a support mail arrives with, so the inbox can sort it without being asked. */
export const SUPPORT_SUBJECT = "Tally support";

/** `mailto:` with the subject already filled in. */
export function supportMailto(subject: string = SUPPORT_SUBJECT): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
