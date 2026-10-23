import type { ReactElement } from "react";

import { traitBucket, type TraitBucket } from "./traitBucket";

const BUCKET_CLASS: Record<TraitBucket, string> = {
  purple: "codex-ui-pill-purple",
  umber: "codex-ui-pill-umber",
  amber: "codex-ui-pill-amber",
};

/**
 * D29-46 — codex's own PF2e-style trait pill, EXACT prop-signature parity
 * with the gothic lib's `TraitPill`. Visual only — the name is rendered
 * verbatim; the fill color is derived from the name via the 3-bucket scheme
 * in `./traitBucket.ts`.
 */
export function TraitPill({ name }: { name: string }): ReactElement {
  return <span className={`codex-ui-pill ${BUCKET_CLASS[traitBucket(name)]}`}>{name}</span>;
}
