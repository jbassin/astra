/**
 * S2 dev sweep (not the official gate — that's S4's job): runs EVERY pack doc's
 * `system.description.value` (+ every embedded Actor item's own description, +
 * every included-journal page's `text.content`, as a bonus check since
 * `foundryHtml.ts` will parse those too once `journals.ts` exists) through
 * `parseFoundryHtml`/`parseEnrichedText` with a permissive `resolveUuid` stub
 * (never fails — join.ts's real resolution is S4's job) and the REAL merged
 * `static/lang/*.json` map. Prints per-error-class counts with first-N examples.
 *
 * Definition of done (per the S2 module owner's brief): the full sweep runs with
 * ZERO hard failures. Run via:
 *
 *   pnpm --filter @astra/codex exec node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/dev-sweep-foundry.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import {
  type EnricherContext,
  type ReportClass,
  type UuidResolution,
  mergeLocalizeMaps,
} from "../src/ingest/enrichers";
import { parseFoundryHtml } from "../src/ingest/foundryHtml";
import { walkFiles } from "../src/ingest/fsWalk";

const MAX_EXAMPLES_PER_CLASS = 5;

interface FoundryDoc {
  name?: string;
  system?: { description?: { value?: string } };
  items?: FoundryDoc[];
  pages?: Array<{ type?: string; name?: string; text?: { content?: string } }>;
}

function loadLangMap(langDir: string): ReadonlyMap<string, string> {
  // Ascending precedence (D29-5/D29-6): action-en/kingmaker-en/sf2e-overrides-en
  // lowest, en.json next, re-en.json wins last.
  const order = [
    "action-en.json",
    "kingmaker-en.json",
    "sf2e-overrides-en.json",
    "en.json",
    "re-en.json",
  ];
  const files = order.map(
    (name) => JSON.parse(readFileSync(join(langDir, name), "utf8")) as Record<string, unknown>,
  );
  return mergeLocalizeMaps(files);
}

function main(): void {
  const cfg = loadConfig();
  const tag = "pf2e-8.3.0";
  const snapshotDir = join(cfg.codex.dataPath, "snapshots", "foundry", tag);
  const packsDir = join(snapshotDir, "packs", "pf2e");
  const langDir = join(snapshotDir, "static", "lang");

  const localize = loadLangMap(langDir);
  const reportCounts = new Map<ReportClass, number>();
  const ctx: EnricherContext = {
    resolveUuid: (uuid: string): UuidResolution => ({ kind: "crossref", id: uuid, display: uuid }),
    localize,
    report: (cls) => reportCounts.set(cls, (reportCounts.get(cls) ?? 0) + 1),
    parseBlockHtml: (html: string) => parseFoundryHtml(html, ctx),
  };

  let totalDocs = 0;
  let descriptionsParsed = 0;
  let embeddedItemDescriptionsParsed = 0;
  let journalPagesParsed = 0;
  const errorsByClass = new Map<string, Array<{ path: string; name: string; message: string }>>();

  const errorCounts = new Map<string, number>();
  const recordError = (cls: string, path: string, name: string, message: string): void => {
    const list = errorsByClass.get(cls) ?? [];
    if (list.length < MAX_EXAMPLES_PER_CLASS) {
      list.push({ path, name, message });
      errorsByClass.set(cls, list);
    }
    errorCounts.set(cls, (errorCounts.get(cls) ?? 0) + 1);
  };

  const tryParse = (html: string | undefined, path: string, name: string, kind: string): void => {
    if (html === undefined || html === "") return;
    try {
      parseFoundryHtml(html, ctx);
      if (kind === "description") descriptionsParsed++;
      else if (kind === "embeddedItemDescription") embeddedItemDescriptionsParsed++;
      else if (kind === "journalPage") journalPagesParsed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      recordError(e instanceof Error ? e.name : "UnknownError", path, name, message);
    }
  };

  for (const file of walkFiles(packsDir)) {
    if (file.relPath.endsWith("_folders.json")) continue;
    totalDocs++;
    let doc: FoundryDoc;
    try {
      doc = JSON.parse(readFileSync(file.absPath, "utf8")) as FoundryDoc;
    } catch (e) {
      recordError("JsonParseError", file.relPath, "", e instanceof Error ? e.message : String(e));
      continue;
    }

    tryParse(doc.system?.description?.value, file.relPath, doc.name ?? "", "description");

    for (const item of doc.items ?? []) {
      tryParse(
        item.system?.description?.value,
        file.relPath,
        item.name ?? "",
        "embeddedItemDescription",
      );
    }

    // Bonus: journal pages (journals.ts's field, not description) — same HTML
    // grammar, worth proving clean now rather than waiting for that module.
    for (const page of doc.pages ?? []) {
      if (page.type === "text") {
        tryParse(page.text?.content, file.relPath, page.name ?? "", "journalPage");
      }
    }
  }

  console.log(`Total pack docs scanned: ${totalDocs}`);
  console.log(`Descriptions parsed:            ${descriptionsParsed}`);
  console.log(`Embedded item descriptions:     ${embeddedItemDescriptionsParsed}`);
  console.log(`Journal pages parsed (bonus):   ${journalPagesParsed}`);
  console.log();

  const totalErrors = [...errorCounts.values()].reduce((a, b) => a + b, 0);
  if (totalErrors === 0) {
    console.log("ZERO hard failures across the full snapshot.");
  } else {
    console.log(`${totalErrors} hard failures across ${errorCounts.size} class(es):`);
    for (const [cls, count] of errorCounts) {
      console.log(`\n  ${cls}: ${count}`);
      for (const ex of errorsByClass.get(cls) ?? []) {
        console.log(`    ${ex.path} (${ex.name}): ${ex.message}`);
      }
    }
  }

  console.log("\nNon-fatal report classes:");
  for (const [cls, count] of reportCounts) {
    console.log(`  ${cls}: ${count}`);
  }

  if (totalErrors > 0) process.exit(1);
}

main();
