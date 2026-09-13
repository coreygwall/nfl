/**
 * A pool lives at /p/<slug>, so the router runs under that prefix and every in-app link stays
 * written as if it were at the root. Derived from the URL rather than baked in at build time —
 * the same bundle will serve any pool when there is more than one, and the bare root is Tally
 * itself: the landing page, not a pool.
 */
function derive(): string | null {
  if (typeof window === "undefined") return null;
  const [, p, slug] = window.location.pathname.split("/");
  return p === "p" && slug ? slug : null;
}

/** The pool being served, or null on the Tally landing page. */
export const POOL_SLUG = derive();

export const BASENAME = POOL_SLUG ? `/p/${POOL_SLUG}` : "/";

/** An absolute link to this pool — for sharing, and for sign-in links. */
export function poolUrl(path = ""): string {
  const base = BASENAME === "/" ? "" : BASENAME;
  return `${window.location.origin}${base}${path}`;
}
