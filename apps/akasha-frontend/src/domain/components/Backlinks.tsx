// Ports faerrin Backlinks.astro (hideWhenEmpty). The reverse index uses Quartz's
// resolved-link semantics (site.ts); links are pre-resolved + sorted in runtimeSite.
// The overflow/gradient behavior is a later island; here we render the static list.
import type { LinkView } from "@/domain/lib/runtimeSite";

export function Backlinks({ backlinks }: { backlinks: LinkView[] }) {
  if (backlinks.length === 0) return null;
  return (
    <div className="backlinks">
      <h3>Backlinks</h3>
      <ul className="overflow">
        {backlinks.map((b) => (
          <li key={b.href}>
            <a href={b.href} className="internal">
              {b.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
