import { describe, expect, it } from "vitest";

import {
  type AnyPass,
  type PassContext,
  definePass,
  passClosure,
  runPasses,
  validatePasses,
} from "./passRegistry";
import { TRANSFORM_PASSES } from "./transform";

interface Slots {
  a: number;
  b: number;
  c: number;
}

const pass = definePass<Slots, PassContext>();

const writeA = pass({
  name: "write-a",
  phase: "parse",
  summary: "a = 1",
  reads: [],
  writes: ["a"],
  run: () => ({ a: 1 }),
});
const aToB = pass({
  name: "a-to-b",
  phase: "build",
  summary: "b = a + 1",
  reads: ["a"],
  writes: ["b"],
  run: ({ a }) => ({ b: a + 1 }),
  counts: ({ b }) => ({ b }),
});
const bToC = pass({
  name: "b-to-c",
  phase: "build",
  summary: "c = b * 10",
  reads: ["b"],
  writes: ["c"],
  run: ({ b }) => ({ c: b * 10 }),
});

function ctx(hardFailures = 0): PassContext {
  return { reportEventCount: () => 0, hardFailureCount: () => hardFailures };
}

function problemsOf(passes: AnyPass<Slots, PassContext>[]): string {
  try {
    validatePasses(passes);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
}

describe("validatePasses", () => {
  it("accepts a registry whose reads all come from earlier passes", () => {
    expect(problemsOf([writeA, aToB, bToC])).toBe("");
  });

  it("rejects a duplicate pass name", () => {
    expect(problemsOf([writeA, aToB, { ...bToC, name: "a-to-b" }])).toMatch(
      /duplicate pass name "a-to-b"/,
    );
  });

  it("rejects a slot with two writers", () => {
    expect(problemsOf([writeA, aToB, { ...bToC, writes: ["b"] }])).toMatch(
      /slot "b" is written by both "a-to-b" and "b-to-c"/,
    );
  });

  it("rejects a read that no pass writes", () => {
    expect(problemsOf([aToB, bToC])).toMatch(/pass "a-to-b" reads "a", which no pass writes/);
  });

  it("rejects a dependency cycle and names it", () => {
    const cyclicA = { ...writeA, phase: "build" as const, reads: ["c" as const] };
    expect(problemsOf([cyclicA, aToB, bToC])).toMatch(
      /dependency cycle: write-a -> b-to-c -> a-to-b -> write-a/,
    );
  });

  it("rejects a pass placed before the pass it reads from", () => {
    expect(problemsOf([writeA, bToC, aToB])).toMatch(
      /pass "b-to-c" reads "b" before "a-to-b" writes it/,
    );
  });

  it("rejects a parse pass after a build pass", () => {
    expect(problemsOf([writeA, aToB, { ...bToC, phase: "parse" }])).toMatch(
      /parse pass "b-to-c" comes after the first build pass/,
    );
  });

  it("accepts the transform registry", () => {
    expect(() => validatePasses(TRANSFORM_PASSES)).not.toThrow();
  });
});

describe("passClosure", () => {
  it("keeps the target and what it reads from, in registry order", () => {
    expect(passClosure([writeA, aToB, bToC], "a-to-b").map((p) => p.name)).toEqual([
      "write-a",
      "a-to-b",
    ]);
  });

  it("throws on an unknown pass", () => {
    expect(() => passClosure([writeA], "nope")).toThrow(/unknown pass "nope"/);
  });
});

describe("runPasses", () => {
  it("threads slots through the passes and records each run", () => {
    const { state, runs, halted } = runPasses([writeA, aToB, bToC], ctx());
    expect(state).toEqual({ a: 1, b: 2, c: 20 });
    expect(halted).toBe(false);
    expect(runs.map((r) => r.name)).toEqual(["write-a", "a-to-b", "b-to-c"]);
    expect(runs[1]?.counts).toEqual({ b: 2 });
  });

  it("hands a pass only the slots it declares", () => {
    let seen: string[] = [];
    const spy = pass({
      name: "spy",
      phase: "build",
      summary: "records its input",
      reads: ["b"],
      writes: ["c"],
      run: (input) => {
        seen = Object.keys(input);
        return { c: 0 };
      },
    });
    runPasses([writeA, aToB, spy], ctx());
    expect(seen).toEqual(["b"]);
  });

  it("rejects output that does not match the declared writes", () => {
    const liar = pass({
      name: "a-to-b",
      phase: "build",
      summary: "writes an undeclared slot",
      reads: ["a"],
      writes: ["b"],
      run: () => ({ b: 1, c: 2 }),
    });
    expect(() => runPasses([writeA, liar], ctx())).toThrow(
      /pass "a-to-b" wrote \[b, c\] but declares \[b\]/,
    );
  });

  it("stops before the build phase when a parse pass recorded a hard failure", () => {
    const { state, runs, halted } = runPasses([writeA, aToB, bToC], ctx(1));
    expect(halted).toBe(true);
    expect(runs.map((r) => r.name)).toEqual(["write-a"]);
    expect(state).toEqual({ a: 1 });
  });
});
