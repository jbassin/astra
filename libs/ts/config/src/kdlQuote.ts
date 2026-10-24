/**
 * `kdlQuote`, the one escaper for writers that insert KDL text by hand. It imports
 * nothing, so browser code takes it from `@astra/config/kdl-quote` without pulling the
 * Node-only config loader into a client bundle. Twin of `astra_config.kdl.kdl_quote`.
 */

const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/** A KDL v2 quoted string. Escapes `\`, `"` and every control character, since a
 * single-line KDL string may not hold a literal newline. */
export function kdlQuote(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const escaped = ESCAPES[ch];
    if (escaped !== undefined) out += escaped;
    else if (code < 0x20 || code === 0x7f) out += `\\u{${code.toString(16)}}`;
    else out += ch;
  }
  return `"${out}"`;
}
