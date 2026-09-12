import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * The app is Tally, at the root; a pool is one instance under /p/<slug>. These are the routes
 * people actually paste to each other, so they are worth pinning down.
 */
describe("site routing", () => {
  it("sends the paths the pool used to live at to where it lives now, keeping the query", async () => {
    for (const [from, to] of [
      ["/welcome", "/p/high-five/welcome"],
      ["/week/3", "/p/high-five/week/3"],
      ["/board", "/p/high-five/board"],
      ["/board/season", "/p/high-five/board/season"],
      ["/rules", "/p/high-five/rules"],
      ["/admin", "/p/high-five/admin"],
    ]) {
      const res = await SELF.fetch(`http://pool.test${from}`, { redirect: "manual" });
      expect(res.status, from).toBe(301);
      expect(new URL(res.headers.get("location")!).pathname, from).toBe(to);
    }

    const withQuery = await SELF.fetch("http://pool.test/welcome?claim=abc&code=QRT49MKP", { redirect: "manual" });
    const moved = new URL(withQuery.headers.get("location")!);
    expect(moved.pathname).toBe("/p/high-five/welcome");
    expect(moved.searchParams.get("claim")).toBe("abc");
    expect(moved.searchParams.get("code")).toBe("QRT49MKP");
  });

  it("keeps the API at the root, where the app calls it", async () => {
    const health = await SELF.fetch("http://pool.test/api/health");
    expect(health.status).toBe(200);
    const missing = await SELF.fetch("http://pool.test/api/nope");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as any).error.code).toBe("NOT_FOUND");
  });
});
