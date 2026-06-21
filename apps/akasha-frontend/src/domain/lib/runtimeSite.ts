/**
 * Runtime site index — the SSR/client-safe view layer over the generated module.
 *
 * The generated `src/generated/site.ts` bakes the snapshot-derived PAGES (+ aliases,
 * Explorer tree, tag/folder lists). Here we reconstruct a queryable {@link SiteData}
 * from PAGES (reusing site.ts's `indexDocs`, so the backlink/lookup semantics are the
 * SAME ones the build used) and expose serializable *view models* that the route
 * loaders return. Components stay dumb: every href is pre-resolved here via the lifted
 * `resolveRelative`, and dates are ISO strings (formatted deterministically in the UI).
 *
 * This module imports only node-free code (site.ts is now node-free), so it is safe in
 * both the SSR server bundle and the client bundle (TanStack re-runs loaders on client
 * navigation).
 */
import { ALIASES, type GeneratedPage, PAGES, SITE } from "@/generated/site";
import {
  allFolders,
  allTags,
  backlinksFor,
  breadcrumbsFor,
  type Crumb,
  folderTitle,
  indexDocs,
  listFolderChildren,
  type PageEntry,
  pagesWithTag,
  type SiteData,
  type SiteDoc,
} from "./site";
import { type FullSlug, resolveRelative, type SimpleSlug } from "./slug";

export { SITE };

// ── reconstruct the queryable index from the generated pages ──────────────────────
function reconstruct(pages: GeneratedPage[]): SiteData {
  const docs: SiteDoc[] = pages.map((p) => ({
    rel: p.rel,
    slug: p.slug as FullSlug,
    simple: p.simple as SimpleSlug,
    title: p.title,
    tags: p.tags,
    aliases: p.aliases,
    img: p.img,
    links: p.links as SimpleSlug[],
    date: p.date ? new Date(p.date) : undefined,
  }));
  return indexDocs(docs);
}

const SITE_DATA = reconstruct(PAGES);
const FOLDER_SET = new Set(allFolders(SITE_DATA));
const ALIAS_BY_SLUG = new Map(ALIASES.map((a) => [a.slug, a]));

// ── serializable view models (what loaders return) ────────────────────────────────
export interface LinkView {
  label: string;
  href: string;
}

export interface PageEntryView {
  title: string;
  href: string;
  tags: LinkView[];
  date?: string;
  isFolder: boolean;
}

export interface ContentView {
  slug: string;
  title: string;
  tags: LinkView[];
  img?: string;
  /** the page's baked committer date (ISO), if any */
  date?: string;
  showBreadcrumbs: boolean;
  crumbs: Crumb[];
  backlinks: LinkView[];
}

export interface FolderView {
  slug: string;
  folder: string;
  title: string;
  crumbs: Crumb[];
  /** the folder's own index doc, if it has one (its vellum body renders in slice 4) */
  hasIndexBody: boolean;
  itemsLabel: string;
  entries: PageEntryView[];
}

export interface TagView {
  slug: string;
  title: string;
  itemsLabel: string;
  entries: PageEntryView[];
}

export interface TagIndexView {
  slug: string;
  title: string;
  totalLabel: string;
  sections: { tag: string; href: string; entries: PageEntryView[]; overflow: number }[];
}

// ── href helpers (Quartz resolveRelative, relative to the current page's slug) ─────
const tagsLink = (current: FullSlug, tag: string): LinkView => ({
  label: tag,
  href: resolveRelative(current, `tags/${tag}` as SimpleSlug),
});

function entryView(current: FullSlug, e: PageEntry): PageEntryView {
  return {
    title: e.title,
    href: resolveRelative(current, e.slug),
    tags: e.tags.map((t) => tagsLink(current, t)),
    date: e.date?.toISOString(),
    isFolder: e.isFolder,
  };
}

// ── resolver: URL path → page kind ────────────────────────────────────────────────
export type Resolved =
  | { kind: "content"; slug: FullSlug }
  | { kind: "folder"; folder: string }
  | { kind: "alias"; redirUrl: string; ogSlug: string };

/**
 * Map a request path to a page (mirrors faerrin's catch-all `[...slug].astro`):
 * content page, folder listing (`Foo` or `Foo/index`, both served by the folder
 * page — Astro's `format:"file"` emits `Foo/index.html`), or an alias redirect.
 * Returns null for an unknown path (→ 404).
 */
export function resolvePath(rawPath: string): Resolved | null {
  let norm: string;
  try {
    norm = decodeURIComponent(rawPath);
  } catch {
    norm = rawPath;
  }
  norm = norm.replace(/^\/+|\/+$/g, "");
  const slug = norm === "" ? "index" : norm;

  // content page (the root index, or any non-folder-index page)
  const doc = SITE_DATA.bySlug.get(slug as FullSlug);
  if (doc && (slug === "index" || !slug.endsWith("/index"))) {
    return { kind: "content", slug: slug as FullSlug };
  }
  // folder listing — reached as `Foo` …
  if (FOLDER_SET.has(slug)) return { kind: "folder", folder: slug };
  // … or directly as `Foo/index`
  if (slug.endsWith("/index")) {
    const folder = slug.slice(0, -"/index".length);
    if (FOLDER_SET.has(folder)) return { kind: "folder", folder };
  }
  // alias redirect stub
  const alias = ALIAS_BY_SLUG.get(slug);
  if (alias) return { kind: "alias", redirUrl: alias.redirUrl, ogSlug: alias.ogSlug };

  return null;
}

// ── view builders ─────────────────────────────────────────────────────────────────
export function contentView(slug: FullSlug): ContentView {
  const doc = SITE_DATA.bySlug.get(slug);
  if (!doc) throw new Error(`no content doc for slug ${slug}`);
  const backlinks = backlinksFor(SITE_DATA, slug)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((f) => ({ label: f.title, href: resolveRelative(slug, f.slug) }));
  return {
    slug,
    title: doc.title,
    tags: doc.tags.map((t) => tagsLink(slug, t)),
    img: doc.img,
    date: doc.date?.toISOString(),
    showBreadcrumbs: slug !== "index",
    crumbs: breadcrumbsFor(SITE_DATA, slug, doc.title),
    backlinks,
  };
}

export function folderView(folder: string): FolderView {
  const slug = `${folder}/index` as FullSlug;
  const idx = SITE_DATA.bySlug.get(slug) ?? null;
  const title = folderTitle(SITE_DATA, folder);
  const children = listFolderChildren(SITE_DATA, folder);
  // Breadcrumb current-crumb display: the index title or the dash→space folder
  // segment (NOT the "Folder: x" h1), mirroring faerrin.
  const crumbTitle = idx?.title ?? (folder.split("/").at(-1) ?? "").replaceAll("-", " ");
  return {
    slug,
    folder,
    title,
    crumbs: breadcrumbsFor(SITE_DATA, slug, crumbTitle),
    hasIndexBody: idx !== null,
    itemsLabel:
      children.length === 1
        ? "1 item under this folder"
        : `${children.length} items under this folder`,
    entries: children.map((e) => entryView(slug, e)),
  };
}

export function tagView(tag: string): TagView {
  const slug = `tags/${tag}` as FullSlug;
  const pages = pagesWithTag(SITE_DATA, tag);
  return {
    slug,
    title: `Tag: ${tag}`,
    itemsLabel: pages.length === 1 ? "1 item with this tag" : `${pages.length} items with this tag`,
    entries: pages.map((e) => entryView(slug, e)),
  };
}

const TAG_INDEX_NUM_PAGES = 10;

export function tagIndexView(): TagIndexView {
  const slug = "tags/index" as FullSlug;
  const tags = allTags(SITE_DATA);
  const sections = tags.map((tag) => {
    const pages = pagesWithTag(SITE_DATA, tag);
    return {
      tag,
      href: resolveRelative(slug, `tags/${tag}` as SimpleSlug),
      entries: pages.slice(0, TAG_INDEX_NUM_PAGES).map((e) => entryView(slug, e)),
      overflow: Math.max(0, pages.length - TAG_INDEX_NUM_PAGES),
    };
  });
  return {
    slug,
    title: "Tag Index",
    totalLabel: `Found ${tags.length} total tags`,
    sections,
  };
}

/** Whether a tag exists (for the tag route's 404 check). */
export function tagExists(tag: string): boolean {
  return allTags(SITE_DATA).includes(tag);
}

export type { Crumb };
