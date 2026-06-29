// Server-only filesystem seam for the review surface. Heartwood reads its content at
// RUNTIME from the narrow Compose bind-mounts (P4.7) — the staged proposals (rw) and
// the akasha corpus + snapshot (ro) — rather than baking it into the image. All reads
// are traversal-guarded to their mount root. Import ONLY from server fns (the
// createServerFn boundary strips node:fs from the client bundle).

import fs from "node:fs";
import path from "node:path";

// At runtime `bun run server.ts` runs with cwd = the app dir
// (/repo/apps/heartwood-frontend in the container; the app dir on the host dev box),
// so the repo root — where the bind-mounts land (/repo/apps/...) — is two levels up.
const REPO_ROOT = path.resolve(process.cwd(), "../..");
export const PROPOSALS_DIR = path.join(REPO_ROOT, "apps/heartwood-backend/proposals");
export const CONTENT_DIR = path.join(REPO_ROOT, "apps/akasha-backend/content");
export const SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  "apps/akasha-backend/snapshot/akasha-snapshot.json",
);

/** Resolve `rel` under `root`, refusing any path that escapes it (strider `within`). */
function within(root: string, rel: string): string {
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`path escapes its root: ${rel}`);
  }
  return target;
}

/** Date dirs under proposals/ that carry a manifest.kdl, newest first. */
export function listSessionDates(): string[] {
  if (!fs.existsSync(PROPOSALS_DIR)) return [];
  return fs
    .readdirSync(PROPOSALS_DIR, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && fs.existsSync(path.join(PROPOSALS_DIR, d.name, "manifest.kdl")),
    )
    .map((d) => d.name)
    .sort()
    .reverse();
}

export function readManifestText(date: string): string {
  const dir = within(PROPOSALS_DIR, date);
  return fs.readFileSync(path.join(dir, "manifest.kdl"), "utf8");
}

/** A proposal's staged `.vellum` body (the editable draft buffer, P4.5). */
export function readProposalBody(date: string, bodyFile: string): string {
  const file = within(within(PROPOSALS_DIR, date), bodyFile);
  return fs.readFileSync(file, "utf8");
}

/** The CURRENT akasha corpus body for a page path (for the rewrite diff); null if absent. */
export function readCorpusBody(targetPath: string): string | null {
  const file = within(CONTENT_DIR, `${targetPath}.vellum`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** The akasha page-path set from the committed snapshot (for live broken_wikilink checks). */
export function readKnownPages(): string[] {
  if (!fs.existsSync(SNAPSHOT_PATH)) return [];
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as {
    pages?: { path: string }[];
  };
  return (snap.pages ?? []).map((p) => p.path);
}

/**
 * Overwrite a proposal's staged `.vellum` body with the human's edit (P4.5 — the
 * proposal IS the draft buffer). Atomic temp+rename; the `proposals/` mount is rw
 * and host-owned (user 1000:1000), so the rename lands a host-owned file the apply
 * recipe can later git-commit.
 */
export function writeProposalBody(date: string, bodyFile: string, source: string): void {
  const file = within(within(PROPOSALS_DIR, date), bodyFile);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, source, "utf8");
  fs.renameSync(tmp, file);
}
