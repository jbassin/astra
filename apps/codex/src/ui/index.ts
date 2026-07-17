/**
 * D29-46 — codex's own `src/ui/` component set, replacing the gothic lib
 * entirely (R6). One barrel export so every call site's import list changes
 * ONLY its module specifier (the old gothic package name -> `"@/ui"`),
 * matching the exact prop-signature parity the spec requires.
 */
export { Button } from "./Button";
export { EditionIcon, type Edition } from "./EditionIcon";
export { ErrorChip } from "./ErrorChip";
export { Input } from "./Input";
export { TraitPill } from "./TraitPill";
export { ActionGlyph, normalizeActionCost, type ActionCost } from "./actionGlyph";
