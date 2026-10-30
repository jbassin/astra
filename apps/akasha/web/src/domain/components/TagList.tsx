// A page's tags as pill chips, each linking to its tag page (hrefs pre-resolved relative to
// the page in runtimeSite as LinkView). Rendered inside the facts row (ContentMeta).
import type { LinkView } from "@/domain/lib/runtimeSite";

export function TagList({ tags }: { tags: LinkView[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tags ak-chips" aria-label="Tags">
      {tags.map((t) => (
        <li key={t.href}>
          <a href={t.href} className="internal tag-link">
            {t.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
