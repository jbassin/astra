// The write server fn for in-browser edits (P4.5): the human's edit overwrites the
// proposal's staged `.vellum` (the draft buffer), so review.kdl stays metadata-only and
// `just heartwood-apply` later copies the edited body to the corpus. Server-side only
// (the node:fs seam is stripped from the client bundle). No auth (D5) — the dangerous
// write-BACK is host-gated; this only touches the staged proposals/ mount, traversal-
// guarded both by the id-slug shape and fs.ts's `within`.

import { createServerFn } from "@tanstack/react-start";
import { writeProposalBody as writeBodyFile } from "@/domain/review/fs";

/** Proposal ids are slugs (slugify(target_path)) — no slash/dot, so no path traversal. */
const ID_RE = /^[a-z0-9-]+$/;
const MAX_BODY_BYTES = 256 * 1024;

export interface WriteBodyInput {
  date: string;
  id: string;
  source: string;
}

export type WriteResult = { ok: true } | { ok: false; error: string };

/** Pure validation (testable): the date + id shape + a size cap. */
export function validateWrite(input: WriteBodyInput): WriteResult {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(input.date)) return { ok: false, error: "bad date" };
  if (!ID_RE.test(input.id)) return { ok: false, error: "bad proposal id" };
  if (Buffer.byteLength(input.source, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, error: "body too large" };
  }
  return { ok: true };
}

export const writeProposalBody = createServerFn({ method: "POST" })
  .validator((input: WriteBodyInput) => input)
  .handler(({ data }): WriteResult => {
    const v = validateWrite(data);
    if (!v.ok) return v;
    writeBodyFile(data.date, `${data.id}.vellum`, data.source);
    return { ok: true };
  });
