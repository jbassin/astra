/**
 * Host selection + roll-goodness — TS port of faerrin's `discord/src/goodness.rs` and
 * the `host_says` selection in `host.rs`. Host identities **and** flavor lines live in
 * the ontology (`ontology-being` `weal-host`, per 0009 K8); this module is the pure
 * "given a roll + a host, pick a flavor line" logic the gateway calls.
 *
 * Faithful to faerrin: `host_says` only ever speaks as **GSR** today (the Rust
 * `Distribution<HostPicker>` was hardcoded). Here the host is an explicit parameter, so
 * a future host switch is a caller/ontology change, not a code change — the Rex/Els/
 * Whiskers banks already ride along in the ontology, ready for it.
 */

import type { WealHost } from "@astra/ontology";
import { type Roll, type RollRng, rollMax, rollMin, rollValue } from "./roller";

export type RollGoodness = "crit" | "good" | "okay" | "bad" | "fumble";

/**
 * `RollGoodness::from(&Rollable)` — exact thirds of `[min, max]` with **integer**
 * division (Rust `isize`). value==min → fumble, value==max → crit, else thirds.
 */
export function goodnessOf(value: number, min: number, max: number): RollGoodness {
  if (value === min) return "fumble";
  if (value === max) return "crit";
  const normValue = value - min;
  const normMax = max - min;
  if (normValue < Math.trunc(normMax / 3)) return "bad";
  if (normValue > Math.trunc(normMax / 3) * 2) return "good";
  return "okay";
}

/** `RollGoodness::invert` — ported for fidelity (faerrin keeps it on `goodness.rs`). */
export function invertGoodness(g: RollGoodness): RollGoodness {
  switch (g) {
    case "crit":
      return "fumble";
    case "good":
      return "bad";
    case "okay":
      return "okay";
    case "bad":
      return "good";
    case "fumble":
      return "crit";
  }
}

export function rollGoodness(roll: Roll): RollGoodness {
  return goodnessOf(rollValue(roll), rollMin(roll), rollMax(roll));
}

/**
 * `host_says` — pick a flavor line for the roll's goodness from `host`'s ontology banks.
 * Callers pass the GSR host today (faithful to faerrin); `host` is a swappable input.
 */
export function hostSays(
  host: WealHost,
  roll: Roll,
  rng: RollRng,
): { host: WealHost; line: string } {
  const bank = host.lines[rollGoodness(roll)];
  return { host, line: bank.length > 0 ? rng.choose(bank) : "" };
}
