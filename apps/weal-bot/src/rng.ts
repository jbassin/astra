/**
 * The flavor-line RNG seam (spec 0032 D32-14). The v1 roller owned the bot's only
 * RNG surface; with rolls moved into `@astra/weal-engine` (entropy = the 32-byte
 * seed), the bot's remaining randomness is picking flavor lines — this is that
 * surface, injectable so the handler suite stays deterministic.
 */

export interface FlavorRng {
  /** Uniform choice from a non-empty array. */
  choose<T>(xs: readonly T[]): T;
}

/** Production RNG (flavor lines are cosmetic — Math.random is plenty). */
export class EntropyRng implements FlavorRng {
  choose<T>(xs: readonly T[]): T {
    return xs[Math.floor(Math.random() * xs.length)] as T;
  }
}
