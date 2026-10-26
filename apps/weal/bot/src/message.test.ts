/**
 * Pure builders: defensive truncation at Discord's
 * exact limits, the error-reply fence/caret helpers, and the overlay payload.
 */

import type { WealDieDisplay } from "@astra/weal-engine";
import { describe, expect, test } from "vitest";

import {
  DESCRIPTION_LIMIT,
  dieFooter,
  ENGINE_FAULT_LINE,
  dieTitle,
  errorDescription,
  FIELD_LIMIT,
  fenced,
  overlayPayload,
  resultsField,
  saveRefusal,
  spanExcerpt,
  TITLE_LIMIT,
  trimContent,
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

describe("defensive truncation (at the exact limit)", () => {
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
    // the trailing plain value is replaced by the backticked one
    expect(resultsField(dieDisplay())).toEqual(["Results", "d20 ⟪14⟫ + 7 = `21`"]);
  });

  test("a renderText without the headline tail falls back to the naive append", () => {
    const display = dieDisplay({ renderText: "d20 ⟪14⟫ + 7", headline: "21" });
    expect(resultsField(display)).toEqual(["Results", "d20 ⟪14⟫ + 7 = `21`"]);
  });
});

describe("goodness presentation", () => {
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

describe("error-reply helpers", () => {
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

  test("a line wider than 100 columns is cut to a window around the span", () => {
    const line = `${"(".repeat(300)}1${")".repeat(300)}`;
    const [shown, carets] = spanExcerpt(line, { start: 256, end: 260 }).split("\n");
    expect(shown).toBe(`…${"(".repeat(84)}1${")".repeat(15)}…`);
    expect(carets).toBe(`${" ".repeat(41)}^^^^`);
    // Near the start nothing is cut before the span.
    expect(spanExcerpt(line, { start: 2, end: 3 })).toBe(`${"(".repeat(100)}…\n  ^`);
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

describe("saveRefusal (the save guard's reply)", () => {
  test("an engine fault says so, without the engine's detail", () => {
    const reply = saveRefusal("Jorge", "atk", "let f() = d20; f", {
      kind: "use",
      probe: "atk + 1",
      error: {
        ok: false,
        stage: "internal",
        message: "engine trap: unreachable",
        span: null,
        preludeName: null,
      },
      shadowsBuiltin: false,
    });
    expect(reply.title).toBe("atk not saved");
    expect(reply.contents).toBe(
      [
        "nope jorge, i won't remember `atk` — using it (`atk + 1`) trips a bug in the dice engine:",
        ENGINE_FAULT_LINE,
      ].join("\n"),
    );
  });

  const typeError = {
    ok: false,
    stage: "type",
    message: "boom",
    span: null,
    preludeName: null,
  } as const;

  test("an ordinary refusal carries no hints", () => {
    const reply = saveRefusal("Jorge", "bonus", "3", {
      kind: "rolls",
      probe: "d20",
      error: typeError,
      shadowsBuiltin: false,
    });
    expect(reply.contents).toBe(
      "nope jorge, i won't remember `bonus` — with it saved, `d20` would break for everyone:\nboom",
    );
  });

  test("a huge name or error is clamped to Discord's title/description limits", () => {
    const reply = saveRefusal("Jorge", "x".repeat(300), "3", {
      kind: "use",
      probe: "x + 1",
      error: { ...typeError, message: "y".repeat(5000) },
      shadowsBuiltin: false,
    });
    expect(reply.title).toHaveLength(TITLE_LIMIT);
    expect(reply.contents).toHaveLength(DESCRIPTION_LIMIT);
  });
});

describe("overlayPayload", () => {
  test("numeric rolls keep the wire shape; expression = plain source", () => {
    expect(overlayPayload("Jorge", "d20 + 7", dieDisplay())).toEqual({
      v: 1,
      user: "Jorge",
      expression: "d20 + 7",
      total: 21,
      is_crit: false,
      is_fumble: false,
      display: "21",
    });
  });

  test("atom rolls send total 0 with goodness-derived flags", () => {
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
      is_crit: true,
      is_fumble: false,
      display: ":great",
    });
  });
});

describe("trimContent (fence stripping)", () => {
  test("a pasted save confirmation (a ```weal fence) becomes its source", () => {
    expect(trimContent("```weal\n|| kh(pool(2, d20), 1)\n```")).toBe("|| kh(pool(2, d20), 1)");
  });

  test("any one-word language tag is stripped; ocaml still is", () => {
    expect(trimContent("```ocaml\nd20 + 7\n```")).toBe("d20 + 7");
    expect(trimContent("```js\r\nd20\n```")).toBe("d20");
    expect(trimContent("```ocaml d20```")).toBe("d20");
  });

  test("fenced code without a tag keeps its first line", () => {
    expect(trimContent("```\nd20\n```")).toBe("d20");
    expect(trimContent("```d20 + 1```")).toBe("d20 + 1");
    expect(trimContent("```let x = 1;\nx```")).toBe("let x = 1;\nx");
  });

  test("an unfenced first word on its own line is not a tag", () => {
    expect(trimContent("adv\n+ 1")).toBe("adv\n+ 1");
  });
});
