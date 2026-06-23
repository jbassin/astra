import { describe, expect, test } from "bun:test";
import { MAX_BASE } from "../db";
import { keepDieRow } from "./migrate";

// Only the pure junk-filter predicate is CI-tested; the migration itself needs a
// live Postgres + the sqlite source (run at the cutover), mirroring orator's migrator.
describe("keepDieRow (the roll-history junk filter)", () => {
  test("keeps real polyhedral dice (base ≤ MAX_BASE)", () => {
    expect(keepDieRow(20)).toBe(true);
    expect(keepDieRow(4)).toBe(true);
    expect(keepDieRow(MAX_BASE)).toBe(true); // boundary
  });

  test("drops novelty/junk dice (base > MAX_BASE) and non-positive bases", () => {
    expect(keepDieRow(MAX_BASE + 1)).toBe(false);
    expect(keepDieRow(10000)).toBe(false);
    expect(keepDieRow(0)).toBe(false);
    expect(keepDieRow(-1)).toBe(false);
  });

  test("rejects non-integers (defensive against a dirty source)", () => {
    expect(keepDieRow(20.5)).toBe(false);
    expect(keepDieRow(Number.NaN)).toBe(false);
  });
});
