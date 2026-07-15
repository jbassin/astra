// P4 S3 (D29-41) — the rules entity-page previous/next pager. `prev`/`next`
// are already the DFS-derived, book-turn-order targets `entityPageData.ts`'s
// `resolveRulesNav` computed server-side (descends into a chaptered node's
// subtree, symmetric, never crosses a book, one-sided at the ends) — this
// component only renders two links. A superseded target still renders (the
// legacy toggle does NOT re-chain the pager, D29-41) with its own "Legacy"
// pill, the same `codex-edition-pill` convention `EditionPill`/`RulesTree`'s
// node rows already use.

import type { ReactElement } from "react";

import type { RulesPagerTarget } from "@/server/entityPageData";

function PagerLink({
  target,
  direction,
}: {
  target: RulesPagerTarget;
  direction: "prev" | "next";
}): ReactElement {
  return (
    <a href={`/${target.id}`} className={`codex-rules-pager-link codex-rules-pager-${direction}`}>
      <span className="codex-rules-pager-label">
        {direction === "prev" ? "← Previous" : "Next →"}
      </span>
      <span className="codex-rules-pager-name">{target.name}</span>
      {target.superseded === true ? (
        <span className="codex-edition-pill codex-edition-legacy">Legacy</span>
      ) : null}
    </a>
  );
}

export function ReadingOrderPager({
  prev,
  next,
}: {
  prev?: RulesPagerTarget;
  next?: RulesPagerTarget;
}): ReactElement | null {
  // Both ends of a single-doc book are one-sided at once (D29-41's "book
  // head/tail renders one-sided") — nothing to render at all in that case.
  if (!prev && !next) return null;
  return (
    <nav className="codex-rules-pager" aria-label="Rules pager">
      <div className="codex-rules-pager-slot codex-rules-pager-slot-prev">
        {prev !== undefined ? <PagerLink target={prev} direction="prev" /> : null}
      </div>
      <div className="codex-rules-pager-slot codex-rules-pager-slot-next">
        {next !== undefined ? <PagerLink target={next} direction="next" /> : null}
      </div>
    </nav>
  );
}
