// The crumbs above a page title: "Organisations / Iridescent Church". Crumbs (with
// pre-resolved relative paths) come from runtimeSite's breadcrumbsFor; the first is Home and
// the last is the current page (empty path). Home is left out, and the top folder shows as its
// section's label in the section's hue. A top-level page has nothing above it, so it shows none.
import type { Crumb } from "@/domain/lib/runtimeSite";
import { SECTIONS } from "@/domain/lib/sections";

/** The section a top-level crumb names: by its folder ("Org") or its index title. */
function sectionOfCrumb(name: string) {
  return SECTIONS.find((s) => s.label === name || s.roots.includes(name)) ?? null;
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const shown = crumbs.slice(1);
  if (shown.length < 2) return null;
  return (
    <nav className="ak-crumbs" aria-label="Breadcrumbs">
      <ol>
        {shown.map((crumb, i) => {
          const key = `${crumb.path}|${crumb.displayName}`;
          if (i === shown.length - 1) {
            return (
              <li key={key}>
                <span aria-current="page">{crumb.displayName}</span>
              </li>
            );
          }
          const section = i === 0 ? sectionOfCrumb(crumb.displayName) : null;
          return (
            <li key={key}>
              {section ? (
                <a className="ak-crumb-section" href={crumb.path} style={{ "--hue": section.hue }}>
                  {section.label}
                </a>
              ) : (
                <a href={crumb.path}>{crumb.displayName}</a>
              )}
              <span className="ak-crumb-sep" aria-hidden="true">
                /
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
