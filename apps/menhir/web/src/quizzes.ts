/**
 * KDL → Zod quiz loader. Decoded by `@astra/config` `decodeKdl`, resolved off
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
import { readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { decodeKdl, kdl, loadKdl } from "@astra/config";
import { z } from "zod";

import { QuizSchema, type Quiz } from "./schema";

// Where each quiz field sits in the KDL, for the shared decoder. Values are checked by
// `QuizSchema` (the wire contract, which stays free of KDL so the SPA can import it).
const OptionNode = z
  .object({
    label: kdl.arg(z.string()),
    correct: kdl.prop(z.boolean().default(false)),
  })
  .strict();

const QuestionNode = z
  .object({
    text: kdl.arg(z.string()),
    time: kdl.prop(z.number().default(20)),
    options: kdl.children(z.array(OptionNode), "option"),
  })
  .strict();

const QuizNode = z
  .object({
    title: kdl.arg(z.string()),
    questions: kdl.children(z.array(QuestionNode), "question"),
  })
  .strict();

const QuizFile = z.object({ quiz: QuizNode });

/** Parse + Zod-validate a single quiz file. Throws on any malformed content (a
 * `KdlDecodeError` names the node) — callers catch this per-file so one bad quiz
 * doesn't sink the whole listing. */
export function parseQuizFile(filePath: string): Quiz {
  const id = basename(filePath, extname(filePath));
  const { quiz } = decodeKdl(QuizFile, loadKdl(filePath));
  return QuizSchema.parse({ id, ...quiz });
}

interface QuizLoadResult {
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
