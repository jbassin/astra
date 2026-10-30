// The rows of a folder page, a tag page and the tag index: a hue dot for the entry's section,
// the title, a faint count of the pages under a folder, and the entry's tags as chips. The
// whole row is the title link's hit area; the chips sit above it. One column: two columns of
// rows in the page column (720 px at 1440) wrapped most titles and chips. Hrefs are pre-resolved
// relative to the list page (runtimeSite); sections and counts come from listingData.ts.
// No per-entry date: the corpus was bulk-imported, so the dates read as noise.
import type { ListingRow } from "@/domain/lib/listingData";
import { SECTIONS } from "@/domain/lib/sections";

const hueOf = (row: ListingRow) => SECTIONS.find((s) => s.id === row.section)?.hue;

export function PageList({
  entries,
  showTags = true,
  exceptTag,
}: {
  entries: ListingRow[];
  /** False hides the chips (the tag index, where every row shares the tag). */
  showTags?: boolean;
  /** A tag page's own tag, which every row carries: no chip for it. */
  exceptTag?: string;
}) {
  return (
    <ul className="ak-rows">
      {entries.map((row) => {
        const tags = showTags ? row.tags.filter((t) => t.label !== exceptTag) : [];
        return (
          <li key={row.href} className="ak-row" style={{ "--hue": hueOf(row) }}>
            <span className="ak-dot" aria-hidden="true" />
            <a className="ak-row-title" href={row.href}>
              {row.title}
            </a>
            {row.childLabel && <span className="ak-row-count">{row.childLabel}</span>}
            {tags.length > 0 && (
              <ul className="ak-row-tags" aria-label="Tags">
                {tags.map((t) => (
                  <li key={t.href}>
                    <a className="ak-chip" href={t.href}>
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
