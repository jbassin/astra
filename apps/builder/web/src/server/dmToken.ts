// The DM page's gate: the `/dm/<token>` path segment must equal the `builder.dm-token` secret.
// A wrong, missing or unset token gets the same plain 404, so the page never shows it exists.

import { safeEqual } from "@astra/service-kit";

/** Whether `given` matches the configured token. An unset or blank token matches nothing. */
export function dmTokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!expected?.trim() || !given) return false;
  return safeEqual(given, expected);
}
