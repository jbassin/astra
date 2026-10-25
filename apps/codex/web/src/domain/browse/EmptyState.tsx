import type { ReactElement } from "react";

import { Button } from "@/ui";

/**
 * A filtered-to-zero listing or search result: an explicit message plus a
 * one-click "clear filters" affordance. The `/search` route reuses this
 * component unchanged.
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
