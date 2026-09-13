import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { appleAppIds, appleAppSiteAssociation } from "../../worker/apple.ts";

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
