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
