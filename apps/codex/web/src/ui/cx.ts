/** Tiny className joiner — drops falsy parts, joins with a space. Codex's own
 * copy (codex doesn't depend on the gothic lib, which has the identical
 * helper). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
