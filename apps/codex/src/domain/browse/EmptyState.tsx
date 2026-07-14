import { Button } from "@astra/gothic";
import type { ReactElement } from "react";

/**
 * D29-35 adversarial M6 — a filtered-to-zero listing/search result: an
 * explicit message plus a one-click "clear filters" affordance. Built once
 * here, reusable (spec's own words: "same component serves `/search`",
 * D29-36's S4 route imports this unchanged).
 */
export function BrowseEmptyState({
  onClearFilters,
  noun = "entries",
}: {
  onClearFilters: () => void;
  noun?: string;
}): ReactElement {
  return (
    <div className="codex-empty-state">
      <p>No {noun} match the current filters.</p>
      <Button type="button" variant="solid" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
