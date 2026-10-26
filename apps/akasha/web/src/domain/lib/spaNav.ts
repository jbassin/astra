/**
 * Which link targets the router handles. Wiki bodies, listings and islands all render
 * plain `<a href>` (gothic links are plain HTML), so a document-level click handler
 * (`SpaLinks`) routes the ones that point at app pages and leaves the rest to the browser.
 */

// Served from disk by the SSR server or Caddy, never by the router.
const FILE_PREFIXES = ["/audio/", "/pagefind/", "/static/", "/assets/", "/fonts/"];
// Slugs can contain dots (`Mr.-Whiskers`), so only these extensions mark a file.
const FILE_EXTENSION =
  /\.(?:xml|json|txt|mp3|ogg|wav|png|jpe?g|gif|svg|webp|avif|ico|pdf|css|js|mjs|html)$/i;

/**
 * The router href (path, query and hash) for a link to `target` clicked on `current`, or
 * `null` when the browser should follow it: another origin, a static file, or a jump to
 * an anchor on the current page (the browser scrolls and fires `hashchange`, which the
 * TranscriptPlayer listens for).
 */
export function spaHref(target: URL, current: URL): string | null {
  if (target.origin !== current.origin) return null;
  if (FILE_PREFIXES.some((p) => target.pathname.startsWith(p))) return null;
  if (FILE_EXTENSION.test(target.pathname)) return null;
  const samePage = target.pathname === current.pathname && target.search === current.search;
  if (samePage && target.hash !== "") return null;
  return target.pathname + target.search + target.hash;
}

/** Whether a click should stay with the browser regardless of the target. */
export function isBrowserClick(e: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (e.defaultPrevented || e.button !== 0) return true;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;
  if (anchor.target && anchor.target !== "_self") return true;
  return anchor.hasAttribute("download");
}
