/**
 * Build-time vellum → HTML render (0011 slice 4). Parses a `.vellum` source and
 * renders it through gothic's `DocumentView` to a static HTML string, with the N3
 * `resolveCrossref` seam turning `[[crossref]]` placeholders into real `<a href>`
 * links (still carrying `data-crossref-*` for the slice-5 Popover island).
 *
 * BUILD-ONLY: imported solely by `scripts/build-content.ts`, never by route/runtime
 * code — so react-dom/server + gothic's renderer + vellum-lang's parser stay out of
 * the client bundle. The route just injects the baked HTML (dangerouslySetInnerHTML),
 * exactly as faerrin's SSG baked each page (gothic already renders the whole vellum
 * union — handout/edict/fields/timeline/columns/GFM — so this is ~0 renderer code).
 */

import type { CrossRefResolver } from "@astra/gothic";
import { DocumentView } from "@astra/gothic";
import { parseDocument } from "@astra/vellum-lang";
import { renderToStaticMarkup } from "react-dom/server";

export function renderBody(source: string, resolveCrossref: CrossRefResolver): string {
  return renderToStaticMarkup(
    <DocumentView document={parseDocument(source)} resolveCrossref={resolveCrossref} />,
  );
}

/**
 * Approximate reading time in minutes (ports faerrin ContentMeta's `reading-time`
 * use: ~200 wpm, min 1). Computed from the raw source minus frontmatter/markup —
 * displayed-value parity isn't required (N4).
 */
export function readingMinutes(source: string): number {
  const text = source.replace(/^---[\s\S]*?---/, "").replace(/[#>*_`[\]()!]/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
