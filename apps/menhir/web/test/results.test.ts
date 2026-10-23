import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { must } from "../src/assert";
import { appendResultRow } from "../src/results";
import type { ResultRow } from "../src/schema";

const ROW: ResultRow = {
  at: "2026-07-27T00:00:00.000Z",
  quizId: "test-quiz",
  quizTitle: "Test Quiz",
  questionCount: 2,
  aborted: false,
  standings: [{ name: "Alice", score: 1850 }],
};

test("appends one JSONL line per call, creating the parent dir if needed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "menhir-results-"));
  const path = join(dir, "nested", "results.jsonl");

  await appendResultRow(path, ROW);
  await appendResultRow(path, { ...ROW, quizId: "test-quiz-2" });

  const lines = readFileSync(path, "utf8").trim().split("\n");
  expect(lines).toHaveLength(2);
  expect(JSON.parse(must(lines[0], "line 0"))).toEqual(ROW);
  expect(JSON.parse(must(lines[1], "line 1")).quizId).toBe("test-quiz-2");
});

test("a write failure is fail-soft — never throws", async () => {
  // A path whose "directory" is actually a file can never be created/written —
  // this must resolve, not reject, per D31-10 (a quiz-typo-adjacent outage must
  // not crash the game).
  const dir = mkdtempSync(join(tmpdir(), "menhir-results-badpath-"));
  const blocker = join(dir, "not-a-dir");
  writeFileSync(blocker, "x");
  await expect(appendResultRow(join(blocker, "results.jsonl"), ROW)).resolves.toBeUndefined();
});
