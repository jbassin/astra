/** Tiny className joiner — drops falsy parts, joins with a space. Codex's own
 * copy (D29-46 — codex no longer depends on the gothic lib, which had the
 * identical helper). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
