import { parseDocument } from "@astra/vellum-lang";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DocumentView } from "./components/DocumentView";
import type { CrossRefResolver } from "./crossrefResolver";

/**
 * The crossref resolver seam (N3 spike → 0011 akasha-frontend). gothic renders a
 * crossref as an unresolved placeholder by default (L6); a consumer-injected
 * resolver turns it into a real `<a href>`. Proves: default unchanged, resolver
 * hits become links (carrying the `data-*` attrs), and a `null` (dangling target)
 * falls back to the placeholder — all under `react-dom/server` (SSR-safe).
 */
const DOC = `# Page

Prose with a [[Belvedere#origins|the vault]] and a dangling [[Nowhere]].

:::fields
See also :: [[Iridescent Host]]
:::
`;

describe("crossref resolver seam", () => {
  test("no resolver → unresolved placeholder span, no href (default L6 behaviour)", () => {
    const html = renderToStaticMarkup(<DocumentView document={parseDocument(DOC)} />);
    expect(html).toContain("data-crossref-target");
    expect(html).not.toContain("href");
  });

  test("resolver hit → real <a href>; null → placeholder; nested crossrefs resolved too", () => {
    const resolve: CrossRefResolver = (node) =>
      node.target === "Nowhere" ? null : { href: `/${node.target.replace(/ /g, "-")}/` };

    const html = renderToStaticMarkup(
      <DocumentView document={parseDocument(DOC)} resolveCrossref={resolve} />,
    );

    // Resolved inline crossref → anchor with computed href + preserved heading attr.
    expect(html).toContain('href="/Belvedere/"');
    expect(html).toContain('data-crossref-heading="origins"');
    // Nested crossref inside a :::fields block is resolved through the same context.
    expect(html).toContain('href="/Iridescent-Host/"');
    // Dangling target (resolver returned null) stays a placeholder span — no href.
    expect(html).toContain('data-crossref-target="Nowhere"');
    expect(html).not.toContain('href="/Nowhere/"');
  });
});
