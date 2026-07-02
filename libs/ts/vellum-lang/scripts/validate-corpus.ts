#!/usr/bin/env node
/**
 * Corpus structural validator (astra 0007, decision F3 — the TS Node step that
 * makes TS the structural authority, D2).
 *
 *   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
 *     libs/ts/vellum-lang/scripts/validate-corpus.ts [--dir <corpus>]
 *
 * Parses every `.vellum` page with the reference parser and reports two things,
 * failing on either (NLSpec 0007 exit gate B + the §1 collision scan):
 *
 *   1. ERROR CHIPS — where gothic's renderer would emit a visible `?…`:
 *      unknown/malformed inline directives (`:action[seven]`, `:trait[]`, an
 *      unknown `:name`) and a misplaced `:::columns`/`:::column`.
 *   2. SIGIL COLLISIONS — `:trait`/`:action`/`:redact` nodes (incl. ones the
 *      `#word`/`@tok`/`||…||` sigils expand to). These parse as VALID PF2e card
 *      markup but the akasha wiki is prose with zero statblocks, so every one is
 *      an accidental collision in existing text and must be escaped/reworded.
 *      (`--allow-sigils` suppresses category 2 for the rare intentional case.)
 *
 * The akasha-backend Dagster asset shells out to this; CI runs it as a job.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Nodes } from "mdast";
import { parseDocument } from "../src/index";
import type { VellumNode } from "../src/model";

const REPO = resolve(import.meta.dirname, "../../../..");
const DIR = argValue("--dir") ?? join(REPO, "apps/akasha-backend/content");

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
      if (node.labelNodes) findChips(node.labelNodes as Nodes[], chips, collisions);
      findChips(node.children, chips, collisions);
      break;
    case "columns":
      for (const col of node.columns)
        for (const inner of col) chipsForNode(inner, chips, collisions);
      break;
    case "fields":
      for (const item of node.items) findChips(item.value as Nodes[], chips, collisions);
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

function main(): void {
  const files = vellumFiles(DIR).sort();
  let chipPages = 0;
  let collisionPages = 0;
  for (const file of files) {
    const chips: string[] = [];
    const collisions: string[] = [];
    const doc = parseDocument(readFileSync(file, "utf8"));
    for (const node of doc.nodes) chipsForNode(node, chips, collisions);
    const showCollisions = !ALLOW_SIGILS && collisions.length > 0;
    if (chips.length > 0 || showCollisions) {
      const rel = relative(DIR, file);
      if (chips.length > 0) {
        chipPages += 1;
        console.error(`✖ ${rel}  (error chips)`);
        for (const chip of chips) console.error(`    ${chip}`);
      }
      if (showCollisions) {
        collisionPages += 1;
        console.error(`⚠ ${rel}  (sigil collisions)`);
        for (const c of collisions) console.error(`    ${c}`);
      }
    }
  }
  console.log(
    `\nvalidated ${files.length} pages; ${chipPages} with error chips, ${collisionPages} with sigil collisions`,
  );
  if (chipPages > 0 || collisionPages > 0) process.exit(1);
  console.log("corpus clean — zero error chips, zero collisions");
}

main();
