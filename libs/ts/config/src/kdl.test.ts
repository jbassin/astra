// The shared typed KDL decoder (`./kdl`): field markers, required-field errors that name
// the node path, strictness, and the `kdlQuote` escaper. Twin of libs/py/config
// tests/test_kdl.py.
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { decodeKdl, KdlDecodeError, kdl, kdlQuote, parseKdl } from "./kdl";
import { SecretRef } from "./secrets";

const Option = z
  .object({
    label: kdl.arg(z.string()),
    correct: kdl.prop(z.boolean().default(false)),
  })
  .strict();

const Question = z
  .object({
    text: kdl.arg(z.string()),
    time: kdl.prop(z.number().default(20)),
    options: kdl.children(z.array(Option), "option"),
  })
  .strict();

const Settings = z
  .object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    token: z.instanceof(SecretRef).nullish(),
  })
  .strict();

const Doc = z
  .object({
    settings: Settings,
    questions: kdl.children(z.array(Question).default([]), "question"),
  })
  .strict();

const decode = (text: string) => decodeKdl(Doc, parseKdl(text, "test.kdl"));

describe("decodeKdl", () => {
  test("markers map args, props, children and leaves", () => {
    const doc = decode(`
      settings {
        title "Quiz"
        tags "a"
        token ref="sops:QUIZ_TOKEN"
      }
      question "Two?" time=30 {
        option "yes" correct=#true
        option "no"
      }
    `);
    expect(doc.settings.title).toBe("Quiz");
    expect(doc.settings.tags).toEqual(["a"]); // a list field takes the args even when one
    expect(doc.settings.token).toBeInstanceOf(SecretRef);
    expect(doc.settings.token?.configKey).toBe("settings.token");
    expect(doc.questions).toEqual([
      {
        text: "Two?",
        time: 30,
        options: [
          { label: "yes", correct: true },
          { label: "no", correct: false },
        ],
      },
    ]);
  });

  test("a missing required child names the node path, never undefined", () => {
    const run = () => decode('settings {\n  tags "a"\n}\n');
    expect(run).toThrow(KdlDecodeError);
    expect(run).toThrow(/^test\.kdl: settings > title: missing/);
    expect(run).not.toThrow(/undefined/);
  });

  test("a missing required arg names the node path", () => {
    const text = 'settings {\n  title "t"\n}\nquestion "Q" {\n  option correct=#true\n}\n';
    expect(() => decode(text)).toThrow(/test\.kdl: question "Q" > option: argument 0: missing/);
  });

  test("a bare leaf is not the string undefined", () => {
    expect(() => decode("settings {\n  title\n}\n")).toThrow(/settings > title: /);
  });

  test("a wrong type names the property", () => {
    const text = 'settings {\n  title "t"\n}\nquestion "Q" time="soon"\n';
    expect(() => decode(text)).toThrow(/question "Q": property time=/);
  });

  test("strict objects reject unknown nodes, props and args", () => {
    expect(() => decode('settings {\n  title "t"\n  colour "red"\n}\n')).toThrow(
      /settings > colour "red": unknown node/,
    );
    expect(() => decode('settings {\n  title "t"\n}\nquestion "Q" shape="x"\n')).toThrow(
      /unknown property shape=/,
    );
    expect(() => decode('settings {\n  title "t"\n}\nquestion "Q" "extra"\n')).toThrow(
      /2 arguments; expected 1/,
    );
  });

  test("a repeated single child is rejected", () => {
    expect(() => decode('settings {\n  title "a"\n  title "b"\n}\n')).toThrow(
      /settings > title.*repeated/,
    );
  });

  test("a non-strict object ignores unknown nodes", () => {
    const Loose = z.object({ title: z.string() });
    expect(decodeKdl(Loose, parseKdl('title "t"\nother 1\n')).title).toBe("t");
  });

  test("camelCase fields read kebab-case nodes", () => {
    const S = z.object({ bindAddr: z.string(), max_iterations: z.number() });
    const out = decodeKdl(S, parseKdl('bind-addr "x"\nmax-iterations 3\n'));
    expect(out).toEqual({ bindAddr: "x", max_iterations: 3 });
  });
});

describe("kdlQuote", () => {
  test.each(["plain", 'back\\slash "quoted"', "two\nlines\ttab\r", "\u0001"])(
    "round-trips %j",
    (value) => {
      const quoted = kdlQuote(value);
      expect(quoted).not.toContain("\n");
      const One = z.object({ v: z.string() });
      expect(decodeKdl(One, parseKdl(`v ${quoted}\n`)).v).toBe(value);
    },
  );
});
