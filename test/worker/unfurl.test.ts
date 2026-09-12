import { describe, expect, it } from "vitest";
import { withUnfurlTags } from "../../worker/unfurl.ts";

const page = `<!doctype html><html><head>
<title>High Five</title>
<meta property="og:site_name" content="High Five" />
<meta property="og:title" content="High Five — NFL pool" />
<meta property="og:url" content="/" />
<meta property="og:image" content="/og.jpg" />
<meta name="twitter:title" content="High Five — NFL pool" />
<meta name="twitter:image" content="/og.jpg" />
</head><body></body></html>`;

const render = (origin: string, poolName = "High Five") =>
  withUnfurlTags(new Response(page, { headers: { "content-type": "text/html" } }), origin, poolName).text();

describe("link unfurl tags", () => {
  it("points at whatever host served the page", async () => {
    const workersDev = await render("https://nfl.corey.workers.dev");
    expect(workersDev).toContain('property="og:url" content="https://nfl.corey.workers.dev/"');
    expect(workersDev).toContain('property="og:image" content="https://nfl.corey.workers.dev/og.jpg"');
    expect(workersDev).toContain('name="twitter:image" content="https://nfl.corey.workers.dev/og.jpg"');

    // The same build, served from a custom domain, unfurls as that domain. Nothing is baked in.
    const custom = await render("https://pool.example.com");
    expect(custom).toContain('property="og:url" content="https://pool.example.com/"');
    expect(custom).toContain('property="og:image" content="https://pool.example.com/og.jpg"');
    expect(custom).not.toContain("workers.dev");
  });

  it("leaves an already-absolute URL alone", async () => {
    const html = `<html><head><meta property="og:image" content="https://cdn.example.com/x.jpg" /></head></html>`;
    const out = await withUnfurlTags(
      new Response(html, { headers: { "content-type": "text/html" } }),
      "https://pool.example.com",
      "High Five",
    ).text();
    expect(out).toContain('content="https://cdn.example.com/x.jpg"');
  });

  it("uses the pool name for the title and site name", async () => {
    const out = await render("https://pool.example.com", "Sunday Money");
    expect(out).toContain("<title>Sunday Money</title>");
    expect(out).toContain('property="og:site_name" content="Sunday Money"');
    expect(out).toContain('property="og:title" content="Sunday Money — NFL pool"');
  });
});
