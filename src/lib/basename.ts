/**
 * A pool lives at /p/<slug>, so the router runs under that prefix and every in-app link stays
 * written as if it were at the root. Derived from the URL rather than baked in at build time —
 * the same bundle will serve any pool when there is more than one.
 */
function derive(): string {
  if (typeof window === "undefined") return "/";
  const [, p, slug] = window.location.pathname.split("/");
  return p === "p" && slug ? `/p/${slug}` : "/";
}

export const BASENAME = derive();

/** An absolute link to this pool — for sharing, and for sign-in links. */
export function poolUrl(path = ""): string {
  const base = BASENAME === "/" ? "" : BASENAME;
  return `${window.location.origin}${base}${path}`;
}
