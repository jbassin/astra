import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Whether two secrets (tokens, keys, signatures) are equal, in time that depends on
 * neither their contents nor their lengths. Both sides are hashed to 32 bytes first, so
 * `timingSafeEqual` always compares equal-length buffers and a length mismatch leaks
 * nothing. Use it for every comparison where one side is secret; never `===`.
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}
