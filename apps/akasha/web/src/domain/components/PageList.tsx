// Ports faerrin PageList.astro: the ul.section-ul listing used by folder and tag
// pages. Entry hrefs + tag hrefs are pre-resolved relative to the list page slug
// (runtimeSite). The per-entry date is intentionally NOT shown: the corpus was
// bulk-imported, so every entry carries the same commit date — it read as noise
// (F12). Re-add a `<time>` here if a meaningful per-page date lands.
import type { PageEntryView } from "@/domain/lib/runtimeSite";

export function PageList({ entries }: { entries: PageEntryView[] }) {
  return (
    <ul className="section-ul">
      {entries.map((page) => (
        <li className="section-li" key={page.href}>
          <div className="section">
            <div className="desc">
              <h3>
                <a href={page.href} className="internal">
                  {page.title}
                </a>
              </h3>
            </div>
            <ul className="tags">
              {page.tags.map((t) => (
                <li key={t.href}>
                  <a className="internal tag-link" href={t.href}>
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
