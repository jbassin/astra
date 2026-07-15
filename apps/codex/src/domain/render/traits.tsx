import type { ReactElement } from "react";

import { TraitPill } from "../../ui";
import { humanizeSlug } from "./text";

/**
 * D29-24: trait pills link to `/trait/{slug}` ONLY when that trait exists in
 * the corpus's `trait` category (907 entities, spec §2) — numeric qualifiers
 * like `reach-15` and other non-glossary tokens render as plain (unlinked)
 * pills. Corpus `traits[]` arrays already carry lowercase-hyphenated slugs
 * (verified against the real corpus — e.g. `magical`/`reach-15`/`centaur`),
 * the SAME form a `trait/<slug>` codex id uses, so membership is a direct
 * `trait/${token}` lookup — no `sluggify()` round-trip needed here.
 *
 * `knownTraitIds` is an injected `ReadonlySet<string>` (of full `trait/<slug>`
 * ids) so this stays pure/testable (D29-24's "design the trait-membership
 * input as an injected set" instruction) — S2 wires it from the real
 * `trait/_index.json` rows.
 */
export function traitHref(token: string): string {
  return `/trait/${token}`;
}

/** `reach-15` -> "Reach 15"; `deadly-d8` -> "Deadly D8"; `unarmed` -> "Unarmed".
 * The corpus has no separate trait display-name field on the token itself
 * (only the `trait` category's OWN entities carry a canonical `name`, keyed
 * by the very same slug) — this is a best-effort humanization for the common
 * case, not a canonical-name lookup. Delegates to `text.ts`'s shared
 * `humanizeSlug` (S3 factored the hyphen-split logic out so the category
 * directory/listing pages reuse it instead of a second copy). */
export function humanizeTraitToken(token: string): string {
  return humanizeSlug(token);
}

export function CodexTraitPill({
  token,
  knownTraitIds,
}: {
  token: string;
  knownTraitIds: ReadonlySet<string>;
}): ReactElement {
  const display = humanizeTraitToken(token);
  const id = `trait/${token}`;
  if (!knownTraitIds.has(id)) return <TraitPill name={display} />;
  return (
    <a
      href={traitHref(token)}
      data-crossref=""
      data-crossref-target={id}
      className="codex-trait-link"
    >
      <TraitPill name={display} />
    </a>
  );
}

export function CodexTraitPills({
  traits,
  knownTraitIds,
}: {
  traits: readonly string[];
  knownTraitIds: ReadonlySet<string>;
}): ReactElement | null {
  if (traits.length === 0) return null;
  return (
    <span className="codex-trait-pills">
      {traits.map((token) => (
        <CodexTraitPill key={token} token={token} knownTraitIds={knownTraitIds} />
      ))}
    </span>
  );
}
