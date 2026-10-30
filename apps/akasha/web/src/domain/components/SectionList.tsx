// One row per section (hue dot, label, page count), in header order. The left rail shows it
// on pages outside every section (home, tags); the phone menu shows it with the current
// section's excerpt (`expanded`) open under its row.
import type { ReactNode } from "react";

import { SECTIONS, type SectionCounts, type SectionId } from "@/domain/lib/sections";

export function SectionList({
  variant,
  counts,
  current = null,
  expanded = null,
}: {
  variant: "rail" | "menu";
  counts: SectionCounts | null;
  current?: SectionId | null;
  /** Rendered under the current section's row. */
  expanded?: ReactNode;
}) {
  return (
    <nav className={`ak-sections ak-sections-${variant}`} aria-label="Sections">
      <ul>
        {SECTIONS.map((s) => {
          const isCurrent = s.id === current;
          const count = s.id === "timeline" ? null : (counts?.[s.id] ?? null);
          return (
            <li key={s.id} style={{ "--hue": s.hue }}>
              <a
                href={s.href}
                className={isCurrent ? "ak-section-row is-current" : "ak-section-row"}
                aria-current={isCurrent ? "true" : undefined}
              >
                <span className="ak-dot" aria-hidden="true" />
                <span className="ak-section-label">{s.label}</span>
                {count !== null && <span className="ak-count">{count}</span>}
              </a>
              {isCurrent && expanded}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
