/**
 * Host flavor-line selection. Host identities **and** flavor lines live in the
 * ontology (`ontology-being` `weal-host`, per 0009 K8); this module is the pure
 * "given a goodness + a host, pick a flavor line" logic the handler calls.
 *
 * Goodness is computed **by the engine** now (spec 0032 D32-11: in-engine from
 * the face-order vector; `null` = one-face support / non-die display → the okay
 * bank, no tag). The v1 `goodnessOf`/`invertGoodness` thirds math is deleted
 * with the v1 roller.
 *
 * Faithful to faerrin: `hostSays` only ever speaks as **GSR** today. The host
 * is an explicit parameter, so a future host switch is a caller/ontology
 * change, not a code change — the Rex/Els/Whiskers banks already ride along in
 * the ontology, ready for it.
 */

import type { WealHost } from "@astra/ontology";
import type { WealGoodness } from "@astra/weal-engine";

import type { FlavorRng } from "./rng";

/**
 * Pick a flavor line for the roll's goodness from `host`'s ontology banks.
 * `null` goodness draws from the okay bank (D32-11).
 */
export function hostSays(
  host: WealHost,
  goodness: WealGoodness | null,
  rng: FlavorRng,
): { host: WealHost; line: string } {
  const bank = host.lines[goodness ?? "okay"];
  return { host, line: bank.length > 0 ? rng.choose(bank) : "" };
}
