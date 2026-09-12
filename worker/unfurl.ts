/**
 * Chat apps need absolute URLs to unfurl a link, and the app is built once but can be served
 * from any hostname — workers.dev today, a custom domain tomorrow. So the page's relative
 * og:/twitter: URLs are made absolute against the origin of the request that asked for them,
 * and nothing in the bundle ever names a host.
 */
export function withUnfurlTags(res: Response, origin: string, poolName: string, appName = "Tally"): Response {
  const title = `${poolName} — a ${appName} pool`;
  const absolute = (attr: string) => ({
    element(el: Element) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith("/")) el.setAttribute(attr, origin + v);
    },
  });
  const setContent = (value: string) => ({
    element(el: Element) {
      el.setAttribute("content", value);
    },
  });
  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(poolName);
      },
    })
    .on('meta[property="og:site_name"]', setContent(appName))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[property="og:url"]', absolute("content"))
    .on('meta[property="og:image"]', absolute("content"))
    .on('meta[name="twitter:image"]', absolute("content"))
    .transform(res);
}

/** Same absolute-URL fix for a page that has its own copy, like the landing page. */
export function withAbsoluteUrls(res: Response, origin: string): Response {
  const absolute = (attr: string) => ({
    element(el: Element) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith("/")) el.setAttribute(attr, origin + v);
    },
  });
  return new HTMLRewriter()
    .on('meta[property="og:url"]', absolute("content"))
    .on('meta[property="og:image"]', absolute("content"))
    .on('meta[name="twitter:image"]', absolute("content"))
    .transform(res);
}
