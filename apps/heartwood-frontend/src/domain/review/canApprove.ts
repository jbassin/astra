// The Approve gate predicate (FO-5/FO-10). Pure + extracted so it's unit-testable
// without mounting DecisionFooter/ProposalCard (neither has component-level coverage).
// Approve requires ALL of: placement resolved (creates only — a create can't land in
// needs-placement/), the debounced editor write PERSISTED to disk rather than merely
// buffered (FO-5's B2 race guard — `decide()` must only ever run against a body that's
// actually on disk, since `apply.py` copies the proposal `.vellum` bytes verbatim), and
// real authored content: a create needs a non-empty body once frontmatter is stripped
// (the skeleton alone doesn't count); a rewrite needs the buffer to differ from the live
// corpus page (nothing changed = nothing to apply).
//
// Frontmatter stripping reuses @astra/vellum-lang's `splitFrontmatter` (total, never
// throws) rather than hand-rolling a YAML-block regex.

import { splitFrontmatter } from "@astra/vellum-lang";

export interface CanApproveInput {
  op: "create" | "rewrite";
  /** True while a create's target-path still needs the human to place it. */
  needsPlacement: boolean;
  /** True once the live editor buffer's last write has landed on disk (not mid-debounce/failed). */
  savePersisted: boolean;
  /** The live editor buffer (post-any-edits). */
  source: string;
  /** The live corpus page body, or null for a create (no corpus page exists yet). */
  corpusBody: string | null;
}

export function canApprove({
  op,
  needsPlacement,
  savePersisted,
  source,
  corpusBody,
}: CanApproveInput): boolean {
  if (needsPlacement || !savePersisted) return false;
  if (op === "create") return splitFrontmatter(source).body.trim().length > 0;
  return source !== (corpusBody ?? "");
}
