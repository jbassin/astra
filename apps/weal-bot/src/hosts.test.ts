/**
 * Flavor-line selection: hostSays takes the ENGINE's goodness directly (spec
 * 0032 D32-14 — the v1 thirds math is gone) and draws from the right ontology
 * bank, reading the real GSR lines (K8). Null goodness → the okay bank.
 */

import { loadBeing, type WealHost } from "@astra/ontology";
import { expect, test } from "vitest";

import { hostSays } from "./hosts";
import type { FlavorRng } from "./rng";

/** Deterministic RNG: always picks the first element. */
const firstRng: FlavorRng = { choose: <T>(xs: readonly T[]) => xs[0] as T };

const gsr = loadBeing().weal_hosts.find((h: WealHost) => h.slug === "gsr");
if (gsr === undefined) throw new Error("gsr host missing from ontology");

test("gsr has populated banks; knife is bankless", () => {
  expect(gsr.lines.crit.length).toBeGreaterThan(0);
  const knife = loadBeing().weal_hosts.find((h: WealHost) => h.slug === "knife");
  expect(knife?.lines.crit).toEqual([]);
});

test("crit goodness → a GSR crit line", () => {
  const { host, line } = hostSays(gsr, "crit", firstRng);
  expect(host.slug).toBe("gsr");
  expect(line).toBe(gsr.lines.crit[0] as string);
});

test("fumble goodness → a GSR fumble line", () => {
  const { line } = hostSays(gsr, "fumble", firstRng);
  expect(line).toBe(gsr.lines.fumble[0] as string);
});

test("null goodness draws from the okay bank (D32-11)", () => {
  const { line } = hostSays(gsr, null, firstRng);
  expect(line).toBe(gsr.lines.okay[0] as string);
});

test("an empty bank yields an empty line, not a throw", () => {
  const bankless: WealHost = {
    slug: "knife",
    name: "Knife-That-Teaches",
    color: "#CFBDDE",
    avatar: "",
    lines: { crit: [], good: [], okay: [], bad: [], fumble: [] },
  };
  expect(hostSays(bankless, "crit", firstRng).line).toBe("");
});
