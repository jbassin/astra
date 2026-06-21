/**
 * The akasha-backend build-time snapshot — the data contract akasha-frontend consumes
 * (Decision D). Shape mirrors `apps/akasha-backend/src/astra_akasha_backend/snapshot.py`
 * (`build_snapshot`): the metadata JSON `{pages, edges, unresolved}`. The vellum bodies
 * live in the `.vellum` corpus (rendered in a later slice), NOT here.
 *
 * Parse → validate at the edge (KDL-at-the-edges principle, applied to JSON): we read
 * the committed `akasha-snapshot.json` and hand typed records to site.ts.
 */
import { readFileSync } from "node:fs";

/** Frontmatter as akasha-backend's `Frontmatter.model_dump()` emits it (all keys present). */
export interface SnapshotFrontmatter {
  title: string | null;
  tags: string[];
  aliases: string[];
  img: string | null;
  extra: Record<string, unknown>;
}

/** A `[[target#heading|alias]]` reference on a page, as-authored (unresolved). */
export interface SnapshotCrossRef {
  target: string;
  alias: string | null;
  heading: string | null;
}

/** One page record: path (no `.vellum` ext), baked git date, frontmatter, crossrefs. */
export interface SnapshotPage {
  path: string;
  date: string | null;
  frontmatter: SnapshotFrontmatter;
  crossrefs: SnapshotCrossRef[];
}

/**
 * A resolved page→page edge. `resolved` is the destination **page-path** (Quartz
 * "shortest" applied to paths, done in Python), or null for a dangling target. Turning
 * the page-path into a slug/URL is akasha-frontend's job (N6 — we consume these edges
 * rather than re-deriving them in TS; the snapshot's edge set is the parity-gated SSOT).
 */
export interface SnapshotEdge {
  source: string;
  target: string;
  resolved: string | null;
  heading: string | null;
  alias: string | null;
}

export interface Snapshot {
  pages: SnapshotPage[];
  edges: SnapshotEdge[];
  unresolved: { source: string; target: string }[];
}

/** Read + parse the committed snapshot JSON. */
export function loadSnapshot(path: string): Snapshot {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  if (!Array.isArray(raw.pages) || !Array.isArray(raw.edges)) {
    throw new Error(`malformed akasha snapshot at ${path}: missing pages/edges`);
  }
  return raw;
}
