import { poolTypeByName } from "../shared/pools.ts";

/**
 * One HTML document serves the whole site, and its own tags describe Tally. A pool page is that
 * document with the pool's name, copy and share card written over the top — which is also why the
 * Worker, not the bundle, owns these: the app is built once and served from any hostname, so
 * relative URLs are made absolute against the origin that asked for the page.
 */
export type PoolMeta = {
  appName: string;
  /** What the commissioner calls this pool, which may not be the pool type's name. */
  poolName: string;
  /** The pool type, used to look up its copy. */
  poolType: string;
  slug: string;
};

const absolute = (origin: string) => ({
  element(el: Element) {
    const v = el.getAttribute("content");
    if (v && v.startsWith("/")) el.setAttribute("content", origin + v);
  },
});

const setContent = (value: string) => ({
  element(el: Element) {
    el.setAttribute("content", value);
  },
});

export function withUnfurlTags(res: Response, origin: string, pool: PoolMeta): Response {
  const title = `${pool.poolName} — a ${pool.appName} pool`;
  const description = poolTypeByName(pool.poolType)?.blurb ?? `A ${pool.appName} pool — play it with your friends.`;
  return new HTMLRewriter()
    // Installed to a home screen, a pool is its own app: its name, opening at its own path.
    .on('link[rel="manifest"]', {
      element(el) {
        el.setAttribute("href", `/p/${pool.slug}/manifest.webmanifest`);
      },
    })
    .on("title", {
      element(el) {
        el.setInnerContent(pool.poolName);
      },
    })
    .on('meta[name="description"]', setContent(description))
    .on('meta[property="og:site_name"]', setContent(pool.appName))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[property="og:description"]', setContent(description))
    .on('meta[property="og:url"]', setContent(`${origin}/p/${pool.slug}`))
    .on('meta[property="og:image"]', setContent(`${origin}/og.jpg`))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[name="twitter:description"]', setContent(description))
    .on('meta[name="twitter:image"]', setContent(`${origin}/og.jpg`))
    .transform(res);
}

/** The site's own pages keep their tags; only the URLs need a host. */
export function withAbsoluteUrls(res: Response, origin: string): Response {
  return new HTMLRewriter()
    .on('meta[property="og:url"]', absolute(origin))
    .on('meta[property="og:image"]', absolute(origin))
    .on('meta[name="twitter:image"]', absolute(origin))
    .transform(res);
}

/**
 * iOS Safari's "Open in the app" banner, at the top of the page. It is the missing step between
 * the two surfaces: a pool link pasted into the address bar does not trigger a universal link,
 * so without this someone with the app installed still ends up in the browser.
 *
 * `app-argument` hands over the exact page, so the app opens on the pool they were looking at.
 * The tag is left off entirely until APPLE_APP_STORE_ID names a real App Store listing — an
 * empty one makes Safari log an error and show nothing.
 */
export function withAppBanner(res: Response, appStoreId: string | undefined, pageUrl: string): Response {
  const id = (appStoreId ?? "").trim();
  if (!/^\d+$/.test(id)) return res;
  const argument = pageUrl.replace(/"/g, "%22");
  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append(`<meta name="apple-itunes-app" content="app-id=${id}, app-argument=${argument}">`, { html: true });
      },
    })
    .transform(res);
}

/**
 * A URL that must never be indexed, whatever it ends up answering.
 *
 * Applied to the whole `/g/*` prefix rather than to the page that succeeds, because the two are
 * not the same set: a card that has been taken down, a mistyped token and a cold asset handler all
 * answer from here too, and "noindex on the good ones" is how a 404 page ends up being the thing
 * a search engine keeps. The `cache-control` is the other half — this document is the same bytes
 * for everybody, but an intermediary holding it under a *card's* URL is one hop from holding the
 * card.
 */
export function withNoIndex(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  out.headers.set("cache-control", "private, no-store");
  return out;
}
