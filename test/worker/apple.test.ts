import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { appleAppIds, appleAppSiteAssociation } from "../../worker/apple.ts";
import { withAppBanner } from "../../worker/unfurl.ts";

/**
 * Apple reads one file from the domain and then lets the iOS app use the site's passkeys and
 * open its links. It is picky: exact path, JSON body, no redirect. Get that wrong and Face ID
 * silently stops working in the app, so the shape is pinned here.
 */
describe("apple-app-site-association", () => {
  it("is served as JSON at the well-known path, and at the root fallback", async () => {
    for (const path of ["/.well-known/apple-app-site-association", "/apple-app-site-association"]) {
      const res = await SELF.fetch(`http://pool.test${path}`, { redirect: "manual" });
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toContain("application/json");
      const body = (await res.json()) as any;
      // Only well-formed ids make it through; "bad-id" from the test config does not.
      expect(body.webcredentials.apps).toEqual(["ABCDE12345.app.playtally.ios"]);
      expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.app.playtally.ios"]);
      expect(body.applinks.details[0].components[0]["/"]).toBe("/p/*");
    }
  });

  it("parses the configured ids and tolerates an empty config", () => {
    expect(appleAppIds("ABCDE12345.app.playtally.ios,  FGHIJ67890.app.playtally.ios ")).toEqual([
      "ABCDE12345.app.playtally.ios",
      "FGHIJ67890.app.playtally.ios",
    ]);
    expect(appleAppIds(undefined)).toEqual([]);
    expect(appleAppIds("app.playtally.ios")).toEqual([]);
    const empty = appleAppSiteAssociation("");
    expect(empty).toEqual({ applinks: { apps: [], details: [] }, webcredentials: { apps: [] } });
  });
});

/**
 * The other half of moving between the two: a link typed into Safari's address bar never fires
 * a universal link, so the banner is what gets someone with the app installed out of the browser.
 * (The Worker's page routes need the ASSETS binding, which the test runtime has no build for, so
 * the rewriter is exercised directly on the document it would be handed.)
 */
describe("open-in-the-app banner", () => {
  const page = () =>
    new Response('<!doctype html><html><head><title>Tally</title></head><body></body></html>', {
      headers: { "content-type": "text/html" },
    });

  it("adds the banner to the head, pointing the app at the page being read", async () => {
    const html = await withAppBanner(page(), "6499999999", "https://playtally.app/p/high-five/board").text();
    expect(html).toContain('<meta name="apple-itunes-app"');
    expect(html).toContain("app-id=6499999999");
    expect(html).toContain("app-argument=https://playtally.app/p/high-five/board");
    // Appended inside the head rather than replacing what was already there.
    expect(html).toContain("<title>Tally</title>");
  });

  it("is left off entirely until an App Store listing is configured", async () => {
    for (const id of [undefined, "", "   ", "not-an-id"]) {
      expect(await withAppBanner(page(), id, "https://playtally.app/").text()).not.toContain("apple-itunes-app");
    }
  });
});
