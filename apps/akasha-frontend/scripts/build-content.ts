// Pre-build content pipeline (slice 2 — the akasha snapshot → generated modules).
//
// Reads the committed akasha-backend snapshot, lifts faerrin's slug.ts/site.ts to derive
// the URL slugs + the page graph (backlinks/folders/tags/Explorer), and emits typed TS
// modules under src/generated/. The runtime app imports those modules — never the
// snapshot/fs — so the production bundle has no build-time data dependency.
//
// Vellum-body rendering + transcript pages + Pagefind land in later slices.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContent, defineContentSource, emitModule } from "@astra/content-build";
import {
  allFolders,
  allTags,
  buildExplorerTree,
  buildSite,
  type SiteDoc,
} from "../src/domain/lib/site";
import { loadSnapshot } from "../src/domain/lib/snapshot";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../src/generated");
const SNAPSHOT = path.resolve(HERE, "../../akasha-backend/snapshot/akasha-snapshot.json");

/** Serializable page record (Date → ISO string) the runtime imports. */
interface GeneratedPage {
  slug: string;
  simple: string;
  title: string;
  tags: string[];
  aliases: string[];
  img?: string;
  links: string[];
  date?: string;
}

const toGenerated = (d: SiteDoc): GeneratedPage => ({
  slug: d.slug,
  simple: d.simple,
  title: d.title,
  tags: d.tags,
  aliases: d.aliases,
  ...(d.img ? { img: d.img } : {}),
  links: d.links,
  ...(d.date ? { date: d.date.toISOString() } : {}),
});

const siteSource = defineContentSource({
  name: "site",
  build() {
    const site = buildSite(loadSnapshot(SNAPSHOT));
    const pages = site.docs.map(toGenerated);
    const tree = buildExplorerTree(site);
    const tags = allTags(site);
    const folders = allFolders(site);

    const body = [
      "/** The akasha wiki index — slugs/backlinks/folders/tags/Explorer derived from",
      " *  the akasha-backend snapshot via the lifted slug.ts/site.ts (0011 slice 2). */",
      "",
      "export interface GeneratedPage {",
      "  slug: string;",
      "  simple: string;",
      "  title: string;",
      "  tags: string[];",
      "  aliases: string[];",
      "  img?: string;",
      "  links: string[];",
      "  date?: string;",
      "}",
      "",
      "export interface TreeNode {",
      "  slug: string;",
      "  displayName: string;",
      "  isFolder: boolean;",
      "  children: TreeNode[];",
      "}",
      "",
      `export const SITE = { title: "Akasha", description: "The Færrin wiki" } as const;`,
      `export const PAGES: GeneratedPage[] = ${JSON.stringify(pages, null, 2)};`,
      `export const EXPLORER_TREE: TreeNode[] = ${JSON.stringify(tree, null, 2)};`,
      `export const ALL_TAGS: string[] = ${JSON.stringify(tags)};`,
      `export const ALL_FOLDERS: string[] = ${JSON.stringify(folders)};`,
      "",
    ].join("\n");
    emitModule(OUT_DIR, "site.ts", body);
    return `site: ${pages.length} pages, ${folders.length} folders, ${tags.length} tags`;
  },
});

export async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [siteSource]);
  for (const s of summaries) console.log(`  ${s}`);
}

if (import.meta.main) {
  await main();
}
