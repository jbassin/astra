/**
 * Folder-index naming: a folder index page (`.../Foo/index`) inherits its title and
 * an implicit alias from its parent directory name, so the directory name need not be
 * duplicated in every index page's frontmatter.
 *
 * Lifted verbatim from faerrin `content/scripts/lib/folder-index.ts` — the single
 * source of truth for deriving a folder page's title/alias from its path.
 *
 * @param rel content-relative path with extension, e.g. "Divinity/index.md".
 * @returns the parent directory name (e.g. "Divinity"), or null for non-index pages
 *   and for the root `index.md` (which has no parent folder).
 */
export function folderIndexName(rel: string): string | null {
  const parts = rel.split("/");
  if (parts[parts.length - 1] !== "index.md") return null;
  if (parts.length < 2) return null; // root index.md — no parent folder
  return parts[parts.length - 2] ?? null;
}
