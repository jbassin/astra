// Ports faerrin Breadcrumbs.astro / Quartz Breadcrumbs.tsx: Home ❯ folder ❯ …
// ❯ current. Crumbs (with pre-resolved relative paths) come from runtimeSite's
// breadcrumbsFor; the last crumb is the current page (empty path).
import type { Crumb } from "@/domain/lib/runtimeSite";

const SPACER = "❯";

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="breadcrumb-container" aria-label="breadcrumbs">
      {crumbs.map((crumb, i) => (
        <div className="breadcrumb-element" key={`${crumb.path}|${crumb.displayName}`}>
          <a href={crumb.path}>{crumb.displayName}</a>
          {i !== crumbs.length - 1 && <p>{` ${SPACER} `}</p>}
        </div>
      ))}
    </nav>
  );
}
