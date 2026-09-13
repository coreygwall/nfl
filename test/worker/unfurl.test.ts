import { describe, expect, it } from "vitest";
import { withAbsoluteUrls, withUnfurlTags } from "../../worker/unfurl.ts";
import { HIGH_FIVE } from "../../shared/pools.ts";

/** The one document the site ships: its own tags describe Tally. */
const page = `<!doctype html><html><head>
<title>Tally — pools to play with your friends</title>
<meta name="description" content="Tally is where you and your friends play simple, free pools." />
<meta property="og:site_name" content="Tally" />
<meta property="og:title" content="Tally — pools to play with your friends" />
<meta property="og:description" content="Simple, free, fun games to play with your friends." />
<meta property="og:url" content="/" />
<meta property="og:image" content="/og-tally.jpg" />
<meta name="twitter:title" content="Tally — pools to play with your friends" />
<meta name="twitter:description" content="Simple, free, fun games to play with your friends." />
<meta name="twitter:image" content="/og-tally.jpg" />
</head><body></body></html>`;

const html = () => new Response(page, { headers: { "content-type": "text/html" } });

const pool = (over: Partial<Parameters<typeof withUnfurlTags>[2]> = {}) => ({
  appName: "Tally",
  poolName: "High Five",
  poolType: "High Five",
  slug: "high-five",
  ...over,
});

describe("link unfurl tags", () => {
  it("points at whatever host served the page", async () => {
    const workersDev = await withUnfurlTags(html(), "https://nfl.corey.workers.dev", pool()).text();
    expect(workersDev).toContain('property="og:url" content="https://nfl.corey.workers.dev/p/high-five"');
    expect(workersDev).toContain('property="og:image" content="https://nfl.corey.workers.dev/og.jpg"');
    expect(workersDev).toContain('name="twitter:image" content="https://nfl.corey.workers.dev/og.jpg"');

    // The same build, served from a custom domain, unfurls as that domain. Nothing is baked in.
    const custom = await withUnfurlTags(html(), "https://pool.example.com", pool()).text();
    expect(custom).toContain('property="og:url" content="https://pool.example.com/p/high-five"');
    expect(custom).toContain('property="og:image" content="https://pool.example.com/og.jpg"');
    expect(custom).not.toContain("workers.dev");
  });

  it("names the pool in the title and the app in the site name", async () => {
    const out = await withUnfurlTags(html(), "https://pool.example.com", pool({ poolName: "Sunday Money" })).text();
    expect(out).toContain("<title>Sunday Money</title>");
    // The site is Tally; Sunday Money is one pool running on it.
    expect(out).toContain('property="og:site_name" content="Tally"');
    expect(out).toContain('property="og:title" content="Sunday Money — a Tally pool"');
  });

  it("describes a pool with its pool type's own copy, so there is one source for it", async () => {
    const out = await withUnfurlTags(html(), "https://pool.example.com", pool({ poolName: "Sunday Money" })).text();
    expect(out).toContain(`name="description" content="${HIGH_FIVE.blurb}"`);
    expect(out).toContain(`property="og:description" content="${HIGH_FIVE.blurb}"`);
    expect(out).not.toContain("Simple, free, fun games");

    // An unknown pool type still gets a sentence rather than the site's own pitch.
    const other = await withUnfurlTags(html(), "https://pool.example.com", pool({ poolType: "Shuffleboard" })).text();
    expect(other).toContain('property="og:description" content="A Tally pool. No signup, just your name."');
  });

  it("leaves the site's own page saying Tally, and only absolutises its URLs", async () => {
    const out = await withAbsoluteUrls(html(), "https://playtally.app").text();
    expect(out).toContain("<title>Tally — pools to play with your friends</title>");
    expect(out).toContain('property="og:url" content="https://playtally.app/"');
    expect(out).toContain('property="og:image" content="https://playtally.app/og-tally.jpg"');
    expect(out).toContain('name="twitter:image" content="https://playtally.app/og-tally.jpg"');
  });

  it("leaves an already-absolute URL alone", async () => {
    const absolute = `<html><head><meta property="og:image" content="https://cdn.example.com/x.jpg" /></head></html>`;
    const out = await withAbsoluteUrls(
      new Response(absolute, { headers: { "content-type": "text/html" } }),
      "https://pool.example.com",
    ).text();
    expect(out).toContain('content="https://cdn.example.com/x.jpg"');
  });
});
