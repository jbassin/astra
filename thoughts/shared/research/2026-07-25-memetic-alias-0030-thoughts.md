# Memetic alias rendering (`<name|alias>`) — scoping (0030 follow-on, codex surface)

**Status: SCOPED, not started.** Parked by stakeholder decision 2026-07-25 ("we won't do
it in this session but good to plan"). Resolve the R-questions below before speccing.

## Provenance

Reviewer marginalia on `bubble-bubble` (scriptorium, 2026-07-25T23:32Z), verbatim:

> This isn't a style question, it's more a feasibility question. In-universe, this spell
> (and all spells in this homebrew expansion) come from another planet. The creator of
> the in-universe book with these spells cast a powerful set of memetics spells on the
> book to obfuscate the names of people and locations from his homeworld, to avoid
> others using this book to track it down.
>
> Throughout this review I'm going to select areas and annotate with the pattern
> `<name|alias>`, where in text on the site should be displayed the alias with some
> weird dreamlike effect is overlaid and the user can hover over or click on it to
> change it to the name instead. Foundry likely doesn't support that, so it'll just
> display the alias.
>
> `<Feywild|land of fae>`

First instance applied 2026-07-25 (`7c9577f`): bubble-bubble's store text now reads
"land of fae" / "fey goop" — the alias is IN the store plainly; nothing marks it as an
alias yet. More pairs will accrete as his scriptorium pass continues.

## Verified current state (repo, 2026-07-25)

- **Store → codex path:** `apps/assay/homebrew/spells/*.json` descriptions are Foundry
  HTML, parsed at codex ingest by `parseFoundryHtml`
  (`apps/codex/src/ingest/foundryHtml.ts:618`) into typed block/inline nodes
  (`apps/codex/src/schema/nodes.ts`; inline kinds today: text, crossref, brokenRef,
  check, damage, inlineRoll, inlineAction, template, embed, actionGlyph). Homebrew
  loading lives in `apps/codex/src/ingest/homebrew.ts` (R5 ingest, D30-42..48).
- **Render path:** `apps/codex/src/domain/render/nodes.tsx` maps node kinds to
  components; the spell page and the `?entry=` preview pane share this seam (one
  component serves both — 0030 R4 pattern).
- **Corpus schema versioning:** `CORPUS_SCHEMA_VERSION` in `apps/codex/src/ingest/emit.ts`
  — a new inline node kind is an additive union arm; per the policy comment in
  `apps/codex/src/schema/entity.ts:92`, additive changes need no bump, but the emit-Zod
  gate must learn the new kind. Official docs must stay byte-identical (the ingest
  round's gate-B discipline).
- **Search:** Pagefind indexes rendered text at reindex time; whatever the alias node
  renders as visible text is what gets indexed.
- **Foundry module (future):** consumes the same store JSON verbatim; whatever the
  description HTML contains is what Foundry shows.
- **Interactivity precedent:** codex hydrates the full document (`hydrateRoot(document)`
  — P13); small delegated client behaviors are the established pattern. Gotcha carried:
  sibling listeners under hydrateRoot need `nativeEvent.stopImmediatePropagation`
  sequencing (P13 find).

## Design (leans, pending R-resolution)

**D1 — Alias source of truth: a registry, not inline markup (lean).**
`apps/assay/homebrew/aliases.json` (committed, hand-edit-only like revisions.md):
`[{ "alias": "land of fae", "name": "Feywild" }, …]`. Store text carries ONLY the alias
phrase (already true today). The codex homebrew ingest swaps matching text spans into
alias nodes at parse time, scoped to homebrew docs only.
- Why not inline `<span data-alias-of="…">` in store HTML: the store feeds the Foundry
  module verbatim — inline markup ships every true name in the module data, defeating
  the in-universe conceit (the book is obfuscated precisely so it can't be mined).
  Registry keeps the module 100% alias-only with zero module work (D7).
- Match mechanics: post-parse, on `text` inline nodes only (never inside crossref/@UUID
  display strings), case-sensitive whole-phrase. **Count-guard per the proxy-pin
  lesson:** the ingest asserts each registry entry's actual match count and fails on
  unexpected explosions (a generic alias phrase matching all over the corpus).

**D2 — New inline node kind `alias`:** `{ kind: "alias", display: string, trueName:
string }`. Additive schema-union arm in `nodes.ts` + emit-Zod. Homebrew-only producer;
official corpus byte-identical (gate mirrors ingest-round gate B).

**D3 — Render: RESOLVED — "Veiled Iridescence" (mock variant D, stakeholder-picked
2026-07-25).** Resting state = the alias under a static soft blur (~0.55px, NO
breathing/opacity animation) with a slow iridescent gradient sweep through the letters
(background-clip: text). Hover/focus = one crisp step to full reveal (kill the
animation on hover — CSS animations own their properties and beat the transition, the
mock's proven bug). The revealed true name is **centered on the alias's midpoint,
absolutely positioned — the line never reflows**; a longer name extends symmetrically
past both ends over a parchment wash (background + soft box-shadow in the page color)
so it stays legible over neighbors. Click/Enter/Space = pinned reveal (gold underline),
pins reset per load. Client side is a small delegated handler (P13 listener pattern).
`prefers-reduced-motion`: static gradient position + the blur stays as the tell.
Reference implementation: the mock artifact (`scratchpad/alias-mocks.html`, variant D
`.v-veiled` + the shared `.alias` skeleton — port, don't rewrite).

**D4 — Accessibility:** the span is focusable (`tabindex=0`, `role="button"`,
`aria-label "obfuscated name, activate to reveal"`); keyboard reveal on Enter/Space;
reveal state reflected via `aria-pressed`.

**D5 — Search indexes the ALIAS only.** Searching "Feywild" finds nothing — that is the
point of the conceit. Recorded as accepted behavior, not a bug (flag for gate H
register so nobody "fixes" it).

**D6 — Accretion workflow:** reviewer marginalia in `<name|alias>` form → staff adds
the pair to `aliases.json` AND ensures the store text uses the alias phrase (usually a
one-word swap). The scriptorium sweep briefs already carry T10 (flag D&D-cosmology
proper nouns), so candidates surface even where he hasn't annotated.

**D7 — Foundry module: zero work.** Store text is alias-only under D1; the module
inherits correctness.

## Open questions

- **R1 — Visual treatment: RESOLVED 2026-07-25.** Stakeholders reviewed the 4-variant
  mock artifact and picked **D "Veiled Iridescence"** (see D3 for the full contract:
  static blur + iridescent sweep, crisp full reveal centered on the alias footprint,
  no reflow, length-overflow over a parchment wash).
- **R2 — Toggle scope: RESOLVED 2026-07-25.** Per-instance click-pin only; **no
  site-wide "lift the veil" control** (stakeholder: not necessary).
- **R3 — Reveal persistence.** Does a pinned reveal survive navigation (localStorage),
  or reset per page load (lean: reset — the effect IS the flavor; the mock resets).
- **R4 — Alias granularity.** One global alias per true name (lean — the registry is
  global), or can the same name carry different aliases in different spells? His
  `<name|alias>` syntax is per-site; if he ever issues two different aliases for one
  name, the registry needs a per-slug override arm — don't build it until it happens.

RESOLVED already by his note: the reveal is public-facing (players may hover — he
described "the user" doing it); Foundry displays alias only.

## Slice sketch (one session, small round)

- **S1 — ingest:** `aliases.json` + alias-node swap in the homebrew ingest path +
  schema arm + count-guards + tests (fixture spell w/ alias; official-corpus
  byte-identity gate). Corpus regen, homebrew-docs-only diff proven.
- **S2 — render:** node component + dreamlike CSS (+ reduced-motion) + delegated
  toggle + a11y + ssrSmoke/interaction-guard cases; R1 mock sign-off happens here.
- **S3 — deploy:** image + reindex (44,982-scale) + live Playwright (hover/click/kbd on
  bubble-bubble) + SigNoz check; register D5 for gate H.

Prereq: none on the assay side (store already alias-only for the one instance). More
registry entries land whenever his review produces them — the feature ships with
however many pairs exist at build time.
