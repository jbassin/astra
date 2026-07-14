/** Shared tiny text helpers for the render layer (kept dependency-free/pure so
 * every render module — nodes/statblock/facetHeader/traits — can share one
 * definition instead of re-deriving it). */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** `"fooBarBaz"` -> "Foo Bar Baz" — a best-effort humanizer for facet keys
 * whose real display label the corpus doesn't carry (only AoN/Foundry's own
 * internal field name does). A small override table catches the common
 * PF2e-specific acronyms a naive splitter would mangle (`ac` -> "Ac"). */
const KEY_OVERRIDES: Readonly<Record<string, string>> = {
  ac: "AC",
  hp: "HP",
  dc: "DC",
};

export function humanizeFacetKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => KEY_OVERRIDES[w.toLowerCase()] ?? capitalize(w)).join(" ");
}
