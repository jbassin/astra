// P12 S2 (D29-118) — the `/class` + `/class/{slug}` shell: a narrow
// class-list rail + a main pane, shared by BOTH the bare `/class` index
// route and every `/class/{slug}` detail route (mirrors the existing
// `RulesLayout.tsx` "one shared sidebar+main component, two route files"
// precedent — see that file's own header comment).
//
// P12 S3 (D29-119/-120) — the rail's real styling + mobile fallback: a
// native `<details>`/`<summary>` disclosure, the SAME zero-JS pattern
// `RulesLayout.tsx` already established (`.codex-rules-sidebar-disclosure`)
// — always-open + sticky on desktop, collapsible with content-first
// ordering below the shared `.codex-rules-layout` 56rem breakpoint
// (`globals.css`'s own "no new breakpoint system" rule).

import type { ReactElement, ReactNode } from "react";

import type { ClassRailData, ClassRailRow } from "@/server/classPageData";

/** A rail row's own href — carries the CURRENT `superseded` state forward
 * (D29-48/M7's own site convention: "every row's own href carries it once
 * the view is widened") so following a rail link between two class pages
 * doesn't silently collapse the reveal. */
function railRowHref(row: ClassRailRow, superseded: boolean): string {
  return superseded ? `/${row.id}?superseded=1` : `/${row.id}`;
}

function ClassRailLink({
  row,
  current,
  superseded,
}: {
  row: ClassRailRow;
  current: boolean;
  superseded: boolean;
}): ReactElement {
  return (
    <a
      href={railRowHref(row, superseded)}
      className={
        current ? "codex-class-rail-link codex-class-rail-link-current" : "codex-class-rail-link"
      }
      aria-current={current ? "page" : undefined}
    >
      {row.name}
      {row.edition === "legacy" ? (
        <span className="codex-class-rail-edition"> (Legacy)</span>
      ) : null}
    </a>
  );
}

export function ClassBrowse({
  rail,
  currentId,
  superseded,
  /** The current page's own path (`/class` or `/class/{slug}`, WITHOUT any
   * query string) — used only to build the superseded-reveal toggle's own
   * href, so it stays on whichever page is currently open. */
  basePath,
  children,
}: {
  rail: ClassRailData;
  currentId?: string;
  superseded: boolean;
  basePath: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="codex-class-browse">
      {/* P12 S3 — the `RulesLayout.tsx` disclosure mechanism verbatim: NO
          `open` attribute (collapsed-by-default markup), desktop shows the
          rail regardless via unconditional CSS, only the mobile media query
          gates on `[open]` — zero JS breakpoint logic, an uncontrolled DOM
          attribute, no hydration risk. */}
      <details className="codex-class-rail-disclosure">
        <summary className="codex-class-rail-summary">Classes</summary>
        <nav className="codex-class-rail" aria-label="Classes">
          <ul className="codex-class-rail-list">
            {rail.visible.map((row) => (
              <li key={row.id}>
                <ClassRailLink row={row} current={row.id === currentId} superseded={superseded} />
              </li>
            ))}
            {superseded
              ? rail.hidden.map((row) => (
                  <li key={row.id}>
                    <ClassRailLink
                      row={row}
                      current={row.id === currentId}
                      superseded={superseded}
                    />
                  </li>
                ))
              : null}
          </ul>
          {/* D29-118 — the site-convention `?superseded=1` reveal (the `/rules`/
              `$category/` precedent's own toggle microcopy), scoped to the ≤49
              rail rows (no virtualization, no pagination — spec's own text). */}
          {rail.hidden.length > 0 ? (
            <a
              className="codex-class-rail-toggle"
              href={superseded ? basePath : `${basePath}?superseded=1`}
            >
              {superseded
                ? "Hide superseded ←"
                : `Show ${rail.hidden.length} hidden (superseded) →`}
            </a>
          ) : null}
        </nav>
      </details>
      <div className="codex-class-pane">{children}</div>
    </div>
  );
}
