import { describe, expect, it } from "vitest";

import { fromStates, hit, isTriggered, pick, reset, statesOf } from "./shatter-state";

const ids = ["a", "b", "c", "d", "e", "f"];
/** A fixed random source: always 0, so the shuffle is deterministic. */
const zero = () => 0;

describe("pick", () => {
  it("picks four of six and needs three", () => {
    const round = pick(ids, Math.random);
    expect(round.shimmering).toHaveLength(4);
    expect(new Set(round.shimmering).size).toBe(4);
    expect(round.shimmering.every((id) => ids.includes(id))).toBe(true);
    expect(round.shattered).toEqual([]);
    expect(round.needed).toBe(3);
  });

  it("is deterministic for a given random source", () => {
    expect(pick(ids, zero)).toEqual(pick(ids, zero));
  });

  it("picks every eligible arm when fewer than four are eligible", () => {
    const round = pick(["a", "b"], Math.random);
    expect([...round.shimmering].toSorted()).toEqual(["a", "b"]);
    expect(round.needed).toBe(2);
  });

  it("picks nothing and never triggers when no arm is eligible", () => {
    const round = pick([], Math.random);
    expect(round.shimmering).toEqual([]);
    expect(round.needed).toBe(0);
    expect(isTriggered(round)).toBe(false);
  });

  it("ignores duplicate ids", () => {
    expect(pick(["a", "a", "b"], zero).shimmering).toHaveLength(2);
  });
});

describe("hit", () => {
  const start = pick(ids, zero);

  it("shatters a shimmering arm", () => {
    const arm = start.shimmering[0] as string;
    const result = hit(start, arm);
    expect(result.shattered).toBe(true);
    expect(result.triggered).toBe(false);
    expect(result.round.shattered).toEqual([arm]);
    expect(result.round.shimmering).not.toContain(arm);
  });

  it("does nothing for an arm that is not shimmering", () => {
    const outside = ids.find((id) => !start.shimmering.includes(id)) as string;
    expect(hit(start, outside).round).toBe(start);
    expect(hit(start, "nope").shattered).toBe(false);
    const arm = start.shimmering[0] as string;
    const once = hit(start, arm).round;
    expect(hit(once, arm).shattered).toBe(false);
  });

  it("triggers on the third shatter and releases the arm still shimmering", () => {
    const [a, b, c, d] = start.shimmering as [string, string, string, string];
    const round = hit(hit(start, a).round, b).round;
    const last = hit(round, c);
    expect(last.triggered).toBe(true);
    expect(last.released).toEqual([d]);
    expect(last.round.shimmering).toEqual([]);
    expect(last.round.shattered).toEqual([a, b, c]);
    expect(isTriggered(last.round)).toBe(true);
  });

  it("shatters every arm in the fight on the trigger", () => {
    const [a = "", b = "", c = "", d = ""] = start.shimmering;
    const round = hit(hit(start, a, ids).round, b, ids).round;
    expect(round.shattered).toEqual([a, b]);
    const last = hit(round, c, ids);
    expect(last.triggered).toBe(true);
    expect(last.released).toEqual([d]);
    expect(last.round.shimmering).toEqual([]);
    expect(last.round.shattered.slice(0, 3)).toEqual([a, b, c]);
    expect(new Set(last.round.shattered)).toEqual(new Set(ids));
    expect(last.round.shattered).toHaveLength(ids.length);
    expect(isTriggered(fromStates(statesOf(last.round, ids)))).toBe(true);
  });

  it("ignores hits after the threshold until reset", () => {
    const [a, b, c, d] = start.shimmering as [string, string, string, string];
    const done = hit(hit(hit(start, a).round, b).round, c).round;
    expect(hit(done, d).round).toBe(done);
    expect(hit(done, d).triggered).toBe(false);
    expect(hit(reset(), d).shattered).toBe(false);
  });

  it("triggers on the second hit when only two arms were picked", () => {
    const two = pick(["a", "b"], zero);
    const result = hit(hit(two, "a").round, "b");
    expect(result.triggered).toBe(true);
    expect(result.released).toEqual([]);
  });
});

describe("reset and states", () => {
  it("reset leaves every arm normal", () => {
    expect([...statesOf(reset(), ids).values()].every((s) => s === undefined)).toBe(true);
  });

  it("round-trips through the per-arm states", () => {
    const picked = pick(ids, zero);
    const round = hit(picked, picked.shimmering[0] as string).round;
    const back = fromStates(statesOf(round, ids));
    expect([...back.shimmering].toSorted()).toEqual([...round.shimmering].toSorted());
    expect(back.shattered).toEqual(round.shattered);
    expect(back.needed).toBe(3);
  });

  it("caps resumed needed at the arms in play", () => {
    const states = new Map([
      ["a", "shimmer" as const],
      ["b", "shattered" as const],
      ["c", undefined],
    ]);
    expect(fromStates(states).needed).toBe(2);
  });
});
