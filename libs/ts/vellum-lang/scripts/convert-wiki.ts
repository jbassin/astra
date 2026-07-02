#!/usr/bin/env node
/**
 * One-shot faerrin-wiki → full-vellum converter (astra 0007, decision E3/F2).
 *
 *   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
 *     libs/ts/vellum-lang/scripts/convert-wiki.ts [--src <wiki>] [--dest <corpus>]
 *
 * Reads faerrin's Obsidian wiki and writes the akasha SSOT corpus (full-vellum)
 * under apps/akasha-backend/content/. Idempotent. Emits a per-page conversion
 * report (convert-report.json) flagging any page that still needs a human eye.
 * The TS validator (validate-corpus.ts) is the zero-error-chips gate that follows.
 *
 * Per-page rules (NLSpec 0007 §"Converter rules"):
 *   1. frontmatter → normalize + BAKE the faerrin git-modified date into `date:`.
 *   2. prose / [[wikilinks]] / md+AON links → pass through (vellum is CommonMark+).
 *   3. Obsidian callouts `> [!type] Title` → `:::handout` / `:::edict`.
 *   4. `**Term** :: value <br/>` runs → `:::fields`.
 *   5. Timeline.md's nested HTML → `:::timeline`; the index/flavor pages' inline
 *      HTML (`<pre>` verse → fenced code, `<em>`/`<div>`/`<li>`/`<sup>` → markdown).
 *   6. sigil-collision scan — a `@`/`#`/`||` outside code is reported; the
 *      validator (zero error chips + zero collisions) is the gate.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const REPO = resolve(import.meta.dirname, "../../../..");
const SRC = argValue("--src") ?? "/ruby/data/experiments/faerrin/pkg/content/wiki";
const DEST = argValue("--dest") ?? join(REPO, "apps/akasha-backend/content");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface PageReport {
  rel: string;
  date: string | null;
  transforms: string[];
  /** Constructs/markers a human must verify before the corpus is final. */
  flags: string[];
}

/** All `.md` pages under SRC, excluding `Script/` (transcripts ≠ vellum, D4). */
function walkPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "Script") continue;
      walkPages(full, acc);
    } else if (entry.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

/** The faerrin git-modified date (ISO) for a source page — baked so it survives the repo move (Risk 1). */
function gitModifiedDate(srcRoot: string, full: string): string | null {
  try {
    const out = execFileSync(
      "git",
      ["-C", srcRoot, "log", "-1", "--format=%cI", "--", relative(srcRoot, full)],
      { encoding: "utf8" },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

const FM_RE = /^---\r?\n(.*?)\r?\n---[ \t]*\r?\n?/s;

/** Split leading YAML frontmatter; return the parsed object (or {}) + the body. */
function splitFrontmatter(source: string): { fm: Record<string, unknown>; body: string } {
  const m = FM_RE.exec(source);
  if (!m) return { fm: {}, body: source };
  let fm: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1] ?? "");
    if (parsed && typeof parsed === "object") fm = parsed as Record<string, unknown>;
  } catch {
    fm = {};
  }
  return { fm, body: source.slice(m[0].length) };
}

/** Re-emit normalized frontmatter with the baked `date`. Keeps unknown keys (vellum `extra`). */
function emitFrontmatter(fm: Record<string, unknown>, date: string | null): string {
  const out: Record<string, unknown> = { ...fm };
  if (date && out.date == null) out.date = date;
  if (Object.keys(out).length === 0) return "";
  return `---\n${stringifyYaml(out).trimEnd()}\n---\n\n`;
}

// ── Body transforms ───────────────────────────────────────────────────────

/** A line is a `**Term** :: value` field (tolerant: single/double colon, typos, wikilink terms). */
const FIELD_RE = /^\s*\*\*(.+?)\*\*\s*(?:::?|\bL:)\s*(.*?)\s*(?:<br\s*\/?>)?\s*$/;

/**
 * Convert runs of `**Term** :: value <br/>` lines into `:::fields` blocks. A
 * non-field line (incl. a `###` heading) breaks the run, so a page with two
 * field groups split by a heading yields two `:::fields` blocks (the real shape
 * of the deity pages). `term` keeps wikilinks; the separator normalizes to ` :: `.
 */
function convertFields(body: string, report: PageReport): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push(":::fields");
    out.push(...run);
    out.push(":::", "");
    report.transforms.push(`fields(${run.length})`);
    run = [];
  };
  for (const line of lines) {
    const m = FIELD_RE.exec(line);
    if (m && line.includes("::") === false && /\bL:/.test(line) === false && !/:/.test(line)) {
      // a `**Term**` line with no separator at all is not a field — pass through.
      flush();
      out.push(line);
      continue;
    }
    if (m) {
      const term = (m[1] ?? "").trim();
      const value = (m[2] ?? "").trim();
      run.push(`${term} :: ${value}`);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

const CALLOUT_RE = /^>\s*\[!(\w+)\]([+-]?)\s*(.*)$/;
/** Obsidian callout types that read as proclamations → `:::edict`; the rest → `:::handout`. */
const EDICT_TYPES = new Set(["edict", "warning", "danger", "decree"]);

/**
 * Convert an Obsidian callout (`> [!quote] Title` + `> ` body lines) into a
 * vellum `:::handout`/`:::edict` prose card. Exotic bodies (raw HTML/`<pre>`)
 * are still wrapped but flagged for hand-review (the sigil-escape pass).
 */
function convertCallouts(body: string, report: PageReport): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = CALLOUT_RE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const type = (m[1] ?? "").toLowerCase();
    const title = (m[3] ?? "").trim();
    const kind = EDICT_TYPES.has(type) ? "edict" : "handout";
    const inner: string[] = [];
    i++;
    for (; i < lines.length; i++) {
      const bl = lines[i] ?? "";
      if (!bl.startsWith(">")) {
        i--;
        break;
      }
      inner.push(bl.replace(/^>\s?/, ""));
    }
    out.push(`:::${kind}${title ? `[${title}]` : ""}`);
    out.push(...inner.map((l) => l.replace(/\s+$/, "")));
    out.push(":::", "");
    report.transforms.push(`${kind}(callout:${type})`);
    // HTML inside the callout body is cleaned by the later htmlToMarkdown pass;
    // flagResiduals re-checks the final body, so no flag is raised here.
  }
  return out.join("\n");
}

/**
 * `Timeline.md`'s nested `<ul><li><div><span small-caps>ERA</span><br/>text…[[ref]]
 * </div></li>` HTML → a `:::timeline` block (`- {ERA} text`). One structured page,
 * so a targeted parse; `[[wikilinks]]` in the text pass through unchanged.
 */
function convertTimeline(body: string, report: PageReport): string {
  const entries: string[] = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null = liRe.exec(body);
  while (m !== null) {
    const inner = m[1] ?? "";
    const era = /<span\b[^>]*>([\s\S]*?)<\/span>/.exec(inner)?.[1]?.trim();
    // Text = everything after the first <br/>, tags stripped, whitespace collapsed.
    const afterBreak = inner.replace(/[\s\S]*?<br\s*\/?>/, "");
    const text = afterBreak
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) entries.push(`- ${era ? `{${era}} ` : ""}${text}`);
    m = liRe.exec(body);
  }
  report.transforms.push(`timeline(${entries.length})`);
  return `:::timeline\n${entries.join("\n")}\n:::\n`;
}

/**
 * Targeted HTML→markdown for the ~8 index/flavor pages' inline HTML (vellum
 * renders raw HTML inert, so these tags would otherwise show as literal text).
 * The tag set is small + closed: `<pre>` verse → fenced code (layout preserved);
 * `<div>`/`<span>`/`<small>` → unwrapped; `<li>` → `- `; `<em>`/`<strong>` →
 * `*`/`**`; `<br/>` → a markdown hard break. Runs last, after the structural
 * transforms, so it also cleans HTML that lived inside a converted callout body.
 */
function htmlToMarkdown(body: string, report: PageReport): string {
  if (!/<[a-z]/i.test(body)) return body;
  let s = body;
  // `<pre>` preformatted (verse) → fenced code; strip inner tags, keep newlines.
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").replace(/^\n+|\n+$/g, "");
    return `\n\`\`\`\n${text}\n\`\`\`\n`;
  });
  s = s
    .replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_m, t: string) => `- ${t.replace(/<[^>]+>/g, "").trim()}`,
    )
    .replace(/<\/?(ul|ol|div)[^>]*>/gi, "")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<\/?(span|small|sup|sub)[^>]*>/gi, "");
  report.transforms.push("html→md");
  if (/<[a-z][^>]*>/i.test(s)) report.flags.push("residual-html");
  return s;
}

/**
 * Markers that need a human eye before the corpus is final. Sigil checks run on
 * the body with fenced code stripped — a `@`/`#`/`||` inside ``` is inert (the
 * parser never expands sigils in code), so flagging it would be a false alarm.
 */
function flagResiduals(body: string, report: PageReport): void {
  const noCode = body.replace(/```[\s\S]*?```/g, "");
  if (/<\/?(ul|ol|li|div|span|pre|table|small|sup|sub)\b/i.test(noCode))
    report.flags.push("raw-html");
  if (/(^|\s)#[A-Za-z]/.test(noCode)) report.flags.push("hash-sigil");
  if (/(^|\s)@[A-Za-z0-9]/.test(noCode)) report.flags.push("at-sigil");
  if (/\|\|/.test(noCode)) report.flags.push("pipe-redact");
}

function convertPage(
  srcRoot: string,
  full: string,
): { rel: string; output: string; report: PageReport } {
  const rel = relative(srcRoot, full);
  const raw = readFileSync(full, "utf8");
  const { fm, body } = splitFrontmatter(raw);
  const date = gitModifiedDate(srcRoot, full);
  const report: PageReport = { rel, date, transforms: [], flags: [] };

  let converted = body;
  // Timeline.md is bespoke nested HTML → a dedicated `:::timeline` parse.
  if (rel === "Timeline.md") {
    converted = convertTimeline(converted, report);
    converted = htmlToMarkdown(converted, report);
  } else {
    converted = convertCallouts(converted, report);
    converted = convertFields(converted, report);
    converted = htmlToMarkdown(converted, report);
  }
  flagResiduals(converted, report);

  const output = `${emitFrontmatter(fm, date)}${converted.replace(/^\n+/, "").replace(/\s+$/, "")}\n`;
  return { rel, output, report };
}

// ── Run ─────────────────────────────────────────────────────────────────

function main(): void {
  if (!existsSync(SRC)) throw new Error(`source wiki not found: ${SRC}`);
  const pages = walkPages(SRC).sort();
  const reports: PageReport[] = [];
  for (const full of pages) {
    const { rel, output, report } = convertPage(SRC, full);
    const dest = join(DEST, rel.replace(/\.md$/, ".vellum"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, output);
    reports.push(report);
  }
  const flagged = reports.filter((r) => r.flags.length > 0);
  const reportPath = join(DEST, "..", "migrate", "convert-report.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ count: reports.length, reports }, null, 2)}\n`);
  console.log(`converted ${reports.length} pages → ${relative(REPO, DEST)}`);
  console.log(`flagged for hand-review: ${flagged.length}`);
  for (const r of flagged) console.log(`  ${r.rel}  [${r.flags.join(", ")}]`);
}

main();
