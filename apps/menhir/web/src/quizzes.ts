/**
 * KDL → Zod quiz loader (D31-4). Parsed with @bgotink/kdl, resolved off
 * import.meta.dirname (never cwd — the weal-overlay distDir idiom), Zod-validated
 * at server start. A malformed file is EXCLUDED from the listing and logged at
 * WARN — not ERROR (a quiz typo must not page ops via the live SigNoz Class-A
 * rule) — with a startup summary line.
 *
 * KDL shape:
 *   quiz "The Undercroft Opener" {
 *       question "Who yoinked the sandwich?" time=20 {
 *           option "Ozzie" correct=#true
 *           option "Argyle"
 *       }
 *   }
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { type Node, parse } from "@bgotink/kdl";

import { QuizSchema, type Quiz } from "./schema";

function args(node: Node): unknown[] {
  return node.getArgumentEntries().map((e) => e.getValue());
}

function props(node: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of node.getPropertyEntryMap()) out[key] = entry.getValue();
  return out;
}

function children(node: Node): Node[] {
  return node.children?.nodes ?? [];
}

function parseOption(node: Node, ctx: string): { label: string; correct: boolean } {
  const label = args(node)[0];
  if (typeof label !== "string" || label.length === 0) {
    throw new Error(`${ctx}: option is missing a string label`);
  }
  const p = props(node);
  return { label, correct: p.correct === true };
}

function parseQuestion(node: Node, ctx: string): Quiz["questions"][number] {
  const text = args(node)[0];
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`${ctx}: question is missing its text`);
  }
  const p = props(node);
  const time = typeof p.time === "number" ? p.time : 20;
  const options = children(node)
    .filter((n) => n.name.name === "option")
    .map((n) => parseOption(n, `${ctx} "${text}"`));
  return { text, time, options };
}

/** Parse + Zod-validate a single quiz file. Throws on any malformed content —
 * callers catch this per-file so one bad quiz doesn't sink the whole listing. */
export function parseQuizFile(filePath: string): Quiz {
  const id = basename(filePath, extname(filePath));
  const doc = parse(readFileSync(filePath, "utf8"));
  const quizNode = doc.nodes.find((n) => n.name.name === "quiz");
  if (!quizNode) throw new Error(`${id}: no top-level "quiz" node`);

  const title = args(quizNode)[0];
  if (typeof title !== "string" || title.length === 0) {
    throw new Error(`${id}: quiz is missing a string title`);
  }
  const questions = children(quizNode)
    .filter((n) => n.name.name === "question")
    .map((n) => parseQuestion(n, id));

  return QuizSchema.parse({ id, title, questions });
}

export interface QuizLoadResult {
  quizzes: Quiz[];
  /** One line per excluded file — WARN-logged by the caller, never ERROR. */
  warnings: string[];
  /** A single startup summary line. */
  summary: string;
}

/** Load every `*.kdl` in `dir`. A malformed file is excluded + reported in
 * `warnings`, never thrown — one bad quiz must not crash server start. */
export function loadQuizzes(dir: string): QuizLoadResult {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".kdl"));
  } catch {
    return { quizzes: [], warnings: [], summary: `[menhir] no quizzes dir at ${dir}` };
  }

  const quizzes: Quiz[] = [];
  const warnings: string[] = [];
  for (const file of entries.sort()) {
    try {
      quizzes.push(parseQuizFile(join(dir, file)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`${file}: ${message}`);
    }
  }

  const excludedNote =
    warnings.length > 0
      ? `, excluded ${warnings.length} malformed file(s): ${warnings.join("; ")}`
      : "";
  const summary = `[menhir] loaded ${quizzes.length} quiz${quizzes.length === 1 ? "" : "zes"}${excludedNote}`;

  return { quizzes, warnings, summary };
}
