import type { ReactElement } from "react";

import type { Source } from "../../schema/entity";

/**
 * D29-26 — the source citation line: book + page + a license badge. License
 * `unknown` -> the badge is OMITTED (not a "License: unknown" line); book
 * `"unknown"` -> the WHOLE line is omitted (fail-soft, spec D29-26).
 */
export function Citation({ source }: { source: Source }): ReactElement | null {
  if (source.book === "unknown") return null;
  return (
    <div className="codex-citation">
      <span className="codex-citation-book">{source.book}</span>
      {source.page !== undefined ? (
        <span className="codex-citation-page"> pg. {source.page}</span>
      ) : null}
      {source.license !== "unknown" ? (
        <span className={`codex-license-badge codex-license-${source.license.toLowerCase()}`}>
          {source.license}
        </span>
      ) : null}
    </div>
  );
}
