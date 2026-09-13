/**
 * What ties the iOS app to playtally.app. Apple reads this file once, from the domain itself, and
 * then trusts the app named here with two things a website normally keeps to itself:
 *
 * - `webcredentials`: passkeys made for this domain (Face ID on the web) may be used by the app,
 *   and passkeys the app makes are offered to Safari. One credential, both doors.
 * - `applinks`: a pool link (`/p/<slug>/…`) tapped in iMessage opens in the app when it is
 *   installed, so the commissioner's sign-in links work there too.
 *
 * The app ids are the Apple team id and bundle id joined with a dot, `TEAMID.app.playtally.ios`,
 * and live in config (APPLE_APP_IDS, comma-separated) rather than here: the team id is the one
 * value in this repo that belongs to an Apple developer account, not to the code. With nothing
 * configured the file is still served, and still valid — it just names no app.
 */
export function appleAppIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(s));
}

export function appleAppSiteAssociation(raw: string | undefined): Record<string, unknown> {
  const apps = appleAppIds(raw);
  return {
    applinks: {
      // The legacy key must be present and empty for older iOS versions to accept the file.
      apps: [],
      details: apps.length
        ? [
            {
              appIDs: apps,
              components: [
                { "/": "/p/*", comment: "A pool, and every page inside it" },
                { "/": "/", exclude: true, comment: "The landing page stays on the web" },
              ],
            },
          ]
        : [],
    },
    webcredentials: { apps },
  };
}
