/**
 * S3 dev sweep (not the official gate — that's S4's job): runs EVERY AoN doc's
 * `markdown` across all 93 category snapshot files through `parseAonMarkdown`
 * with a stub `resolveLink` (always returns a text node — the real link table
 * is `aonLinkTable.ts`'s job). Prints:
 *   - docs with/without markdown
 *   - the full tag census (regex-based, open+close) + markdown construct counts
 *   - report-class counts (the parser's deliberate drops/leniencies)
 *   - href pattern families seen by resolveLink (for the link-table engineer)
 *   - the <traits>-vs-`_source.trait` duplication check that justifies the
 *     traits-block drop decision
 *   - first-N examples of any hard failure, and a ZERO-hard-fail confirmation
 *
 * Definition of done: the full sweep runs with ZERO hard failures. Run via:
 *
 *   pnpm --filter @astra/codex exec node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/dev-sweep-aon.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import { type AonParseCtx, parseAonMarkdown } from "../src/ingest/aonMarkup";

const MAX_EXAMPLES = 5;
const SNAPSHOT_DATE = "2026-07-13";

interface AonDoc {
  id?: string;
  name?: string;
  markdown?: string;
  trait?: string[];
  trait_raw?: string[];
  size?: string[];
  rarity?: string;
}

interface SnapshotFile {
  category: string;
  hits: Array<{ _id: string; _source: AonDoc }>;
}

function hrefFamily(href: string): string {
  if (/^https?:\/\//.test(href)) {
    try {
      return `external https://${new URL(href).hostname}/...`;
    } catch {
      return "external (unparsable URL)";
    }
  }
  let m = /^\/([A-Za-z]+)\.aspx/.exec(href);
  if (m) return `/${m[1]}.aspx?ID=n (internal .aspx)`;
  m = /^([A-Za-z]+)\.aspx/.exec(href);
  if (m) return `${m[1]}.aspx (internal .aspx, NO leading slash)`;
  if (href.startsWith("/")) return "/lowercase-path (internal non-.aspx route)";
  if (href === "") return "(empty href)";
  if (/^[A-Za-z0-9.-]+\.(com|club|org|net)$/i.test(href)) return "bare-domain (no scheme)";
  return `other: ${href.slice(0, 40)}`;
}

function main(): void {
  const cfg = loadConfig();
  const dir = join(cfg.codex.dataPath, "snapshots", "aon", SNAPSHOT_DATE);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let totalDocs = 0;
  let withMarkdown = 0;
  let withoutMarkdown = 0;
  let parsedOk = 0;

  const tagCounts = new Map<string, number>();
  const reportCounts = new Map<string, number>();
  const hrefFamilies = new Map<string, number>();
  const errorsByClass = new Map<string, number>();
  const errorExamples = new Map<string, Array<{ id: string; message: string }>>();

  // Markdown construct census (regex-level, independent of the parser).
  let mdLinks = 0;
  let boldMarkers = 0;
  let italicMarkers = 0;
  let headingLines = 0;
  let dividerLines = 0;
  let dashListLines = 0;
  let crlfDocs = 0;

  // <traits> duplication check: does the tag block's label set match the
  // structured `_source.trait` facet field? (Justifies the drop decision.)
  let traitsBlocks = 0;
  let traitsBlocksMatchingFacet = 0;
  const traitsMismatchExamples: string[] = [];

  const TAG_RE =
    /<\/?([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=\s*"[^"]*")*\s*\/?>/g;

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as SnapshotFile;
    for (const hit of data.hits) {
      totalDocs++;
      const src = hit._source;
      const md = src.markdown;
      if (md === undefined || md === "") {
        withoutMarkdown++;
        continue;
      }
      withMarkdown++;
      if (md.includes("\r\n")) crlfDocs++;

      // census
      TAG_RE.lastIndex = 0;
      for (let m = TAG_RE.exec(md); m !== null; m = TAG_RE.exec(md)) {
        const tag = (m[1] ?? "").toLowerCase();
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      const lf = md.replace(/\r\n/g, "\n");
      mdLinks += (lf.match(/\[[^\]]*\]\([^)]*\)/g) ?? []).length;
      boldMarkers += (lf.match(/\*\*/g) ?? []).length;
      italicMarkers += (lf.match(/_/g) ?? []).length;
      headingLines += (lf.match(/^#{2,3}\s/gm) ?? []).length;
      dividerLines += (lf.match(/^\s*-{3,}\s*$/gm) ?? []).length;
      dashListLines += (lf.match(/^-\s/gm) ?? []).length;

      // traits duplication
      const wrapperRe = /<traits>([\s\S]*?)<\/traits>/g;
      for (let w = wrapperRe.exec(md); w !== null; w = wrapperRe.exec(md)) {
        traitsBlocks++;
        const labels = new Set<string>();
        const labelRe = /<trait\b[^>]*\blabel="([^"]*)"/g;
        const body = w[1] ?? "";
        for (let t = labelRe.exec(body); t !== null; t = labelRe.exec(body)) {
          labels.add((t[1] ?? "").trim().toLowerCase());
        }
        // The pill row draws from FOUR structured facet fields: `trait`,
        // `trait_raw` (qualifier variants like "Deadly d8"), `size`, and
        // `rarity` — count a label covered if ANY of them carries it.
        const facet = new Set(
          [...(src.trait ?? []), ...(src.trait_raw ?? []), ...(src.size ?? [])].map((t) =>
            t.trim().toLowerCase(),
          ),
        );
        if (src.rarity !== undefined) facet.add(src.rarity.trim().toLowerCase());
        const covered = [...labels].every((l) => facet.has(l));
        if (covered) traitsBlocksMatchingFacet++;
        else if (traitsMismatchExamples.length < MAX_EXAMPLES) {
          traitsMismatchExamples.push(
            `${src.id ?? hit._id}: tag=[${[...labels].join(",")}] facet=[${[...facet].join(",")}]`,
          );
        }
      }

      const ctx: AonParseCtx = {
        resolveLink: (href, display) => {
          const fam = hrefFamily(href);
          hrefFamilies.set(fam, (hrefFamilies.get(fam) ?? 0) + 1);
          return {
            kind: "text",
            content: display,
            marks: { bold: false, italic: false, superscript: false },
          };
        },
        report: (cls) => reportCounts.set(cls, (reportCounts.get(cls) ?? 0) + 1),
      };
      try {
        parseAonMarkdown(md, ctx);
        parsedOk++;
      } catch (e) {
        const cls = e instanceof Error ? e.name : "UnknownError";
        const message = e instanceof Error ? e.message : String(e);
        errorsByClass.set(cls, (errorsByClass.get(cls) ?? 0) + 1);
        const list = errorExamples.get(cls) ?? [];
        if (list.length < MAX_EXAMPLES) {
          list.push({ id: `${data.category}/${src.id ?? hit._id}`, message });
          errorExamples.set(cls, list);
        }
      }
    }
  }

  console.log(`Snapshot files: ${files.length}`);
  console.log(
    `Total docs: ${totalDocs}  (with markdown: ${withMarkdown}, without: ${withoutMarkdown}, CRLF: ${crlfDocs})`,
  );
  console.log(`Parsed clean: ${parsedOk}`);
  console.log();

  console.log("Tag census (open+close occurrences):");
  for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  <${tag}>: ${count}`);
  }
  console.log();
  console.log("Markdown constructs:");
  console.log(`  [display](href) links: ${mdLinks}`);
  console.log(`  ** markers: ${boldMarkers}   _ markers: ${italicMarkers}`);
  console.log(`  ##/### heading lines: ${headingLines}`);
  console.log(`  --- divider lines: ${dividerLines}`);
  console.log(`  "- " list lines: ${dashListLines}`);
  console.log();

  console.log("Report classes (deliberate drops/leniencies):");
  for (const [cls, count] of [...reportCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cls}: ${count}`);
  }
  console.log();

  console.log("Href pattern families (via resolveLink):");
  for (const [fam, count] of [...hrefFamilies.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fam}: ${count}`);
  }
  console.log();

  const pct = traitsBlocks === 0 ? 0 : (100 * traitsBlocksMatchingFacet) / traitsBlocks;
  console.log(
    `<traits> blocks: ${traitsBlocks}; label-set covered by _source.trait: ${traitsBlocksMatchingFacet} (${pct.toFixed(2)}%)`,
  );
  for (const ex of traitsMismatchExamples) console.log(`  mismatch: ${ex}`);
  console.log();

  const totalErrors = [...errorsByClass.values()].reduce((a, b) => a + b, 0);
  if (totalErrors === 0) {
    console.log("ZERO hard failures across the full AoN snapshot.");
  } else {
    console.log(`${totalErrors} hard failures across ${errorsByClass.size} class(es):`);
    for (const [cls, count] of errorsByClass) {
      console.log(`\n  ${cls}: ${count}`);
      for (const ex of errorExamples.get(cls) ?? []) {
        console.log(`    ${ex.id}: ${ex.message}`);
      }
    }
    process.exit(1);
  }
}

main();
