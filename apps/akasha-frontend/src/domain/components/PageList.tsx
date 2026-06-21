// Ports faerrin PageList.astro: the ul.section-ul listing used by folder and tag
// pages. Entry hrefs + tag hrefs are pre-resolved relative to the list page slug
// (runtimeSite); dates format deterministically (UTC).
import { formatDate } from "@/domain/lib/formatDate";
import type { PageEntryView } from "@/domain/lib/runtimeSite";

export function PageList({ entries }: { entries: PageEntryView[] }) {
  return (
    <ul className="section-ul">
      {entries.map((page) => (
        <li className="section-li" key={page.href}>
          <div className="section">
            <p className="meta">
              {page.date && <time dateTime={page.date}>{formatDate(page.date)}</time>}
            </p>
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
