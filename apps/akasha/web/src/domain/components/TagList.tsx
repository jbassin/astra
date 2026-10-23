// Ports faerrin TagList.astro. Tag links resolve to tags/<tag> relative to the
// page (pre-resolved in runtimeSite as LinkView).
import type { LinkView } from "@/domain/lib/runtimeSite";

export function TagList({ tags }: { tags: LinkView[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tags">
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
