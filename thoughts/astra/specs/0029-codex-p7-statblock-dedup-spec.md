# 0029 codex — P7 spec: statblock dedup (keep AoN) + structured-render data fixes

**Status:** FINAL (adversarially reviewed ×2, 2026-07-15 — 3 blockers + 6 minors folded; see §6)
**Scope doc:** `thoughts/shared/research/2026-07-15-codex-0029-p7-statblock-dedup-thoughts.md`
(decisions R1–R4 stakeholder-RESOLVED; all populations live-swept 2026-07-15).
**Provenance:** early gate-H feedback (the abberton-ruffian review). Gate H continues in
parallel; its remaining items are not this spec's scope.

## 1. Decisions

- **D29-72 — Dedup, keep the AoN side (R1+R2+R4).** When `entity.body.length > 0`, the AoN
  prose is the statblock of record: suppress `CreatureStatblock`/`HazardStatblock`
  (creature/hazard groups) AND `EmbeddedItemSections` (any category) at the
  `entityPage.tsx:79-91` seam. **`MastheadExtraFallback` is NOT suppressed** — it renders
  masthead pairs *stripped from* the body by P6's D29-62 mechanism (`aonMarkup.ts:1294`;
  545 hazard "Complexity" + Nethys Notes live only there); it is complementary, never
  duplicative, and self-nulls when absent. Foundry-only entities (`body: []`) keep the full
  structured render. Predicate is body-presence, NOT `aonUrl` (a no-markdown join can set
  `aonUrl` with a Foundry-fallback body — `join.ts:421`; body-presence is the honest
  signal). Affected: creature 3,672 + hazard 506 + vehicle 83 + warfare-army 7; the other
  85 categories have zero struct+body overlap (swept ×2, independently). Both routes go
  through `EntityRenderPane` — one seam, both surfaces; review-verified as the ONLY render
  call sites of all three components. Bonus fix (review find): AoN-only prose creatures
  currently render an *empty* `codex-statblock` shell (`statblock.tsx:120-133` has no null
  guard) — the gate removes it.
  - **Accepted trade-off (stakeholder):** embedded-item full rules text leaves joined pages
    (AoN crossref-links names; text lives on each item's own page).
  - **R4 — named accepted ORPHAN loss (stakeholder, 2026-07-15):** a handful of entities
    carry embedded-item text that exists nowhere else on the site and IS deleted by the
    suppression: `vehicle/cutter` "Sluggish" · `vehicle/clockwork-bumblebee` "Wind Up" ·
    `warfare-army/greengripe-bombardiers` "Engines of War" · `warfare-army/nomen-scouts` +
    `warfare-army/mbotuu-frog-riders` "Overrun" · a few hazards whose embedded action is a
    divergent variant of the body's (e.g. `hazard/slamming-gate` "Slam Closed" ≠ body
    "Slam Shut"). Uniform rule kept; loss recorded here by name, recoverable later.
  - **Expected residue (record for gate H, not a bug):** the AoN body carries its own
    in-body mini-masthead (an H2 name/level heading + a `Source` paragraph) below the page
    masthead — pre-existing, stakeholder-seen on the live page; post-dedup it becomes the
    page's only statblock header. Stripping it is possible future polish, out of scope.
- **D29-73 — Strike range extraction (I5).** `extractStrikeFields` gains
  `system.range.{increment,max}` on `type:"melee"` items → new optional `range: string` on
  `EmbeddedItemSchema` (`.strict()`), AoN-format at transform time (precedent: `damage` is
  already a transform-baked display string, `extractDamage`/`formatDamageRoll`): `max`-only
  → `"range {max} feet"`, `increment` → `"range increment {increment} feet"`. Increment
  wins if both set — **defensive only: 0/12,942 raw melee items carry both** (1,506
  increment-only + 319 max-only raw); the tiebreak is exercisable by synthetic unit test
  only. **schemaVersion bump 2→3** — this follows the D29-20 EmbeddedItem-fields precedent
  (`emit.ts:166-171`), deliberately NOT `entity.ts:92`'s facets additive-no-bump rule (the
  in-file comments conflict; the bump rationale is "consumers must detect a regen", which
  holds here — engineer should not be whipsawed by the additive comments). `StrikeRow`
  renders it in the parenthetical after the trait pills. Expected magnitude ≈1,723 emitted
  strikes / 1,636 entities — **measure the real regenerated corpus; STOP if off by >5% vs
  the scope pins** (S1 regens over PINNED snapshots, so near-exact agreement is expected;
  drift only enters at S3's fresh fetch).
- **D29-74 — Lore skills fold into `stats.skills` (I4) + display humanization.** A
  transform-side lore extractor reads `type:"lore"` embedded items' `system.mod.value` and
  merges `sluggify(name) → mod` into the creature `stats.skills` record (keys stay slugs —
  the `entity.ts:308` contract; `canonicalJson` already key-sorts at emit, so determinism
  is free). **Render blocker folded:** `SkillsRow` (`statblock.tsx:61-66`) and `statsText`
  (`text.ts:209-213`) render keys via first-char `capitalize` — `gambling-lore` would show
  as **"Gambling-lore"**. Both call sites gain a slug humanizer (split on `-`, capitalize
  words: "Gambling Lore"); single-word core skills render identically, so no golden churn
  from that alone. Known data quirks (review-swept): zero core-skill collisions exist
  (guard + log anyway); 3 actors carry same-slug duplicate lore items — last-write-wins,
  transform logs it; 39 parenthetical lore names ("Lore (any one subcategory)") sluggify
  ugly — accepted, they humanize back readably. Lore population is 100%
  `stats.kind === "creature"` (0 hazard lore across 1,309 files); `HazardStatsSchema` has
  no `skills` field — leave a guard comment at the merge site (a future hazard lore item
  must not vanish silently). Expected ≈1,728 items / 1,479 entities — measure at build,
  same ±5% STOP.
- **D29-75 — Lore items leave the abilities bucket (I3, contingent on D29-74).** The
  `EmbeddedItemSections` `other` bucket excludes `type === "lore"` — the bonus now lives in
  the Skills row. Lands with D29-74's data present (S2 runs against the S1-regenerated
  corpora) so the bonus is never invisible in between.
- **D29-76 — Empty-stub filter (I2).** `other`-bucket items with `body.length === 0 &&
  traits.length === 0 && actionCost === undefined` are skipped (7,907 stubs corpus-wide;
  upstream Foundry data verified genuinely empty, 388/388). Strikes and spellcasting
  sections are NOT touched. Filter applies before the section-emptiness length checks
  (`statblock.tsx:295-323`); review verified zero Foundry-only entities lose ALL items to
  the I2+I3 filters (no empty shells), and the only 2 zero-spell spellcastingEntries sit on
  joined entities (suppressed by D29-72 anyway).

## 2. Out of scope

- Everything else in gate H (other feedback lands as its own round if redirected).
- AoN-body content fixes — incl. stripping the in-body mini-masthead (recorded expected
  residue, D29-72).
- Any transform change to `body`/masthead mechanics (P6's D29-62 stands untouched).
- **Search index (CORRECTED at review — the draft's "no reindex expected" was FALSE):**
  `build-search.ts:96-103` indexes `statsText(entity.facets, entity.stats)` for
  creature/hazard, which includes `stats.skills` — so D29-74 changes indexed content (lore
  skills become searchable, a welcome side effect) and **a reindex IS required**; it rides
  `just codex-refresh` at S3 (justfile already chains transform → search-index → restart).
  `embeddedItems` were never indexed — D29-72 creates no index/page divergence.

## 3. Slices

- **S1 — transform (D29-73 + D29-74 data side).** Range + lore extractors in
  `foundryEntities.ts` + `EmbeddedItemSchema.range` + schemaVersion 2→3; unit tests off
  synthetic docs (range formats incl. the synthetic both-set tiebreak, lore merge,
  collision guard, dup-slug log). **REAL corpus regen = transform-only over the PINNED
  committed snapshots** (run the transform script directly — explicitly NOT
  `just codex-refresh`, which would fetch fresh snapshots and drift the populations, and
  which refuses a dirty tree). **NO fixture-corpus regen and NO golden regen at S1**
  (review B1: regenerating fixtures here breaks `creature-dragon.html` against the
  pre-suppression renderer — all fixture/golden regen consolidates in S2). Measure real
  populations (range strikes ≈1,723, lore merges ≈1,728, entities); >5% off → STOP with
  options. Verify data pins: abberton `stats.skills["gambling-lore"] === 1` + thrown-bottle
  `range: "range 10 feet"`; ailuran `silver-lore: 13` + Boomerang
  `"range increment 20 feet"`. Determinism 3× (pinned snapshots ⇒ byte-identical); full
  Zod. **Live-interim note (review M5):** `data/corpus` is the live `:ro` bind mount — the
  regen briefly tears reads and afterwards the OLD renderer serves the NEW corpus (lore in
  Skills rows appears live early; benign — the server casts, never Zod-parses, at read,
  `corpusFs.ts:176`; the container restart waits for S3). Acceptable on this
  personal/noindexed site; do the regen in one pass, don't leave it half-written.
- **S2 — render (D29-72 + D29-74 display + D29-75 + D29-76) + all fixture/golden regen.**
  The seam conditional in `entityPage.tsx` (header cards + `EmbeddedItemSections` gated on
  `body.length === 0`; `MastheadExtraFallback` untouched); the slug humanizer in
  `SkillsRow` + `statsText`; lore exclusion + stub filter in `statblock.tsx`; `StrikeRow`
  range render. **Fixture regen here** (picks up S1's fields) — plus add
  `vehicle/armored-sleigh` to `scripts/extract-fixture.ts`'s picks (review M3: the only
  vehicle fixture has zero embeddedItems; the S2 vehicle test can't run hermetically
  without it). **Goldens: ONE regen, hand-reviewed** — `creature-dragon.html` loses ALL
  statblock/embedded-items markup (keeps body) — **plus a NEW 7th golden on
  `creature/adamantine-dragon-adult-spellcaster`** (review M4: without it, zero golden
  coverage of the structured render survives; this fixture is Foundry-only AND `variantOf`
  AND lore-bearing AND has a `range.increment: 120` Rock strike — it locks retention +
  range render + lore-in-Skills + the §5 variantOf risk in one file). New tests:
  suppression on a joined fixture; retention on `dune-candle` or the spellcaster variant
  (both exist — review-verified, nothing to add); vehicle item-section suppression
  (armored-sleigh); MastheadExtraFallback-still-renders (`hazard/gravehall-trap`, has
  `mastheadExtra`); humanized skill labels.
- **S3 — deploy + verification.** `just codex-refresh` (fresh snapshot fetch + transform +
  **search reindex** (required, §2) + restart tail — populations may drift a little from
  S1's pinned-snapshot numbers; re-record, don't STOP unless >5% vs S1); C-style
  three-prong real-corpus assert through BOTH `codex.iridi.cc` and `2e.iridi.cc` (marker +
  full-scale listing count + zero fixture-fallback warns — never bare 200s); live spot-set
  (§4-B URLs); local OTLP telemetry smoke on the entity route (SigNoz MCP); hermeticity sim
  both lanes; README render-section touch-up (incl. its `statsText` indexing sentence if it
  names skills); spec build record + memory update.

One engineer, serial S1→S3 (I3←I4 coupling + the single consolidated S2 regen make parallel
tracks not worth it at this size); orchestrator reviews each slice diff before commit.

## 4. Acceptance criteria

All checks against the production build (`pnpm build` + `pnpm start`) or the live edge —
never `vite dev` (standing P3 finding).

- **A (S1).** Regenerated real corpus over pinned snapshots: strike `range` at measured
  magnitude ≈1,723 (±5% STOP rule); lore merged ≈1,728 (JSON keys are slugs:
  abberton `gambling-lore: 1`, ailuran `silver-lore: 13` exact); `thrown-N`-trait strikes
  unchanged (Dagger); determinism 3×; full-corpus Zod green; schemaVersion bumped exactly
  once (2→3).
- **B (S2).** Live-shape proofs on the built server, real corpus:
  `creature/abberton-ruffian` renders exactly ONE statblock (`grep -a`: zero
  `codex-statblock` / `codex-embedded-items` — the real class names, review-verified; RK
  block + AoN statblock present; the in-body mini-masthead residue is EXPECTED per D29-72);
  a Foundry-only creature (`creature/ailuran` / `creature/dune-candle`) KEEPS the
  structured render with **"Silver Lore +13" rendered with space and caps** (humanizer
  assertion — the JSON key stays `silver-lore`), no bare lore heading, no empty stubs, and
  Boomerang "range increment 20 feet" visible; `creature/adamantine-dragon-adult-spellcaster`
  golden byte-exact (retention + range + lore); a joined hazard w/ mastheadExtra still
  shows its Complexity line; `vehicle/armored-sleigh` shows no duplicated item sections; a
  `@legacy` twin page unchanged (prose-only invariant, 834/834 verified). Goldens
  regenerated once + hand-reviewed; zero hydration errors on the spot-set.
- **C (S2).** Test coverage locks the seam both directions + MastheadExtraFallback
  retention + humanized labels; totality (88 categories) green; both CI lanes reproduced
  locally.
- **D (S3).** Both live hostnames pass the three-prong real-corpus assert; the §4-B
  spot-set re-verified through the edge; a Pagefind query for a lore skill name (e.g.
  "Gambling Lore") returns the bearing creature (proves the required reindex happened);
  `astra.codex` spans healthy incl. the entity route; hermeticity sim green both lanes.
- **E (S3).** Perf/weight: abberton-ruffian page bytes recorded before/after (expected to
  shrink); no interaction-latency change expected (no new lookups) — record, don't hide.
- **F.** Stakeholder eyeball = folds into the still-running gate H (this spec does not
  gate on it; H's verdict governs 0029 overall).

## 5. Risks / adversarial notes

- **The seam predicate is per-entity, not per-category** — a future category gaining both
  struct+body flips behavior silently by design (the uniform rule R2 chose). The
  suppression test must pin the *predicate*, not a category list.
- **`variantOf` entities (474+15)** have empty bodies and full structs — kept by the
  body-presence predicate; the spellcaster-variant golden (S2) locks one byte-exactly.
- **AoN-only prose entities (1,042 + 128)**: the gate must not suppress
  `MastheadExtraFallback` or facet headers for them (it doesn't — the conditional only
  wraps the three named render sites; and their empty-statblock shell disappearing is the
  desired bonus fix).
- **S1↔S2 interim:** fixture corpus and goldens are deliberately NOT regenerated at S1 —
  CI stays green at each slice boundary because hermetic tests run on the OLD fixtures
  until S2 lands everything atomically. The live site serves new-corpus/old-renderer
  between S1 and S3 (benign, noted in S1).
- **S3 snapshot drift:** `codex-refresh` fetches fresh upstream snapshots — small
  population drift vs S1's pinned numbers is expected and re-recorded, not a STOP unless
  >5%.

## 6. Adversarial review record (2026-07-15, two independent reviewers, pre-build)

Folded: **B1** S1 fixture-regen would break goldens pre-suppression → all fixture/golden
regen moved to S2 · **B2** draft's "no reindex expected" was false (`build-search.ts`
indexes `statsText` incl. `stats.skills`) → §2 corrected, reindex rides S3's refresh + a D
gate proves it · **B3 (both reviewers independently)** `SkillsRow`/`statsText` first-char
`capitalize` renders merged lore keys as "Gambling-lore" → slug humanizer added to D29-74 +
a B-gate render assertion · **M1** orphan item text with no own-page destination → R4 named
accepted loss (stakeholder) · **M3** vehicle fixture gap → armored-sleigh extract-fixture
pick · **M4** golden coverage of the structured render would collapse to zero → new
spellcaster-variant golden · **M5** S1 regen semantics pinned (transform-only, pinned
snapshots, live-interim note) · **M6** STOP tolerance quantified (±5%) · nits: increment
tiebreak synthetic-only; schemaVersion comment conflict acknowledged; dup-slug lore logged;
hazard-lore guard comment; post-sort moot via `canonicalJson`; in-body mini-masthead
recorded as expected residue.
