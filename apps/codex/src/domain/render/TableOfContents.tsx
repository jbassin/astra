import { useEffect, useState, type ReactElement } from "react";

/**
 * D29-109b (P11 S5, #15) — the "On this page" table of contents. A pure
 * client island (SSR renders nothing at all — same posture as `Popover.tsx`
 * / the scope doc's own D-15: "client island scanning the rendered headings
 * post-hydration"), so a no-JS visitor sees no ToC box but every heading it
 * WOULD have linked to still carries a real SSR-rendered `id` (`nodes.tsx`'s
 * heading case, `entityPage.tsx`'s Lore h2) — the anchors work regardless.
 *
 * Scans `.codex-entity-page` (the entity article — body + Lore, since Lore
 * is a nested `<section>` inside that same article) for `h2..h6` elements
 * carrying an `id`, post-hydration. `AttachedSidebars`' own h2/h3 (a
 * sibling `<section>` OUTSIDE the article) get anchor ids too (so a direct
 * `#`-link to a sidebar title still works) but are deliberately NOT
 * included in this scan — this island's "on this page" framing is about
 * the entity's own written content, and folding the sidebars section in
 * would require a wrapping DOM element `EntityRenderPane.tsx` doesn't
 * otherwise need (a layout-risk not worth taking for this round).
 *
 * Mounted only where D29-109b calls for it (`EntityRenderPane.tsx`, gated
 * on `standalone` — the split-view right pane and embedded/golden contexts
 * never get one): entity pages AND rules docs both route through that one
 * composition root, so "the same box inside `.codex-rules-main`" for rules
 * pages falls out for free (this component renders BEFORE `<EntityPage>` in
 * that root, which `RulesLayout` places inside `.codex-rules-main`).
 */
const MIN_HEADINGS = 8;

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function scanHeadings(): TocEntry[] {
  const container = document.querySelector(".codex-entity-page");
  if (!container) return [];
  const headings = container.querySelectorAll<HTMLElement>(
    "h2[id], h3[id], h4[id], h5[id], h6[id]",
  );
  const entries: TocEntry[] = [];
  headings.forEach((h) => {
    entries.push({ id: h.id, text: h.textContent ?? "", level: Number(h.tagName.slice(1)) });
  });
  return entries;
}

export function TableOfContents(): ReactElement | null {
  const [entries, setEntries] = useState<TocEntry[]>([]);

  // Effects never run during SSR — `entries` stays `[]` there, so the
  // early-return below always fires server-side regardless of the real
  // page's heading count (the deliberate "renders nothing" SSR posture).
  useEffect(() => {
    setEntries(scanHeadings());
  }, []);

  if (entries.length < MIN_HEADINGS) return null;

  return (
    <details className="codex-toc" open>
      <summary className="codex-toc-summary">On this page</summary>
      <ul className="codex-toc-list">
        {entries.map((entry) => (
          <li key={entry.id} className={`codex-toc-level-${entry.level}`}>
            <a href={`#${entry.id}`}>{entry.text}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}
