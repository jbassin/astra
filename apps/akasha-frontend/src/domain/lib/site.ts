/**
 * Build-time site index — lifted from faerrin `aether/src/lib/site.ts`, adapted to the
 * akasha snapshot (Decision D / 0011). The index logic (slugs, backlinks, folder/tag/
 * breadcrumb/Explorer derivation) is faithful to Quartz via the shared `slug.ts`; only
 * the INPUT changed:
 *   - source = the akasha snapshot (`{pages, edges}`), not an Astro content collection;
 *   - outgoing edges are CONSUMED from the snapshot's parity-gated `edges` (N6), not
 *     re-extracted from page bodies (the snapshot resolution is the SSOT);
 *   - `gitModifiedDates()` is gone — dates are pre-baked into the snapshot (0007 M3, N4);
 *   - the Astro `entry`/`render()` coupling is dropped (vellum renders via gothic later).
 *
 * Pure (no fs): `buildSite(snapshot)` is total + unit-testable; the build-content script
 * loads the snapshot and feeds it here.
 */
import { folderIndexName } from "./folderIndex";
import {
  type FilePath,
  type FullSlug,
  type RelativeURL,
  resolveRelative,
  type SimpleSlug,
  simplifySlug,
  slugifyFilePath,
} from "./slug";
import type { Snapshot, SnapshotPage } from "./snapshot";

export interface SiteDoc {
  /** content-relative path WITH .md (faerrin parity), e.g. "Divinity/Inner Gods.md" */
  rel: string;
  slug: FullSlug;
  simple: SimpleSlug;
  title: string;
  tags: string[];
  aliases: string[];
  img?: string;
  /** resolved outgoing internal edges (deduped, normalized SimpleSlugs) — from the snapshot */
  links: SimpleSlug[];
  /** baked git "modified" date (snapshot frontmatter, committer date — N4), if any */
  date?: Date;
}

/** Pure basename-without-`.md` (was `path.basename(rel, ".md")`). Kept node-free so
 *  this whole module is safe to import from the SSR/client runtime, not just the
 *  build (`runtimeSite.ts` reconstructs SiteData from the generated pages). */
function baseStem(rel: string): string {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -".md".length) : base;
}

// ── the index ──────────────────────────────────────────────────────────────────
export interface SiteData {
  docs: SiteDoc[];
  bySlug: Map<FullSlug, SiteDoc>;
  allSlugs: FullSlug[];
  /** simplified-slug -> docs that link TO it (Quartz backlink semantics) */
  backlinks: Map<SimpleSlug, SiteDoc[]>;
}

/**
 * Build the site index from the akasha snapshot. The faerrin equivalent was an async
 * `build()` over `getCollection("docs")`; here it's a pure function of the snapshot.
 */
export function buildSite(snapshot: Snapshot): SiteData {
  const pages = snapshot.pages;
  // faerrin's `rel` was the content-relative path WITH .md; the snapshot stores paths
  // WITHOUT the extension, so append it — slugifyFilePath + basename then behave byte-
  // identically to faerrin (the extension is stripped right back off).
  const relOf = (p: SnapshotPage): string => `${p.path}.md`;

  // pass 1: slugs (the allSlugs set, kept for parity with the lifted resolvers)
  const allSlugs = pages.map((p) => slugifyFilePath(relOf(p) as FilePath));

  // edges (N6): group the snapshot's resolved page→page edges by source, mapped to the
  // SimpleSlug form faerrin's `links` used (simplifySlug∘slugifyFilePath of the dest).
  const edgesBySource = new Map<string, Set<SimpleSlug>>();
  for (const e of snapshot.edges) {
    if (e.resolved == null) continue;
    const dest = simplifySlug(slugifyFilePath(`${e.resolved}.md` as FilePath));
    const set = edgesBySource.get(e.source) ?? new Set<SimpleSlug>();
    set.add(dest);
    edgesBySource.set(e.source, set);
  }

  // pass 2: build docs
  const docs: SiteDoc[] = pages.map((p, i) => {
    const rel = relOf(p);
    const slug = allSlugs[i] as FullSlug; // same length as pages (strict index access)
    const fm = p.frontmatter;
    // Title fallback matches Quartz's FrontMatter transformer: file.stem — filename
    // without extension, spaces/case PRESERVED. Folder index pages fall back to their
    // parent directory name (and pick it up as an implicit alias below).
    const stem = baseStem(rel);
    const folderName = folderIndexName(rel);
    return {
      rel,
      slug,
      simple: simplifySlug(slug),
      title: fm.title ?? folderName ?? stem,
      tags: fm.tags,
      aliases: [...new Set([...fm.aliases, ...(folderName ? [folderName] : [])])],
      img: fm.img ?? undefined,
      links: [...(edgesBySource.get(p.path) ?? [])],
      date: p.date ? new Date(p.date) : undefined,
    };
  });

  return indexDocs(docs);
}

/**
 * Build the queryable index ({@link SiteData}) from a ready list of {@link SiteDoc}.
 * Shared by `buildSite` (build-time, from the snapshot) and `runtimeSite.ts`
 * (runtime, from the generated `PAGES`) so the backlink/lookup semantics have a
 * single source of truth.
 */
export function indexDocs(docs: SiteDoc[]): SiteData {
  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  const allSlugs = docs.map((d) => d.slug);

  // reverse backlink index. Quartz's Backlinks does an EXACT
  // `file.links.includes(simplifySlug(fileData.slug))`, so we key by the resolved edge
  // form verbatim (no trailing-slash normalization), faithfully reproducing Quartz.
  const backlinks = new Map<SimpleSlug, SiteDoc[]>();
  for (const d of docs) {
    for (const target of d.links) {
      const list = backlinks.get(target) ?? [];
      list.push(d);
      backlinks.set(target, list);
    }
  }

  return { docs, bySlug, allSlugs, backlinks };
}

export function backlinksFor(site: SiteData, slug: FullSlug): SiteDoc[] {
  // Exact match on simplifySlug(slug), mirroring Quartz's file.links.includes(...).
  return site.backlinks.get(simplifySlug(slug)) ?? [];
}

// ── breadcrumbs ─────────────────────────────────────────────────────────────────
export interface Crumb {
  displayName: string;
  path: RelativeURL | "";
}

/**
 * Quartz Breadcrumbs: Home ❯ …folders… ❯ current. A folder crumb's display name is the
 * folder index page's title when present, else the dash→space folder segment. Index
 * pages collapse onto their folder. The current crumb has an empty path. Every name gets
 * `replaceAll("-", " ")` exactly as formatCrumb does.
 */
export function breadcrumbsFor(
  site: SiteData,
  slug: FullSlug,
  currentTitle: string,
  rootName = "Home",
): Crumb[] {
  let parts = slug.split("/");
  if (parts.at(-1) === "index") parts = parts.slice(0, -1); // folder index → folder

  const crumbs: Crumb[] = [
    { displayName: rootName, path: parts.length ? resolveRelative(slug, "/" as SimpleSlug) : "" },
  ];

  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const prefix = parts.slice(0, i + 1).join("/");
    let displayName: string;
    if (isLast) {
      displayName = currentTitle;
    } else {
      const folderIndex = site.bySlug.get(`${prefix}/index` as FullSlug);
      displayName = folderIndex?.title ?? parts[i] ?? "";
    }
    const targetSimple = (isLast ? simplifySlug(slug) : `${prefix}/`) as SimpleSlug;
    crumbs.push({
      displayName: displayName.replaceAll("-", " "),
      path: isLast ? "" : resolveRelative(slug, targetSimple),
    });
  }
  return crumbs;
}

// ── folders & tags (for list pages) ─────────────────────────────────────────────
export interface PageEntry {
  slug: FullSlug;
  title: string;
  tags: string[];
  date?: Date;
  isFolder: boolean;
}

function dirnameSlug(slug: string): string {
  const i = slug.lastIndexOf("/");
  return i === -1 ? "." : slug.slice(0, i);
}

/**
 * Every folder that should get a listing page, matching Quartz FolderPage's
 * `_getFolders`: the dirname chain of every page, excluding the root "." and the
 * synthetic "tags" namespace. Returned as SimpleSlugs (no trailing /index).
 */
export function allFolders(site: SiteData): string[] {
  const folders = new Set<string>();
  for (const d of site.docs) {
    let f = dirnameSlug(d.slug);
    while (f !== ".") {
      if (f && f !== "tags") folders.add(f);
      f = dirnameSlug(f);
    }
  }
  return [...folders].sort();
}

/** Folder page title: the index page title if present, else "Folder: <slug>". */
export function folderTitle(site: SiteData, folderSlug: string): string {
  const idx = site.bySlug.get(`${folderSlug}/index` as FullSlug);
  return idx?.title ?? `Folder: ${folderSlug}`;
}

/**
 * Direct children of a folder, matching Quartz FolderContent (trie children): files
 * directly in the folder + immediate subfolders (one entry each). A subfolder with an
 * index page is listed via that page; otherwise it gets a synthetic entry named from the
 * folder segment with the most-recent descendant date. The folder's own index is not
 * listed as a child.
 */
export function listFolderChildren(site: SiteData, folderSlug: string): PageEntry[] {
  const out: PageEntry[] = [];
  const seenSub = new Set<string>();
  const prefix = `${folderSlug}/`;

  for (const d of site.docs) {
    const dir = dirnameSlug(d.slug);
    if (dir === folderSlug) {
      if (d.slug === `${folderSlug}/index`) continue; // the folder itself
      out.push({ slug: d.slug, title: d.title, tags: d.tags, date: d.date, isFolder: false });
    } else if (d.slug.startsWith(prefix)) {
      const immediate = d.slug.slice(prefix.length).split("/")[0] ?? "";
      const subSlug = `${folderSlug}/${immediate}`;
      if (seenSub.has(subSlug)) continue;
      seenSub.add(subSlug);
      const idx = site.bySlug.get(`${subSlug}/index` as FullSlug);
      if (idx) {
        out.push({
          slug: idx.slug,
          title: idx.title,
          tags: idx.tags,
          date: idx.date,
          isFolder: true,
        });
      } else {
        // most-recent date among descendants of this subfolder
        let date: Date | undefined;
        for (const e of site.docs) {
          if (e.slug.startsWith(`${subSlug}/`) && e.date && (!date || e.date > date)) date = e.date;
        }
        out.push({
          slug: subSlug as FullSlug,
          title: immediate.replaceAll("-", " "),
          tags: [],
          date,
          isFolder: true,
        });
      }
    }
  }
  return sortEntries(out);
}

/** Ports PageList byDateAndAlphabeticalFolderFirst: folders first, then date desc, then title. */
export function sortEntries(entries: PageEntry[]): PageEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    if (a.date && b.date) return b.date.getTime() - a.date.getTime();
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });
}

/** ["a/b/c"] -> ["a","a/b","a/b/c"] (Quartz getAllSegmentPrefixes). */
export function getAllSegmentPrefixes(tag: string): string[] {
  const segments = tag.split("/");
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

/** All tags (with hierarchical prefixes), sorted. */
export function allTags(site: SiteData): string[] {
  const tags = new Set<string>();
  for (const d of site.docs)
    for (const t of d.tags) for (const p of getAllSegmentPrefixes(t)) tags.add(p);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** Pages carrying a tag (or a parent of it), as sorted PageEntries. */
export function pagesWithTag(site: SiteData, tag: string): PageEntry[] {
  const entries = site.docs
    .filter((d) => d.tags.flatMap(getAllSegmentPrefixes).includes(tag))
    .map((d) => ({ slug: d.slug, title: d.title, tags: d.tags, date: d.date, isFolder: false }));
  return sortEntries(entries);
}

// ── Explorer tree (build-time) ──────────────────────────────────────────────────
export interface TreeNode {
  slug: FullSlug;
  displayName: string;
  isFolder: boolean;
  children: TreeNode[];
  // Optional pre-resolved href (used by injected non-wiki nodes like the chronicle
  // subtree, whose links are absolute /chronicle/... paths, not Quartz resolveRelative
  // targets). Wiki nodes omit it and fall back to resolveRelative(currentSlug, slug).
  href?: string;
}

/**
 * Build the Explorer file tree at build time. A folder with an index page takes that
 * page's title as its display name; the "tags" namespace and the home page are excluded.
 * Sorted folders-first then alphabetical (numeric, case-insensitive), matching Quartz's
 * Explorer defaultOptions.sortFn.
 */
export function buildExplorerTree(site: SiteData): TreeNode[] {
  const root: TreeNode = { slug: "" as FullSlug, displayName: "", isFolder: true, children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);

  const ensureFolder = (folderPath: string): TreeNode => {
    const existing = folders.get(folderPath);
    if (existing) return existing;
    const cut = folderPath.lastIndexOf("/");
    const parent = ensureFolder(cut === -1 ? "" : folderPath.slice(0, cut));
    const seg = cut === -1 ? folderPath : folderPath.slice(cut + 1);
    const node: TreeNode = {
      slug: folderPath as FullSlug,
      displayName: seg.replaceAll("-", " "),
      isFolder: true,
      children: [],
    };
    parent.children.push(node);
    folders.set(folderPath, node);
    return node;
  };

  for (const d of site.docs) {
    if (d.slug === "index" || d.slug.startsWith("tags/")) continue;
    if (d.slug.endsWith("/index")) {
      ensureFolder(d.slug.slice(0, -"/index".length)).displayName = d.title;
    } else {
      const cut = d.slug.lastIndexOf("/");
      const parent = ensureFolder(cut === -1 ? "" : d.slug.slice(0, cut));
      parent.children.push({ slug: d.slug, displayName: d.title, isFolder: false, children: [] });
    }
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    for (const n of nodes) if (n.isFolder) sortRec(n.children);
  };
  sortRec(root.children);
  return root.children;
}

// ── alias redirects (build-time) ─────────────────────────────────────────────────
export interface AliasRedirect {
  /** the alias's own slug (where the redirect stub lives), e.g. "the-city" */
  slug: FullSlug;
  /** relative URL to the canonical page (Quartz resolveRelative) */
  redirUrl: RelativeURL;
  /** canonical page's simplified slug (the redirect target, shown as <title>) */
  ogSlug: SimpleSlug;
}

/**
 * Ports faerrin `[...slug].astro` getStaticPaths' AliasRedirects: each page's
 * `aliases` (frontmatter + the implicit folder-index alias, already merged into
 * `SiteDoc.aliases`) maps to a redirect stub at `slugifyFilePath(alias + ".md")`
 * pointing at the owning page. A real content/folder page wins over an alias of the
 * same slug (ContentPage overwrites AliasRedirects in Quartz's emitter order), so
 * those are skipped; first alias wins on intra-alias collisions.
 */
export function buildAliases(site: SiteData): AliasRedirect[] {
  const taken = new Set<string>();
  for (const d of site.docs) {
    if (d.slug === "index" || !d.slug.endsWith("/index")) taken.add(d.slug); // content pages
  }
  for (const f of allFolders(site)) taken.add(`${f}/index`); // folder listing pages

  const seen = new Set<string>();
  const out: AliasRedirect[] = [];
  for (const d of site.docs) {
    const ogSlug = simplifySlug(d.slug);
    for (const alias of d.aliases) {
      const aSlug = slugifyFilePath(`${alias}.md` as FilePath);
      if (taken.has(aSlug) || seen.has(aSlug)) continue;
      seen.add(aSlug);
      out.push({ slug: aSlug, redirUrl: resolveRelative(aSlug, ogSlug), ogSlug });
    }
  }
  return out;
}
