import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { must } from "../src/assert";
import { loadQuizzes, parseQuizFile } from "../src/quizzes";

const GOOD_KDL = `
quiz "A Fine Quiz" {
    question "2 + 2?" time=15 {
        option "3"
        option "4" correct=#true
    }
}
`;

const MALFORMED_NO_CORRECT = `
quiz "Broken Quiz" {
    question "no right answer here" {
        option "A"
        option "B"
    }
}
`;

function tmpQuizzesDir(): string {
  return mkdtempSync(join(tmpdir(), "menhir-quizzes-"));
}

test("a well-formed quiz file parses to a validated Quiz", () => {
  const dir = tmpQuizzesDir();
  writeFileSync(join(dir, "fine.kdl"), GOOD_KDL);
  const quiz = parseQuizFile(join(dir, "fine.kdl"));
  expect(quiz.id).toBe("fine");
  expect(quiz.title).toBe("A Fine Quiz");
  expect(quiz.questions).toHaveLength(1);
  expect(quiz.questions[0]).toMatchObject({
    text: "2 + 2?",
    time: 15,
    options: [
      { label: "3", correct: false },
      { label: "4", correct: true },
    ],
  });
});

test("a quiz missing exactly-one-correct is malformed and excluded, not thrown at loadQuizzes", () => {
  const dir = tmpQuizzesDir();
  writeFileSync(join(dir, "fine.kdl"), GOOD_KDL);
  writeFileSync(join(dir, "broken.kdl"), MALFORMED_NO_CORRECT);

  const { quizzes, warnings, summary } = loadQuizzes(dir);
  expect(quizzes).toHaveLength(1);
  expect(must(quizzes[0], "quizzes[0]").id).toBe("fine");
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("broken.kdl");
  expect(summary).toContain("loaded 1 quiz");
  expect(summary).toContain("excluded 1 malformed file");
});

test("parseQuizFile throws on the malformed file directly (loadQuizzes is what catches it)", () => {
  const dir = tmpQuizzesDir();
  writeFileSync(join(dir, "broken.kdl"), MALFORMED_NO_CORRECT);
  expect(() => parseQuizFile(join(dir, "broken.kdl"))).toThrow();
});

test("the shipped starter quiz (D31-4) loads cleanly with 5 questions", () => {
  const dir = join(import.meta.dirname, "..", "quizzes");
  const { quizzes, warnings } = loadQuizzes(dir);
  expect(warnings).toEqual([]);
  expect(quizzes.length).toBeGreaterThanOrEqual(1);
  const starter = must(
    quizzes.find((q) => q.id === "the-undercroft-opener"),
    "starter quiz 'the-undercroft-opener'",
  );
  expect(starter.questions).toHaveLength(5);
  for (const q of starter.questions) {
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options.length).toBeLessThanOrEqual(4);
    expect(q.options.filter((o) => o.correct)).toHaveLength(1);
  }
});
