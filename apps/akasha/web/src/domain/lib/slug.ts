/**
 * Canonical slug logic — the single source of truth for page URLs.
 *
 * Ported VERBATIM from Quartz's `quartz/util/path.ts` so the Astro rebuild
 * produces byte-identical URLs to the current site. DO NOT "improve" these:
 * any change to casing/punctuation handling silently breaks every internal
 * link, alias redirect, sitemap entry, and inbound bookmark.
 *
 * Key fact: Quartz slugs PAGE PATHS with `sluggify` (below), which preserves
 * case, commas, apostrophes, periods, and Unicode. `github-slugger` is used by
 * Quartz ONLY for heading anchors, never for page paths.
 *
 * This module is isomorphic (no node builtins) so both the `scripts/` pipeline
 * and the Astro build can import it.
 *
 * Source: quartz/util/path.ts @ content SHA 511d1d1 (verified against
 * public/static/contentIndex.json — see migration/parity-slugs.ts and
 * migration/parity-graph.ts).
 */

// Branded slug types, mirrored from Quartz for parity with its call sites.
type SlugLike<T> = string & { __brand: T };
/** Cannot be relative and must have a file extension. */
export type FilePath = SlugLike<"filepath">;
/** No leading/trailing slashes; may end in `index`. The most general slug. */
export type FullSlug = SlugLike<"full">;
/** No `/index` ending and no file extension; may have a trailing slash for folders. */
export type SimpleSlug = SlugLike<"simple">;
/** Found on hrefs or constructed for client-side navigation. */
export type RelativeURL = SlugLike<"relative">;

function sluggify(s: string): string {
  return s
    .split("/")
    .map((segment) =>
      segment
        .replaceAll(/\s/g, "-")
        .replaceAll("&", "-and-")
        .replaceAll("%", "-percent")
        .replaceAll("?", "")
        .replaceAll("#", ""),
    )
    .join("/") // always use / as sep
    .replace(/\/$/, "");
}

export function slugifyFilePath(fp: FilePath, excludeExt?: boolean): FullSlug {
  fp = stripSlashes(fp) as FilePath;
  let ext = getFileExtension(fp);
  const withoutFileExt = fp.replace(new RegExp(`${ext}$`), "");
  if (excludeExt || [".md", ".html", undefined].includes(ext)) {
    ext = "";
  }

  let slug = sluggify(withoutFileExt);

  // treat _index as index
  if (endsWith(slug, "_index")) {
    slug = slug.replace(/_index$/, "index");
  }

  return (slug + ext) as FullSlug;
}

export function simplifySlug(fp: FullSlug): SimpleSlug {
  const res = stripSlashes(trimSuffix(fp, "index"), true);
  return (res.length === 0 ? "/" : res) as SimpleSlug;
}

function endsWith(s: string, suffix: string): boolean {
  return s === suffix || s.endsWith(`/${suffix}`);
}

function trimSuffix(s: string, suffix: string): string {
  if (endsWith(s, suffix)) {
    s = s.slice(0, -suffix.length);
  }
  return s;
}

function getFileExtension(s: string): string | undefined {
  return s.match(/\.[A-Za-z0-9]+$/)?.[0];
}

function stripSlashes(s: string, onlyStripPrefix?: boolean): string {
  if (s.startsWith("/")) {
    s = s.substring(1);
  }

  if (!onlyStripPrefix && s.endsWith("/")) {
    s = s.slice(0, -1);
  }

  return s;
}

// ---------------------------------------------------------------------------
// Relative-path helpers — ported verbatim from quartz/util/path.ts so relative
// links match Quartz exactly.
// ---------------------------------------------------------------------------

function joinSegments(...args: string[]): string {
  if (args.length === 0) {
    return "";
  }

  let joined = args
    .filter((segment) => segment !== "" && segment !== "/")
    .map((segment) => stripSlashes(segment))
    .join("/");

  // if the first segment starts with a slash, add it back (args is non-empty here;
  // `?? ""` only satisfies strict index access — same runtime behavior).
  if ((args[0] ?? "").startsWith("/")) {
    joined = `/${joined}`;
  }

  // if the last segment is a folder, add a trailing slash
  if ((args.at(-1) ?? "").endsWith("/")) {
    joined = `${joined}/`;
  }

  return joined;
}

// resolve /a/b/c to ../..
function pathToRoot(slug: FullSlug): RelativeURL {
  let rootPath = slug
    .split("/")
    .filter((x) => x !== "")
    .slice(0, -1)
    .map((_) => "..")
    .join("/");

  if (rootPath.length === 0) {
    rootPath = ".";
  }

  return rootPath as RelativeURL;
}

export function resolveRelative(current: FullSlug, target: FullSlug | SimpleSlug): RelativeURL {
  const res = joinSegments(pathToRoot(current), simplifySlug(target as FullSlug)) as RelativeURL;
  return res;
}

function _addRelativeToStart(s: string): string {
  if (s === "") {
    s = ".";
  }

  if (!s.startsWith(".")) {
    s = joinSegments(".", s);
  }

  return s;
}
