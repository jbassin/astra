# 0029 codex P14 — entity-page integrity round — NLSpec

**Status:** BUILT + DEPLOYED (2026-07-19) — S1 `dbb6cbb` · S2 `5ecb628` · S3 sweep + deploy
same session; gates A–G met with evidence in §8; live on codex.iridi.cc (window ≈70 s).
Gate H rides the consolidated P2–P14 review. Was: FINAL (2026-07-19) — adversarially
reviewed ×2 (opus; independent lenses: transform/data, render/product). **5 blockers + 8 minors + nits ALL folded below.** The
reviews' headline catches: the draft's "split at top-level headings" produced ONE giant H1
"Class Features" section on all 27 classes (coverage 0.59–0.89 → suppressed whole →
**the unique Versatile Vial table was destroyed by the spec's own canary mechanism**; split is
now at EVERY heading, where the table survives at 0.01 coverage while the dup chapter still
suppresses at 0.96); the exact-id embed-removal step was a **no-op for exactly the 260/469
collision-family embeds it exists to remove** (loreBody embeds carry the bare base slug, the
post-fix stream ids are suffixed — matching is now on the collision-base slug); preamble
(pre-first-heading nodes, present in 77/77 loreBody docs) was undefined; the D29-134
`patchEmbed` application option was **provably a silent no-op** (`report.json`:
`unresolvedEmbeds: 0` at patch time — the 27 only flip unresolved at `reconcileInline` after
the D29-14 drop; `reconcileInline` is now the mandated sole application point); the vishkanya
"map-to-nothing" had no node-deletion mechanism (the count pin would have read 7, not 6 —
now an explicit replace-with-empty-text-node). Also review-corrected: the "146 unique You
Might callouts" canary was a FALSE premise (all 50 ancestries carry them in the body too —
they correctly suppress from the lore card; the real survivor set is ~61 sections); the
`buildEmbedNode` display capture was 0/2,714 coverage AND transform code misfiled in the
render slice (dropped); swashbuckler has 24 grants not 19; S1 must invoke the transform
directly (`just codex-refresh` RE-FETCHES snapshots — determinism trap).
**Scope doc:** `thoughts/shared/research/2026-07-19-codex-0029-p14-entity-page-integrity-thoughts.md`
(R1–R4 stakeholder-RESOLVED 2026-07-19: render-time lore suppression · ToC dropped everywhere ·
null the 6 undeterminable grants · drop both debris families; R5–R6 staff-locked: narrow embed
repoint + renderer fail-soft · generic facet humanization + heading-join normalization).
**Provenance:** stakeholder: "Two pages for you to investigate, `/ancestry?entry=shisk` and
`/class/alchemist`." Every finding proved systemic, none page-specific.
**Empirical basis:** five parallel investigation agents verified every mechanism against the real
repo + snapshots + corpus (44,808 docs, reads dated 2026-07-19) BEFORE stakeholder questions.
Headline pins: 77 loreBody docs (ancestry 50 / class 27), 76/77 >50% body-overlap (median 0.88);
grants 520 = 503 resolved + 17 null, ambiguous-family 350 → **wrong 164 / correct 180 /
undeterminable 6**; unresolved embeds 27 in 9 docs → **20 repointable / 6 genuinely absent / 1
self-referential** (orchestrator re-verified all 20 targets exist on disk — the workstream
summary's "16/10" was an arithmetic slip, its itemized table is authoritative); debris = exactly
4 journal section headers + exactly 5 unknown-book creature husks, both zero-inbound-ref
verified; ToC ≥8-heading hit rate 687/44,808 (ancestry 83%; the 687 counts rendered DOM
headings incl. the Lore card — immaterial, the component is deleted). Population-pin discipline
(P6/P10/P11/P12/P13): measured pins above; **derive-at-build** items are re-derived by the slice
engineer from the real mechanism — on an unexplained delta, STOP with options.

## 1. Problem

The two provenance pages exposed five systemic defects in the standalone entity surface:
(1) every ancestry/class page renders its Foundry-journal `loreBody` in full after the AoN
`body` — near-total duplication (a class page shows feature text up to 4×: granted stream ·
body's "Class Features" chapter · loreBody's chapter repeat · loreBody's embed cards; P12's
"dedup'd Description" only stripped the progression *table*); (2) 164 of 503 class grants link
another class's feature doc (alchemist's "Perception Expertise" renders the ANIMIST's
"Your apparitions…" — 26 of 27 classes affected) because `augmentClassStats` resolves through
the pre-collision uuid index on a premise its own doc comment states falsely ("0
renamed/suffixed"); (3) 27 unresolved embeds print raw ids ("class-feature/advanced-alchemy")
as visible prose — embeds lack the `brokenRef` display discipline crossrefs already have;
(4) zero-body journal section dividers ("Common"/"Uncommon"/"Rare"/"Archetypes") and 5
unknown-book creature husks sit in listings and Pagefind as name-only records; (5) the
"On this page" ToC — `.codex-toc` has NO CSS at all — renders as a full-width 1440×624px
strip pushing content ~620px down. Plus two seams: `GenericFacetLine` bypasses P13's
`formatFacetValue` ("Size: med" on ancestry/vehicle/warfare-army), and loreBody headings join
adjacent inline runs verbatim ("Chemical HardinessLevel 11").

## 2. Decisions

### Transform lane (corpus-changing; one regen; slice S1)

- **D29-132 — grants family disambiguation (R3).** `buildGrantedFeatures`
  (`augmentClassStats.ts:138-154`) gains a same-slug-family resolution step. Mechanism:
  resolve the raw grant uuid to its pre-collision `class-feature/<slug>` exactly as today;
  build a collision-family index over post-join final ids (base slug ← strip `-\d+$`; the
  `byCategory` enumeration shape `buildCategoryOptions` already uses); **family size 1 →
  current behavior unchanged** (the 153 unambiguous grants must resolve byte-identically);
  family size > 1 → disambiguate in priority order: **(1) `mastheadExtra` "Class" label
  containing the granting class name → (2) `legacyOf` naming `class/<slug>@legacy` → (3)
  unique `level` match**; ties within a rule broken by (a) edition matching the granting
  class doc's edition, then (b) lowest collision suffix; **no rule fires → `targetId: null`**
  (stakeholder R3 — never wrong-class prose; the existing null fail-soft
  `classPageData.ts:129-137` renders plain progression text, mechanism untouched).
  Exposing `foundryFinalIdByPreId` on `JoinResult` (`join.ts:644-659`; computed at
  `join.ts:1000-1006`) is sanctioned as a seed for 1:1 cases but is NOT sufficient alone
  (12 classes cite the identical shared Foundry Item uuid — measured). The false
  "0 renamed/suffixed" premise in `augmentClassStats.ts:12-22` is corrected in place.
  **Pins:** post-fix 520 grants = **497 resolved / 23 null**; **0 resolved grants whose
  target is mastheaded to a different class** (sweep assertion); named spot-pins —
  alchemist L9 → `perception-expertise-8` ("You remain alert…"), alchemist L7 →
  `will-expertise-2`, barbarian L7 → `weapon-specialization-18` ("Your rage helps you hit
  harder…"), animist L3 → `fortitude-expertise-2`, animist L19 → `legendary-spellcaster-2`,
  swashbuckler all **24** grants byte-unchanged (review-corrected from 19; 0 wrong today).
  The 6 nulled pairs enumerated in the build record (inventor ×1, investigator ×2, magus ×1,
  thaumaturge ×2 — reviewer-verified genuinely undeterminable). Full 350-row resolution
  re-derived at build; any row disagreeing with the reviewers' independently-re-derived
  verdict set = STOP with options. **Review facts that simplify the build:** on the current
  corpus rules (2)/(3) never fire — all 344 resolutions come from rule (1), the rest fall
  to null (the cascade is belt-and-suspenders for future corpora, keep it); no class name is
  a substring of another and 0 class-feature docs masthead more than one class, so the
  containment match is effectively exact single-class (the multi-class-masthead risk is moot
  on this corpus — the STOP-on-delta rule covers future drift).
  **Test coverage:** the current fixture set CANNOT reproduce the bug (no same-slug
  class-feature siblings exist in `fixtures/entities/class-feature/`) — S1 adds a
  deliberately colliding same-name feature across ≥2 fixture classes + unit tests for each
  disambiguation rule + the null fallback. `subclassOptions` is verified-immune (aonId-keyed)
  and must be byte-identical pre/post (gate C).
- **D29-133 — two debris drop-families (R4).** Mirror `activationDropFamily`
  (`drop.ts:62-120`, checked before the `isAonBacked` keep at `drop.ts:346-358`) with two
  new **predicate** families (there is a clean structural signal here — no name regexes, no
  ID keep-lists):
  - `journalSectionHeaderDropFamily`: `proseOnly === true && source.book.startsWith("Foundry
    Journal:") && body.length === 0`. Matches exactly **4**: `ancestry/{common,uncommon,rare}`,
    `archetype/archetypes`. Zero false positives verified against the other 20 FJ docs —
    **`ancestry/index` (8 body nodes) and the 16 real archetype essays + 2 class lore pages
    MUST survive** (`emit.ts:19-24` names the index pages deliberately preserved).
  - `unknownBookHuskDropFamily`: `category === "creature" && source.book === "unknown" &&
    body.length === 0 && facets empty && traits empty`. Matches exactly **5**:
    `creature/daji-level-{1,3,5}`, `creature/flappy`, `creature/twinsprout`.
  Both wired into `applyAonPrimaryDrop` with new accounting counters + `report(...)` lines;
  the generic `stripEditionPointers`/`reconcileCrossrefs` machinery already runs over
  `droppedIds` (both families verified zero inbound refs — the machinery is belt-and-
  suspenders). **Pins:** corpus 44,808 → **44,799**; `_index.json` row deltas ancestry −3 ·
  archetype −1 · creature −5; `sources-index.json` "Foundry Journal: Ancestries" count 5→2,
  "…: Archetypes" 17→16; category count stays 88.
- **D29-134 — embed repoint table (R5a).** A hand-curated dead-target → final-id override
  map (module beside the existing `join-aliases.json` pattern). **Application point:
  `reconcileInline` (`drop.ts:161-164`) ONLY — review blocker: `patchEmbed` never sees these
  27 as unresolved** (`report.json` `crossrefPatching.unresolvedEmbeds: 0` — the targets are
  Foundry drafts patchEmbed resolves `resolved:true`; the D29-14 drop removes them and
  `reconcileInline` flips the flag, `postDropEmbedBroken: 27`). The override lookup sits at
  the TOP of `reconcileInline`'s embed case, before the
  `if (!node.resolved || keptIds.has(node.target)) return node` early-return, keyed on
  `node.target`, returning `{...node, target: override, resolved: keptIds.has(override)}`
  (all 20 destinations survive the drop — verified — so `resolved` lands true).
  The **20 repoints** (all targets orchestrator-verified on disk 2026-07-19):
  13 × `class-feature/<x>-eidolon` → `eidolon/<x>` · 3 × `class-feature/<x>-innovation` →
  `innovation/<x>` · `class-feature/advanced-alchemy` → `feat/advanced-alchemy` ·
  `class-feature/quick-alchemy` → **`action/quick-alchemy`** (two real candidates exist;
  action/ chosen because the same page's other embed already links it — recorded) ·
  `feat/{basic,advanced}-undead-benefits` → `rules/{basic,advanced}-undead-benefits`.
  The vishkanya `feat/innate-venom` self-embed (text already inline in its own body) is
  suppressed via the same table — **mechanism review-pinned: the suppress entry REPLACES the
  embed node with an empty text node** (`{kind:"text", content:""}`) — a repoint map cannot
  delete from a children array, and leaving it `resolved:false` would make the unresolved
  count 7, breaking the gate pin. (With D29-136 the two are visually identical; the
  transform-side suppression exists precisely for the count pin.) The *structural* join fix
  (extending
  `CLASS_SUBSYSTEM_CATEGORIES`, suffix-strip normalization) is REJECTED this round: it
  re-categorizes real entities and churns URLs. **Pins:** post-fix unresolved embeds =
  exactly **6**, the named prose-only-on-AoN set (`class-feature/{versatile-vials,
  champions-aura, revelation-spells, oracular-curse, bloodline-spells, witch-lessons}`);
  each repointed embed resolves and its target renders (spot: summoner's 13 eidolon cards).

### Render lane (no corpus dependency; hermetic on fixtures; slice S2)

- **D29-135 — lore section suppression (R1; review-reworked).** New pure module (e.g.
  `src/domain/render/loreDedupe.ts`). **Split granularity (review blocker): sections split
  at EVERY heading** — a section runs from one heading to the next heading of ANY level —
  NOT "top-level" (the draft's top-level split produced one giant H1 "Class Features"
  section on all 27 classes, coverage 0.59–0.89 → suppressed whole → the unique Versatile
  Vial table destroyed; at per-heading granularity the table's section scores 0.01 and
  survives while the progression-repeat scores 0.96 and suppresses — reviewer-simulated on
  all 77 docs). **Preamble (review blocker): nodes before the first heading form an
  implicit leading section under the same test** — present in 77/77 docs (shisk's 3
  flavor paragraphs suppress at coverage 1.0). Per section — **(a) ClassPage only: remove
  embed nodes whose target's COLLISION-BASE slug (strip `-\d+$`) matches the base slug of
  any granted-stream target** (review blocker: exact final-id membership is a no-op for
  260/469 lore embeds — loreBody embeds carry the bare base slug while post-D29-132 stream
  ids are suffixed; base-slug matching is the mechanism); **(b)** shingle-test the
  section's remaining text (5-word shingles) against the body text (+ stream-rendered
  feature bodies on ClassPage); **coverage ≥ the pinned threshold (50%, an exported tested
  constant) → suppress the section; below → keep it whole.** A section left with no text
  after (a) (embed-only subsections) suppresses; a lore card with zero surviving sections
  is omitted entirely (heading included). Consumed by `entityPage.tsx:119-126` AND
  `ClassPage.tsx:541-546`. **ClassPage Description extension (staff call, review-upheld
  with the fixture requirement below):** body feature-heading sections whose heading text
  case-insensitively matches a granted feature name AND whose prose the stream's feature
  body covers at the same threshold (belt-and-suspenders: exact-name match alone does NOT
  strip) are stripped from the Description; the progression strip
  (`stripClassProgressionTable`) is untouched. **Canary set (test-pinned;
  review-corrected):** MUST-SURVIVE — shisk "Shisk Heritages" (the heritage pattern: 52
  corpus-wide; full survivor set ≈61 sections incl. Vishkanya Venom, Poppet Origins,
  Arcane Schools), alchemist's inline "VERSATILE VIAL" stat table (reviewer-verified
  genuinely lore-only and surviving at per-heading split); MUST-SUPPRESS — shisk's
  preamble + duplicated Physical Description/Society/Alignment sections, **the "You
  Might…/Others Probably…" callouts** (review killed the draft's "146 unique callouts"
  canary as a FALSE premise: all 50 ancestries carry them byte-identical in the BODY — the
  body copy stays visible, the lore copy correctly suppresses; no test may assert them
  in the lore card), alchemist's loreBody "Roleplaying/Initial Proficiencies/Class
  Features" chapter repeat and its per-feature dup subsections. A `suppressedCount`-style
  dev report (the P12 assert pattern) so corpus drift surfaces loudly; per-request compute
  accepted (77 docs, trivial), per-entity memoization is sanctioned latitude if profiling
  asks. **Fixture requirement (review): no class fixture carries a loreBody — S2 adds one
  (extend an existing class fixture) with a loreBody containing base-slug feature embeds,
  a nested unique table, and preamble**, so the (a)-matching, the table canary, and the
  Description extension are all hermetically provable (the anadi ancestry fixture already
  covers the ancestry side).
- **D29-136 — embed fail-soft (R5b).** `renderEmbed` (`nodes.tsx:228-273`) NEVER renders
  `node.target`: unresolved with no `display` → render **nothing**; the defensive
  resolved-but-unprefetched branch (`241-249`) likewise renders `display ?? nothing`.
  **The draft's `buildEmbedNode` `display` capture is DROPPED (review): 0 of 2,714
  `@Embed[...]` in the Foundry snapshot carry a `{label}` — zero coverage — and it is
  transform code misfiled in the render slice (no regen follows S2).** The fail-soft
  carries the 6 remaining cases alone; note (review) most of the 6 sit inside lore
  sections D29-135 suppresses anyway — the fail-soft is the defensive floor, not the
  user-visible fix. Sweep test: no rendered output anywhere contains a
  `category/slug`-shaped path from an embed.
- **D29-137 — ToC removal (R2).** Mirror the P12 class-page deletion (`7829f29`) at the
  one remaining mount: delete the `<TableOfContents/>` mount + import from
  `EntityRenderPane.tsx:66-70`; delete `TableOfContents.tsx` + its test after verifying no
  other consumer (grep). Leave an explanatory comment in the P12 style. The component is a
  client-only island (SSR renders null) — zero ssrSmoke surface. Gate-H register: ancestry
  pages (~15 sections) lose in-page navigation; stakeholder-accepted.
- **D29-138 — generic facet-line humanization (R6).** `GenericFacetLine`'s local
  `fmtFacetValue` (`facetHeader.tsx:332-342`) is replaced by the P13 formatter: reuse the
  labelMap-wins path (`humanizedLabelFor`) where cleanly importable, else
  `formatFacetValue` directly (both pure; S2 documents the layering choice). Fixes
  "Size: med" → "Size: Medium" (ancestry 50 · vehicle 94 · warfare-army 7) and the
  stringified-list leak on every generic-group category. Facet KEYS and the line's
  structure/styling unchanged; D29-95's ancestry size-CHIP exclusion untouched (this is
  the stat row, not the chip). Expected golden/fixture render deltas: value tokens only —
  enumerated at build.
- **D29-139 — heading inline-join normalization (R6).** In the heading render path
  (`nodes.tsx:376-388`): adjacent inline text runs join with exactly one space when the
  boundary has none, and boundary whitespace never doubles ("Chemical Hardiness" +
  "Level 11" → "Chemical Hardiness Level 11"; "Double Brew " + "Level 9" stays
  single-spaced). Headings only — paragraph/inline flow is untouched. Reviewer-measured:
  48 corpus headings carry a no-whitespace boundary, 0 are mid-word joins (the second run
  never starts lowercase) — space insertion is always correct. **Verification is
  unit-level, not live (review): nearly all 48 sit inside class-loreBody sections D29-135
  suppresses** — render the heading node in a test and assert the joined string; no live
  DOM assertion. The ingest-side fix (`foundryHtml.ts`) is sanctioned latitude if the
  engineer prefers it (corpus regen happens this round anyway) — pick ONE, not both.

### Discipline

- **D29-140 — what must NOT change.** Survivor entity ids/URLs (only the 9 dropped docs
  disappear — zero renames, zero re-categorizations); `body`/`loreBody` STORED content
  byte-identical for all survivors except the ≤10 docs whose embed `target`/`resolved`
  fields the D29-134 table rewrites (enumerated in the build record); `subclassOptions`
  byte-identical; the progression table renders once (strip mechanism untouched);
  `filterEngine.ts` / `urlState.ts` / listing metrics + 24.00px drift guard / Pagefind
  ranking mechanics untouched; search index rows byte-stable EXCEPT exactly the 9 removed
  records (grants/subclassOptions are never indexed; embed nodes carry no text —
  measured); the 17-null fail-soft render path unchanged (it just serves 23 now); no new
  dependencies.

## 3. Scope

**In:** everything above + tests/fixtures (incl. the first same-slug collision fixture) +
README + the staged deploy (corpus regen + Pagefind reindex + `just up`).
**Out (explicit):** the structural join fix for embed category-equivalence (URL churn —
rejected); splitting AoN prose into synthetic sub-documents for the 6 absent embed targets;
transform-time loreBody trimming (R1 chose render-time); any ToC replacement (R2 chose
drop); `ancestry/index` / `archetype/index` (deliberately preserved); the `/rules`
`::details-content` latent fix (carried follow-up, still separate); backrefs; filter/browse
surfaces (P13 territory); upstream-verbatim content fixes (the "for for" typo class — the
override-registry future decision stands).

## 4. Slices (serial; one sonnet engineer + one orchestrator-reviewed commit each)

- **S1 — transform lane (D29-132..134).** Grants disambiguation + doc-comment correction +
  collision fixture + unit tests; both drop-families + accounting; the embed override
  table at `reconcileInline` (D29-134's pinned point); expose `foundryFinalIdByPreId` if
  used. Then ONE corpus regen — **invoke the transform DIRECTLY (`pnpm --filter
  @astra/codex transform` or equivalent script entry), NEVER `just codex-refresh` (review:
  that recipe RE-FETCHES both snapshots before transforming — upstream drift would break
  the determinism gate)** — and the full pin sweep: 44,799 · 497/23 · 0 cross-class
  grants · 6 unresolved embeds · index-row deltas · named spot-pins. Any unexplained
  delta = STOP with options (P6 rule restated in the brief; no git commands outside the
  assignment; never `git stash`).
- **S2 — render lane (D29-135..139).** `loreDedupe` (per-heading split + preamble +
  base-slug matching) + both consumers + the corrected canary tests; ClassPage
  Description extension; embed fail-soft; ToC removal; facet-line humanization + an
  explicit anadi-fixture render test for D29-138 (review: NO committed golden covers any
  `GenericFacetLine` category — "no golden deltas" must not be read as "verified");
  heading join (unit-level). **Adds the loreBody-bearing class fixture** (D29-135's
  requirement). Hermetic on fixtures — S2 does not depend on S1's regen, but lands after
  it so the live-corpus smoke in S3 sees both.
- **S3 — sweep + deploy.** Both CI lanes local; ssrSmoke against a REBUILT dist (P12);
  gates A–G. **Staged deploy (P10/P11 precedent, D29-97 order): build image FIRST → S1's
  transform regen in place (the DIRECT invocation per S1 — never the re-fetching
  `codex-refresh` recipe) → gate-A pins EXACT → Pagefind reindex (host-only, ~3.8GB RSS;
  expected delta: −9 URL records, surviving fragments content-stable per gate A) →
  `just up` → guarded restart tail (the corpusFs per-process cache).** Degraded window
  recorded. Live-edge Playwright
  on BOTH provenance pages (gate D/E/F assertions) + SigNoz 0 ERROR + stakeholder
  screenshot set. Deploy executes only under explicit stakeholder sanction at execution
  time (classifier discipline; spec-sanctioned ≠ moment-sanctioned).

## 5. Acceptance gates

Live-surface gates are Playwright DOM assertions (never curl|grep — the React `<!-- -->`
separator gotcha).

- **A (data-delta proof):** the corpus diff is EXACTLY enumerable — 9 docs removed; the 27
  class docs' `stats.grantedFeatures` deltas; embed `target`/`resolved` rewrites in the ≤10
  D29-134 docs; `_index`/manifest/report/sources-index count deltas as pinned; **every
  other doc byte-identical** (the P7 checksum discipline). Search index (review-reworded):
  **−9 URL records; every surviving URL's fragment content byte-stable** (`collectText`
  reads `display ?? ""` for embeds; grants/subclassOptions never indexed — verified). The
  index *directory* is NOT byte-identical (removing records re-partitions Pagefind's
  postings/entry chunks) — assert at the record level, lean on gate F's behavioral proof.
- **B (hermetic + pins):** full codex suite green on fixtures alone; both CI lanes local;
  the collision fixture proves wrong-family resolution FAILS before the fix and resolves
  after; deliberately-updated pins enumerated in the build record; pre-existing residue
  rides (7 ssrSmoke fails on main; deep-scroll-reload guard flake) — not chased.
- **C (invariance):** `urlState.ts` zero-diff; survivor URL set identical (script-diff of
  id sets minus the 9); `subclassOptions` byte-identical across all 27 classes;
  progression table single-render proof unchanged.
- **D (lore dedup, live):** /ancestry/shisk — chapter renders ONCE; "Shisk Heritages"
  visible with working heritage links; "You Might…" asserted present in the BODY and
  ABSENT from the Lore card (the review-corrected canary); the Lore card shows ONLY delta
  sections (or is absent if none); /class/alchemist — each feature's prose exactly once in
  the granted stream; Description carries no feature-heading section the stream covers;
  the Lore card reduced to delta (Versatile Vial stat table VISIBLE); page height at 1440
  RECORDED pre/post (pre: 22,421px — a recorded number for the build record, not a
  pass/fail threshold).
- **E (grants, live):** alchemist Perception Expertise = "You remain alert…" (not
  apparitions); barbarian Weapon Specialization = the rage text; animist L3/L19 spot-pins;
  a nulled pair (e.g. inventor's) renders as plain progression text with no wrong-class
  card; zero rendered `category/slug` paths anywhere on both provenance pages + summoner
  (13 eidolon cards render).
- **F (chrome + seams, live):** no "On this page" strip on any standalone page (shisk +
  a ≥8-heading equipment page spot); the article's bounding box starts within the normal
  page padding of the header (the pre-fix 620px void is the measurable regression bar);
  shisk stat line "Size: Medium"; a vehicle spot-check humanized; the D29-139 heading
  join is proven at UNIT level only (review: the affected headings sit in suppressed
  sections — no live assertion); /ancestry listing shows no Common/Uncommon rows and
  counts dropped by 3; search for "common" returns no `/ancestry/common` record
  (reindex proof).
- **G (telemetry + deploy):** staged order followed; degraded window recorded; `astra.codex`
  spans clean on both provenance routes + /ancestry listing; 0 ERROR (1h window).
- **H:** rides the ONE consolidated stakeholder review (now P2–P14). P14's register
  additions: ToC gone everywhere (ancestry in-page nav loss); the 6 remaining invisible
  unresolved embeds; the 6 nulled grants (corpus coverage gaps, fixable only upstream);
  the suppression threshold as a standing maintenance surface (new corpus content may
  shift shingle coverage); the quick-alchemy action/-over-feat/ choice.

## 6. Risks / attention points

- **The suppression heuristic is the round's real correctness risk.** The canary set
  (review-corrected) is the guard; the per-category suppression-count report is the drift
  alarm. Base-slug suppression (embeds vs stream; feature-name headings vs stream) is
  preferred wherever possible; shingles only decide prose. The threshold is one exported
  constant — tuning it is a one-line change with the canary tests as the safety net. The
  reviewer's per-heading simulation is the reference behavior: any section landing in an
  ambiguous mid-band at build time gets an explicit keep/suppress entry in the build
  record, not a silent threshold nudge.
- **Masthead disambiguation risk is MOOT on this corpus** (review-verified: no class-name
  substrings, 0 multi-class mastheads, rules 2/3 never fire) — the containment rule +
  STOP-on-delta stays as future-proofing, not because current data needs it.
- **The Description extension** (D29-135) strips body content on a heuristic — the
  belt-and-suspenders rule (name match AND coverage), the new loreBody-bearing class
  fixture, and reviewer scrutiny are the containment; the review upheld the extension
  with those in place.
- **Reindex is mandatory this round** (unlike P12/P13's rows-byte-stable shape) — the
  −9-URL-records assertion (surviving fragments content-stable) is the proof the reindex
  changed nothing else; the index directory itself re-partitions and is NOT byte-compared.
- **virt-* fixtures have NO generator** (P10/P12 recurrence): restore surgically from git
  if any sweep touches them — never wholesale checkout.
- **The linguist-commit timer** is stopped for the build session, restarted after the
  final push (P4/P21).
- **ssrSmoke tests a stale dist unless rebuilt** (P12) — S3 rebuilds first.
- **`action/quick-alchemy` vs `feat/quick-alchemy`:** the table picks action/ (page
  precedent); if a reviewer or the build finds the feat/ doc is the richer target, STOP
  and record — do not silently swap.
- **Layering (D29-138):** `domain/render` importing from `domain/browse` — both pure; if
  oxlint or the module graph objects, move `formatFacetValue` to a shared home rather
  than duplicating it (reuse-don't-redeclare, the P13 lesson).

## 7. Hand-off

After FINAL: `octo:embrace` S1 → S2 → S3 per §4. Build record lands in this file as §8
(the P13 pattern); memory + RESUME updated at round close; gate H remains the ONE
consolidated stakeholder review, now P2–P14.

## 8. Build record

**Orchestration:** one sonnet engineer per slice (serial), one orchestrator-reviewed commit
each; S3 sweep + deploy orchestrator-run under the stakeholder's standing sanction ("deploy
once your work is done"). Linguist-commit timer stopped for the session. **Environment
note:** a CONCURRENT session was building `apps/assay` (0030) in the same tree throughout —
its `uv.lock`/`apps/assay` changes were left strictly untouched, P14 commits used enumerated
pathspecs, the Python lane was skipped (P14 touches zero Python; CI is path-filtered), and
the deploy was scoped to the codex compose unit (`docker compose build codex && up -d
codex`; the unit has no `environment:` secrets) instead of blanket `just up` — recorded
deviation, rationale: a full rebuild would have tripped over the concurrent session's
in-tree `uv.lock` (dagster image `uv sync --frozen` with the not-yet-present `apps/assay`
member) and interfered with work not ours.

**S1 (`dbb6cbb`) — transform lane (D29-132..134).** All pins exact on first measurement,
zero STOPs: 44,808→44,799 · grants 497/23 · 0 cross-class targets among the 344
disambiguated · all five named spot-pins · swashbuckler 24/24 byte-unchanged · exactly the
6 named unresolved embeds · vishkanya inert-node swap · index deltas −3/−1/−5 ·
sources-index 5→2/17→16 · subclassOptions byte-identical · determinism ×2 (byte-identical,
572,100,582 B). The 6 nulled pairs: inventor Perception Expertise L13; investigator
Vigilant Senses L7 + Incredible Senses L13; magus Lightning Reflexes L5; thaumaturge
Reflex Expertise L3 + Perception Mastery L9. `foundryFinalIdByPreId` exposure skipped
(sanctioned — family index alone sufficed). New `embedOverrides.ts` module + first
same-slug collision fixture. Due-diligence find (recorded, out of scope): 4 pre-existing
family-size-1 grants point at docs mastheaded to another class with NO alternative
candidate in the corpus (champion/investigator/swashbuckler "Weapon Mastery" →
martial-weapon-mastery [Ranger]; magus "Arcane Spellcasting" → [Wizard]) — byte-identical
pre/post, upstream coverage gaps, gate-H register.

**S2 (`5ecb628`, amended) — render lane (D29-135..139).** `loreDedupe.ts` (per-heading
split, implicit preamble, base-slug embed matching, adaptive shingle window); real-data
verification over all 77 docs: ancestry 444/504 sections suppressed · class 1,159/1,232 ·
5 all-covered class lore cards omitted entirely · exactly 52 heritage sections survive ·
shisk = `['Shisk Heritages']` only · alchemist = Versatile Vials + Research Field.
**In-slice find: fixed a real bug the mandated real-data run exposed** — a fixed 5-word
shingle window can never match sections shorter than 5 words (every class's byte-identical
"Perception" stub survived); window now adapts to `min(5, sectionWords)`. Embed fail-soft
(creature-dragon golden 1-line delta); ToC deleted (last mount); facet-line humanization;
heading join. New loreBody-bearing witch fixture + basic-lesson collision pair. Residual
(recorded for gate H): ~30 class lore survivors whose duplicate content hides behind
cross-category `action/*` embeds (zero shingle text — structurally outside both
mechanisms); Description sub-feature headings (e.g. alchemist "Formula Book") survive once
since only granted-feature-NAMED sections strip. **Commit-mechanics note: the first S2
commit captured only pre-staged deletions (a missing-pathspec aborted the whole `git add`)
— caught on immediate re-read of `git status`, amended to the full 20-file set before
anything else landed.**

**S3 (orchestrator) — sweep + deploy, gates.**
- **B PASS:** rebuilt dist; codex 2,295/2,302 — the 7 fails are the documented pre-existing
  ssrSmoke browse-tier residue, verified same-signature by name. TS lane clean (typecheck/
  lint/format via engineers' repo-wide runs + pre-commit gate). Python lane skipped
  (zero Python touched; concurrent-session entanglement).
- **A PASS (via S1):** scratch-corpus diff exactly enumerable (9 removed · 26 class docs ·
  vishkanya + undead-archetypes · 7 structural artifacts; zero unexplained), deployed via
  checksum-rsync of the determinism-proven scratch corpus (0.7 s).
- **Deploy:** image first (`5ccaf5cbc552`) → rsync 18:22:34 → reindex 31 s, **exactly
  44,799 pages** → `up -d codex` healthy 18:23:44 — **window ≈70 s**.
- **D/E/F PASS (live-edge Playwright):** shisk — every chapter section ×1, lore card =
  "Shisk Heritages" + 5 heritage links only, ToC gone (article y=53, was 677), height
  5,276→2,843 px, "Size: Medium", zero slug leaks; alchemist — Perception Expertise =
  "You remain alert…" (zero "apparitions" anywhere), lore = Versatile Vial stat table,
  height 22,421→12,142 px; barbarian rage-specific Weapon Specialization live; summoner
  13 eidolon embed cards render (the `class-feature/*-eidolon` strings visible in raw HTML
  are `brokenRef` CROSSREF targets riding the dehydration payload with proper displays —
  rendered text clean; repointing those crossrefs = gate-H register item); inventor's
  nulled Perception Expertise renders plain, no wrong-class text; /ancestry "72 of 72
  shown" (was 75), no debris rows; Pagefind page_count exactly 44,799.
- **G PASS:** SigNoz 1 h window: 0 ERROR logs, 0 error traces (5,695 spans scanned).
- **H:** rides the ONE consolidated stakeholder review (now P2–P14) with the §5-H register
  + the S1/S2 residuals above.
