/**
 * Pure builders (spec 0032 D32-15/D32-18): defensive truncation at Discord's
 * exact limits, the error-reply fence/caret helpers, and the overlay payload.
 */

import type { WealDieDisplay } from "@astra/weal-engine";
import { describe, expect, test } from "vitest";

import {
  dieFooter,
  dieTitle,
  errorDescription,
  FIELD_LIMIT,
  fenced,
  overlayPayload,
  resultsField,
  spanExcerpt,
  TITLE_LIMIT,
  truncate,
} from "./message";

function dieDisplay(over: Partial<WealDieDisplay> = {}): WealDieDisplay {
  return {
    kind: "die",
    renderText: "d20 ⟪14⟫ + 7 = 21",
    headline: "21",
    value: { t: "num", v: "21" },
    goodness: "good",
    standardDice: [[20, 14]],
    ...over,
  };
}

describe("defensive truncation (D32-15 boundary)", () => {
  test("truncate leaves strings at the limit untouched", () => {
    const exact = "x".repeat(100);
    expect(truncate(exact, 100)).toBe(exact);
  });

  test("truncate clamps one-past-the-limit to exactly the limit, ellipsis-terminated", () => {
    const over = "x".repeat(101);
    const clamped = truncate(over, 100);
    expect(clamped).toHaveLength(100);
    expect(clamped.endsWith("…")).toBe(true);
  });

  test("a giant-Str-face headline clamps the title to Discord's 256", () => {
    const headline = `"${"A".repeat(500)}"`;
    const title = dieTitle("Argyle", headline, "crit");
    expect(title).toHaveLength(TITLE_LIMIT);
    expect(title.startsWith('Argyle: "A')).toBe(true);
    expect(title.endsWith("…")).toBe(true);
  });

  test("a giant renderText clamps the Results field to Discord's 1024", () => {
    const display = dieDisplay({ renderText: "x".repeat(2000) });
    const [name, value] = resultsField(display);
    expect(name).toBe("Results");
    expect(value).toHaveLength(FIELD_LIMIT);
    expect(value.endsWith("…")).toBe(true);
  });

  test("an in-limit title/field passes through exactly", () => {
    expect(dieTitle("Argyle", "21", "good")).toBe("Argyle: 21");
    // the trailing plain value is replaced by the backticked one (S7 clarification)
    expect(resultsField(dieDisplay())).toEqual(["Results", "d20 ⟪14⟫ + 7 = `21`"]);
  });

  test("a renderText without the headline tail falls back to the naive append", () => {
    const display = dieDisplay({ renderText: "d20 ⟪14⟫ + 7", headline: "21" });
    expect(resultsField(display)).toEqual(["Results", "d20 ⟪14⟫ + 7 = `21`"]);
  });
});

describe("goodness presentation (D32-15)", () => {
  test("crit/fumble tag the title; others (incl. null) don't", () => {
    expect(dieTitle("A", "20", "crit")).toBe("A: 20 [Crit!]");
    expect(dieTitle("A", "1", "fumble")).toBe("A: 1 [Fumble!]");
    expect(dieTitle("A", ":only", null)).toBe("A: :only");
  });

  test("footer takes the goodness word; null → okay", () => {
    expect(dieFooter("crit", 7, "Josh")).toBe("very good • 7 (from Josh, with love)");
    expect(dieFooter(null, 7, "Josh")).toBe("okay • 7 (by Josh)");
  });
});

describe("error-reply helpers (D32-14)", () => {
  test("spanExcerpt draws carets under the span", () => {
    expect(spanExcerpt("xyzzy + 1", { start: 0, end: 5 })).toBe("xyzzy + 1\n^^^^^");
    expect(spanExcerpt("4d7kq2", { start: 3, end: 5 })).toBe("4d7kq2\n   ^^");
  });

  test("a zero-width end-of-input span still draws one caret", () => {
    expect(spanExcerpt("1 +", { start: 3, end: 3 })).toBe("1 +\n   ^");
  });

  test("multi-line sources excerpt only the offending line", () => {
    expect(spanExcerpt("let x = 1;\nx + zap", { start: 15, end: 18 })).toBe("x + zap\n    ^^^");
  });

  test("fenced outruns any backtick run in the excerpt", () => {
    expect(fenced("plain")).toBe("```\nplain\n```");
    expect(fenced("a ``` b")).toBe("````\na ``` b\n````");
  });

  test("errorDescription excerpts the failing save for prelude errors", () => {
    const description = errorDescription(
      "d6",
      {
        stage: "prelude",
        message: "parse error",
        span: { start: 3, end: 3 },
        preludeName: "bad",
      },
      [["bad", "1 +"]],
    );
    expect(description).toBe("parse error\n```\n1 +\n   ^\n```\n(in bad)");
  });
});

describe("overlayPayload (D32-18)", () => {
  test("numeric rolls keep the v1 shape + display; expression = plain source", () => {
    expect(overlayPayload("Jorge", "d20 + 7", dieDisplay())).toEqual({
      v: 1,
      user: "Jorge",
      expression: "d20 + 7",
      total: 21,
      value: 21,
      is_crit: false,
      is_fumble: false,
      display: "21",
    });
  });

  test("atom rolls send total/value 0 with goodness-derived flags", () => {
    const display = dieDisplay({
      headline: ":great",
      value: { t: "atom", v: "great" },
      goodness: "crit",
      standardDice: [],
    });
    expect(overlayPayload("Jorge", "dl([:great])", display)).toEqual({
      v: 1,
      user: "Jorge",
      expression: "dl([:great])",
      total: 0,
      value: 0,
      is_crit: true,
      is_fumble: false,
      display: ":great",
    });
  });
});
