/**
 * Pure helpers for the Pagefind index (slice 8, N1). Pagefind indexes the content
 * inside `data-pagefind-body` and takes the result URL from the `url` we pass; it
 * lifts the result title from the first `<h1>` in the body. We feed it in-memory
 * HTML docs (the NodeJS Indexing API) rather than built static HTML, since this is
 * an SSR app with no `dist/` pages (Decision I). Kept separate from build-search.ts
 * so the doc shape is unit-testable without the pagefind binary.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The route URL for a page slug (what the Search island navigates to). */
export function searchUrl(slug: string): string {
  return slug === "index" ? "/" : `/${slug}`;
}

/** A minimal HTML doc Pagefind can index: title + the body scoped by
 *  `data-pagefind-body` (matches faerrin's `<article data-pagefind-body>`). */
export function searchDoc(title: string, bodyHtml: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title></head><body>` +
    `<article data-pagefind-body><h1>${escapeHtml(title)}</h1>${bodyHtml}</article>` +
    `</body></html>`
  );
}
