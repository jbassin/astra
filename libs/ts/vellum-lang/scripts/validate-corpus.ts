#!/usr/bin/env node
/**
 * Corpus structural validator (the TS Node step that makes TS the structural
 * authority).
 *
 *   node --import tsx \
 *     libs/ts/vellum-lang/scripts/validate-corpus.ts --dir <corpus> [--assets <dir>]
 *
 * Parses every `.vellum` page with the reference parser and reports three things,
 * failing on any (zero error chips, zero bad images, plus the collision scan):
 *
 *   1. ERROR CHIPS — where gothic's renderer would emit a visible `?…`:
 *      unknown/malformed inline directives (`:action[seven]`, `:trait[]`, an
 *      unknown `:name`) and a misplaced `:::columns`/`:::column`.
 *   2. SIGIL COLLISIONS — `:trait`/`:action`/`:redact` nodes (incl. ones the
 *      `#word`/`@tok`/`||…||` sigils expand to). These parse as VALID PF2e card
 *      markup but the akasha wiki is prose with zero statblocks, so every one is
 *      an accidental collision in existing text and must be escaped/reworded.
 *      (`--allow-sigils` suppresses category 2 for the rare intentional case.)
 *   3. BAD IMAGES — a Markdown image whose source is external, not in the asset path
 *      form, or names a file missing from the assets folder (`imageSrcProblem`), or one
 *      with no alt text. gothic would show only the alt text, so the page has a hole
 *      the author can fix from the files alone. `--assets` defaults to the `assets`
 *      folder beside the corpus (`akasha/assets` next to `akasha/content`); heartwood,
 *      which validates a candidate page in a temp dir, passes the real one.
 *
 * Callers: `akasha-snapshot` validates before it writes the snapshot, heartwood's
 * agent validator checks each candidate page set, the heartwood-agent and
 * heartwood-revert commands (astra_ops) run it over the whole corpus, and the CI
 * job `corpus-validate` runs it over the fixture wiki.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { Nodes } from "mdast";

import { collectImages, imageSrcProblem, parseDocument } from "../src/index";
import type { VellumDocument, VellumNode } from "../src/model";

// The corpus lives wherever config's `data.akasha-content` says; every caller passes it
// (the akasha-snapshot validate step, the heartwood recipes, CI's checked-out copy).
const DIR = resolve(argValue("--dir") ?? usage());
const ASSETS_DIR = resolve(argValue("--assets") ?? join(DIR, "..", "assets"));

function usage(): never {
  console.error("usage: validate-corpus.ts --dir <corpus> [--assets <dir>] [--allow-sigils]");
  process.exit(64);
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The action cost tokens the renderer accepts (mirrors gothic normalizeActionCost). */
const ACTION_TOKENS = new Set([
  "1",
  "one",
  "single",
  "2",
  "two",
  "double",
  "3",
  "three",
  "triple",
  "r",
  "reaction",
  "react",
  "0",
  "f",
  "free",
]);

function collectText(nodes: readonly Nodes[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text" || n.type === "inlineCode") out += n.value;
    else if ("children" in n) out += collectText(n.children as Nodes[]);
  }
  return out;
}

const ALLOW_SIGILS = process.argv.includes("--allow-sigils");

/** Error chips + sigil collisions reachable from a run of mdast nodes. */
function findChips(nodes: readonly Nodes[], chips: string[], collisions: string[]): void {
  for (const node of nodes) {
    if (node.type === "textDirective" || node.type === "leafDirective") {
      const name = node.name;
      if (name === "action") {
        const token = (collectText(node.children) || String(node.attributes?.cost ?? ""))
          .trim()
          .toLowerCase();
        if (!ACTION_TOKENS.has(token)) chips.push(`?action[${token}]`);
        else collisions.push(`:action[${token}]`);
      } else if (name === "trait") {
        const t = collectText(node.children).trim();
        if (t === "") chips.push("?trait[]");
        else collisions.push(`:trait[${t}]`);
      } else if (name === "redact") {
        collisions.push(`:redact[${collectText(node.children)}]`);
      } else if (name === "vsserr") {
        chips.push(`?vsserr(${collectText(node.children)})`);
      } else {
        chips.push(`?${name}`);
      }
    } else if (
      node.type === "containerDirective" &&
      (node.name === "columns" || node.name === "column")
    ) {
      chips.push(`?${node.name} — only at top level`);
    }
    if ("children" in node) findChips(node.children as Nodes[], chips, collisions);
  }
}

/** Walk a VellumNode tree, collecting chips + collisions from every mdast-bearing part. */
function chipsForNode(node: VellumNode, chips: string[], collisions: string[]): void {
  switch (node.type) {
    case "prose":
      findChips(node.children, chips, collisions);
      break;
    case "block":
      if (node.labelNodes) findChips(node.labelNodes, chips, collisions);
      findChips(node.children, chips, collisions);
      break;
    case "columns":
      for (const col of node.columns)
        for (const inner of col) chipsForNode(inner, chips, collisions);
      break;
    case "fields":
      for (const item of node.items) findChips(item.value, chips, collisions);
      break;
    case "timeline":
      for (const entry of node.entries) findChips(entry.children, chips, collisions);
      break;
  }
}

function vellumFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) vellumFiles(full, acc);
    else if (entry.endsWith(".vellum")) acc.push(full);
  }
  return acc;
}

/** Every file under the assets folder, as `/`-separated paths relative to it. */
function assetPaths(dir: string, prefix = "", acc = new Set<string>()): Set<string> {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) assetPaths(full, `${prefix}${entry}/`, acc);
    else acc.add(`${prefix}${entry}`);
  }
  return acc;
}

/** The page's bad images: external, not an asset path, missing, or without alt text. */
function imageProblems(doc: VellumDocument, assets: ReadonlySet<string>): string[] {
  return collectImages(doc).flatMap((image) => {
    const problem = imageSrcProblem(image.url, assets);
    if (problem) return [problem];
    return image.alt?.trim() ? [] : [`image ${image.url}: needs alt text`];
  });
}

/** Print one page's findings under a heading; true when there were any. */
function report(mark: string, rel: string, label: string, items: readonly string[]): boolean {
  if (items.length === 0) return false;
  console.error(`${mark} ${rel}  (${label})`);
  for (const item of items) console.error(`    ${item}`);
  return true;
}

function main(): void {
  const files = vellumFiles(DIR).sort();
  const assets = assetPaths(ASSETS_DIR);
  let chipPages = 0;
  let imagePages = 0;
  let collisionPages = 0;
  for (const file of files) {
    const chips: string[] = [];
    const collisions: string[] = [];
    const doc = parseDocument(readFileSync(file, "utf8"));
    for (const node of doc.nodes) chipsForNode(node, chips, collisions);
    const rel = relative(DIR, file);
    if (report("✖", rel, "error chips", chips)) chipPages += 1;
    if (report("✖", rel, "images", imageProblems(doc, assets))) imagePages += 1;
    if (report("⚠", rel, "sigil collisions", ALLOW_SIGILS ? [] : collisions)) collisionPages += 1;
  }
  console.log(
    `\nvalidated ${files.length} pages; ${chipPages} with error chips, ${imagePages} with bad images, ${collisionPages} with sigil collisions`,
  );
  if (chipPages > 0 || imagePages > 0 || collisionPages > 0) process.exit(1);
  console.log("corpus clean — zero error chips, zero bad images, zero collisions");
}

main();
