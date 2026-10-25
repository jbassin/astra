// Tag helpers: every tag is `kind:value` (or bare); expandTag yields both the full
// tag and its kind so a query can match either.

export function expandTag(tag: string): string[] {
  const colon = tag.indexOf(":");
  if (colon === -1) return [tag];
  return [tag, tag.slice(0, colon)];
}
