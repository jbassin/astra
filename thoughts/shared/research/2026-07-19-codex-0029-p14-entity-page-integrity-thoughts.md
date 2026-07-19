# codex 0029 P14 — entity-page integrity round (lore dedup · grants · embeds · debris · ToC) — scoping thoughts

**Date:** 2026-07-19 · **Status:** SCOPED — decisions R1–R4 stakeholder-RESOLVED same day; R5–R6 staff-locked
**Provenance:** stakeholder: "Two pages for you to investigate, `/ancestry?entry=shisk` and
`/class/alchemist`." Staff live inspection (full-page captures at 1440px, DOM probes) + orchestrator
corpus verification (`apps/codex/data/corpus`) + **five parallel investigation agents** verified every
mechanism against the real repo/snapshots BEFORE the stakeholder questions (the P6 discipline). All
counts below are real-corpus reads dated 2026-07-19 (corpus at 44,808 docs).

---

## 1. The diagnosis (what the two pages exposed — all systemic, none page-specific)

1. **body + loreBody double-render, site-wide.** Every doc with a `loreBody` (77: ancestry 50 +
   class 27) renders it in full after the body as a "Lore" card. 76/77 docs have >50% doc-level
   overlap (median 0.88); `/ancestry/shisk` shows its whole chapter twice; `/class/alchemist` shows
   feature text up to **4×** (P12 feature stream · body's "Class Features" chapter · loreBody's
   repeat of that chapter · loreBody's per-feature embed cards). P12's "dedup'd Description" only
   stripped the duplicate progression *table* (`stripClassProgressionTable`), not prose.
2. **164 of 503 class grants link the WRONG class's feature doc.** `/class/alchemist`'s "Perception
   Expertise" renders the ANIMIST's text ("Your apparitions call attention…") in the feature stream
   and embed card. 26 of 27 classes affected (only swashbuckler clean — it happens to win its own
   collision groups). Root: `augmentClassStats` resolves grant uuids via the **pre-collision** S2
   uuid index on a false premise its own doc comment states ("0 renamed/suffixed") — and 12 classes
   cite the *identical* shared Foundry Item uuid, so no uuid map alone can disambiguate.
3. **27 unresolved embeds render raw slugs as visible prose** ("class-feature/advanced-alchemy" as
   literal body text on `/class/alchemist`; 9 docs affected incl. summoner's 13 eidolon embeds).
   16/27 have a real corpus target under a different id; 10 are genuinely prose-only on AoN (no
   standalone doc exists); 1 is self-referential-redundant (vishkanya).
4. **Journal-header debris rows.** `/ancestry` lists "Common"/"Uncommon" (+ an unlisted "Rare", +
   `archetype/archetypes`) — zero-body Foundry-journal section dividers ingested as entities.
   Bonus family: 5 zero-stat `creature/*` husks with `book:"unknown"` (daji-level-1/3/5, flappy,
   twinsprout — orphaned Foundry actors).
5. **The "On this page" ToC is a full-width unstyled strip** — `.codex-toc` has **no CSS at all**
   (grep: zero matches), so the `<details>` defaults to a 1440×624px block above the article; the
   content column starts ~620px down. 687 docs hit the ≥8-heading gate; **ancestry is the standout
   at 83%** (82/99) on *real body headings* — the strip persists after the lore dedup (re-measured
   body-only: identical threshold crossings).
6. **Raw facet tokens on generic entity headers.** `/ancestry/shisk` renders "Size: med" —
   `GenericFacetLine` has its own naive local formatter that never calls P13's `formatFacetValue`
   (which *explicitly* covers size codes for exactly this path, per its own module comment).
   Affected categories: ancestry (50), vehicle (94), warfare-army (7) + any stringified-list facet
   on any of the ~80 generic-group categories.
7. **Minor:** loreBody headings join adjacent inline runs with source-verbatim whitespace →
   "Chemical HardinessLevel 11" (body's parallel `meta`-field path renders correctly).

**What is NOT broken:** `subclassOptions` (verified immune — enumerates post-join final ids, aonId-
keyed `remasteredAs`); crossrefs (unresolved ones become `brokenRef` with a real `display` string —
the fail-soft pattern embeds should have had); the 17 null-target grants (documented D29-14
unjoined-residue, already fail-soft as plain progression text); the class progression table
(renders once — `stripClassProgressionTable` works).

## 2. Architecture facts (agent-verified, file:line)

- **loreBody provenance:** Foundry `JournalEntry` pages from 4 journals (`ancestries/archetypes/
  classes/domains`, `JOURNAL_TARGET_CATEGORY` `journals.ts:63-68`); `decideJournalPages`
  (`journals.ts:125-152`) merges by `sluggify(page.name)` == known entity slug → `loreBody`;
  non-matching pages become standalone `proseOnly` entities (`journals.ts:198-232`) with **no
  content check** — that's how the zero-body section dividers got in. `body` = AoN prose ("AoN wins
  prose", `join.ts:405-422`); the join carries `loreBody` through untouched (`join.ts:387-389`).
- **Render sites:** `entityPage.tsx:119-126` renders the Lore card unconditionally when `loreBody`
  is set; `ClassPage.tsx:463-546` renders stream (`518-527`) + stripped body Description
  (`529-534`) + stripped loreBody Lore card (`541-546`) whose embed nodes re-expand full feature
  bodies via `renderEmbed` (`nodes.tsx:227-269`).
- **The measured lore delta** (per-section 5-word shingles, <50% covered = unique): unique-to-lore
  content clusters into exactly **52 "\<Ancestry\> Heritages" sections + 146 "You Might…/Others
  Probably…" callouts** (both ancestry-only) + a small class tail of embed-adjacent tables
  (confirmed: alchemist's inline "VERSATILE VIAL" stat table — corpus node indices 54-57, exists
  nowhere else). 467 lore sections carry embed nodes (the class restatement machinery, not prose);
  1,269 are pure prose. Reverse direction: body-only sections are the mechanics (HP/Size/Speed,
  Class DC etc.) — body carries mechanics, lore's unique value is roleplaying flavor.
- **Grants resolution:** `augmentClassStats.ts:138-154` (`buildGrantedFeatures`) → `resolveUuid`
  over the pre-join S2 index (`uuidResolve.ts:224-233` assigns pre-collision `category/basename`);
  `keptIds.has(resolvedId)` only proves *someone* owns the bare slug. `join.ts` already computes
  `foundryFinalIdByPreId` (`join.ts:1000-1006`) but doesn't expose it on `JoinResult`
  (`join.ts:644-659`) — and it can't disambiguate the 12-classes-one-uuid case anyway. The
  disambiguation signal in the corpus: `mastheadExtra` "Class" label → `legacyOf` → unique `level`
  resolves **344/350** (measured; script in scratchpad, examples in `p14b_examples.json`).
  Existing `augmentClassStats.test.ts` never exercises a collision; fixtures have **no same-slug
  class-feature siblings** — new deliberately-colliding fixture coverage required.
- **Embed fail-soft gap:** `renderEmbed` falls back to `node.display ?? node.target`
  (`nodes.tsx:233-239`, second branch `241-249`) and `display` is almost always absent
  (`buildEmbedNode` `enrichers.ts:668-679` never reads `match.label`; AoN's `<document>` tag
  carries no title). Unresolved state is created by `drop.ts:reconcileInline` (`161-164`) flipping
  `resolved` false when D29-14 drops the unjoined Foundry draft. Why the joins missed: (A)
  `CLASS_SUBSYSTEM_CATEGORIES` (`join.ts:182-210`) omits `feat`/`rules`/`eidolon`; (B)
  `qualifierCandidates` (`join.ts:92-112`) strips only parenthetical qualifiers, not trailing
  "Innovation"/"Eidolon" words.
- **Drop machinery:** `applyAonPrimaryDrop` (`drop.ts:334-405`) keeps `proseOnly` docs by default;
  P11's `activationDropFamily` (`drop.ts:62-120`, checked at `346-358`) is the exact precedent for
  a family override; `stripEditionPointers` + `reconcileCrossrefs` already run generically over
  `droppedIds` (no new dangling-pointer code needed; both debris families verified **zero inbound
  refs** anyway — only their own `_index.json` rows + name-only Pagefind records).
- **ToC:** `TableOfContents.tsx` (client-only island, `MIN_HEADINGS=8` line 28), mounted from
  `EntityRenderPane.tsx:66-70` gated on `standalone`; P12's class drop (`7829f29`) was a clean
  mount+import deletion with an explanatory comment — the precedent to mirror.
- **Facet line:** `facetHeader.tsx` `GenericFacetLine` (`377-411`) + local `fmtFacetValue`
  (`332-342`); `formatFacetValue.ts:82-87` already dupes the size map anticipating "any OTHER
  path" but its only call sites are FacetPanel/facetDefs (browse lane). `categoryGroupOf` routes
  ancestry/vehicle/warfare-army to "generic". Note `EntityHeader`'s ancestry size-chip EXCLUSION
  (D29-95: size is a player choice) governs the *chip*, not this stat row — the row stays, just
  humanized.
- **Search index:** `build-search.ts:136-146` indexes `body + loreBody + stats` concatenated;
  grants/subclassOptions never indexed. `build-search.ts:178-183`: empty content falls back to
  `content: row.name` — the debris docs DO have name-only Pagefind records today, so the drops
  need a reindex to disappear from search.

## 3. Data pins (real-corpus, 2026-07-19 — regenerate at spec time; the proxy-pin class has struck P6/P8/P10/P12)

- Corpus 44,808 docs. loreBody docs: **77** (ancestry 50 · class 27); 76/77 >50% overlap.
- Grants: **520 rows total = 503 resolved + 17 null**; ambiguous-family 350; **wrong 164 · correct
  180 · undeterminable 6** (inventor ×1, investigator ×2, magus ×1, thaumaturge ×2). Per-class
  wrong counts in the workstream-B script output (worst: magus 11/12, bard 10/14, druid 10/12).
- Unresolved embeds: **27 in 9 docs** → 16 repointable (13 `eidolon/<slug>` + 3 `innovation/
  <slug>` + `feat/advanced-alchemy` + `feat/quick-alchemy` + `rules/{basic,advanced}-undead-
  benefits` — exact table in the workstream-C report) · 10 genuinely absent (versatile-vials,
  champions-aura, revelation-spells, oracular-curse, bloodline-spells, witch-lessons + 4 more of
  those across docs) · 1 self-referential (vishkanya innate-venom, text already inline).
- Debris: journal-header family **exactly 4** (`ancestry/{common,uncommon,rare}`,
  `archetype/archetypes`) — predicate `proseOnly && book.startsWith("Foundry Journal:") &&
  body.length===0`, **zero false positives** vs the other 20 FJ docs (16 real archetype essays +
  2 class lore + `ancestry/index` which `emit.ts:19-24` names as deliberately preserved) and vs
  the 2,259 legitimately-empty-body facet-driven docs (actions etc. — bare empty-body is NOT a
  safe signal). Unknown-book creature family **exactly 5**.
- ToC ≥8-heading hit rate: 687/44,808; ancestry 82/99 (83%) — body-only recount identical.
- Raw-facet-line categories: ancestry 50 · vehicle 94 · warfare-army 7 carry `size`/`speed` into
  `GenericFacetLine`.

## 4. Decisions

- **R1 — lore dedup: RENDER-TIME suppression. RESOLVED (stakeholder, 2026-07-19).**
  `EntityPage` + `ClassPage` suppress loreBody sections whose shingle overlap with body is ≥
  threshold (spec pins the number; the scoping analysis used 50% per-section 5-word shingles);
  unique delta stays visible (Heritages, You Might…/Others Probably…, the Versatile Vial table).
  On `ClassPage` additionally suppress lore sections whose embed target id is already in
  `grantedFeatures` (exact set-membership, not shingles). No corpus change, no reindex dependency.
  **Staff extension for the spec (adversarial review should weigh it):** the same page still
  carries the feature prose TWICE via body's own "Class Features" chapter vs the granted stream —
  extend the ClassPage Description strip to feature-heading sections matching granted feature
  names, completing P12's declared "dedup'd Description" intent. A `suppressedCount`-style report
  (the P12 assert pattern) so corpus drift surfaces loudly.
- **R2 — ToC: DROP EVERYWHERE. RESOLVED (stakeholder, 2026-07-19).** Mirror the P12 class-page
  deletion (`7829f29`) at the remaining mount (`EntityRenderPane.tsx:66-70`): delete the mount +
  import (+ the component file and its test if nothing else consumes it). Ancestry pages lose
  in-page nav — stakeholder-accepted; record in the gate-H register.
- **R3 — the 6 undeterminable grants: NULL → plain text. RESOLVED (stakeholder, 2026-07-19).**
  Same fail-soft as the existing 17 nulls (plain progression-table text via
  `classPageData.ts:129-137`) — never wrong-class prose. Expected post-fix pins: 503−6 = 497
  resolved / 23 null, and **0** ambiguous-family grants resolving to a doc mastheaded to another
  class (the gate assertion).
- **R4 — debris: DROP BOTH FAMILIES. RESOLVED (stakeholder, 2026-07-19).** Two new predicate
  drop-families mirroring `activationDropFamily` (predicate over ID-list — there IS a clean
  structural signal here, unlike P11's name regexes): journal-section-header (the 4) +
  unknown-book zero-stat creature (the 5). Existing generic dangling-pointer strip suffices
  (zero inbound refs verified). New accounting counters + report lines.
- **R5 — unresolved embeds: NARROW repoint + renderer fail-soft. Staff-locked (no URL churn).**
  (a) A hand-curated dead-target → real-id override table (shape of `join-aliases.json`) applied
  where `patchEmbed`/`reconcileInline` would otherwise leave an embed unresolved — repoints the
  16; the vishkanya self-embed is suppressed (text already inline). The *structural* alternative
  (extend `CLASS_SUBSYSTEM_CATEGORIES`, suffix-strip normalization) is REJECTED this round: it
  re-categorizes real entities and churns URLs. (b) `renderEmbed` never renders `node.target`:
  unresolved embeds with no `display` render nothing (the section heading above already names the
  feature — verified on all 10 remaining cases); mirror `brokenRef`'s display discipline. Gate:
  exactly 10 unresolved embeds post-fix, all prose-only-on-AoN, none visible as slugs.
- **R6 — generic facet humanization + heading join. Staff-locked (mechanical).**
  `GenericFacetLine.fmtFacetValue` → route through `formatFacetValue` (also fixes the
  stringified-list leak); keep the label styling, semantics unchanged; D29-95's chip exclusion
  untouched. Heading whitespace: normalize adjacent inline runs at render (trim + single-space
  join in the heading path of `nodes.tsx`) — cheap, corpus-independent; the ingest-side fix is
  sanctioned latitude if the engineer prefers it (corpus regen is happening anyway).

## 5. Grants fix mechanism (the spec's core technical content)

1. Build a same-slug-family index from post-join `byCategory` (the shape `buildCategoryOptions`
   already builds) in `augmentClassStats`.
2. Resolution order per grant: exact family disambiguation **masthead-Class match → legacyOf
   naming the class → unique level match** (proven 344/350); optionally seed from
   `foundryFinalIdByPreId` (expose on `JoinResult` — already computed at `join.ts:1000-1006`) for
   the 1:1 cases; fall back to `null` (R3) — NEVER the bare slug.
3. Correct the false "0 renamed/suffixed" premise in `augmentClassStats.ts:12-22`'s doc comment.
4. New fixture: a deliberately colliding same-name feature across ≥2 classes (current fixture set
   cannot reproduce the bug — no `-2` siblings exist in `fixtures/entities/class-feature/`).
5. Gate pins (regen at spec time): 497/23 resolved/null; alchemist L9 → `perception-expertise-8`
   ("You remain alert…"); barbarian L7 → `weapon-specialization-18` ("Your rage helps you hit
   harder…"); animist L3 → `fortitude-expertise-2`; swashbuckler unchanged (0 wrong today).

## 6. Proposed slice plan (for the spec)

1. **S1 — transform lane** (corpus-changing, one regen at slice end): grants disambiguation (§5) ·
   both debris drop-families (R4) · the embed override table + vishkanya suppression (R5a).
   Deterministic transform re-run over existing snapshots (no re-fetch); gate on the §5 pins + the
   16→10 embed count + 44,808−9 = 44,799 doc count (re-pin at spec time) + byte-stability of
   untouched categories.
2. **S2 — render lane** (no corpus dependency, parallel-safe with S1): lore section suppression +
   ClassPage stream/Description dedup (R1) · embed fail-soft (R5b) · ToC removal (R2) ·
   `formatFacetValue` routing (R6) · heading whitespace join (R6). New render tests: lore-delta
   preservation (shisk Heritages + alchemist Versatile Vial table VISIBLE; the duplicated chapter
   NOT), fail-soft never emits a slug, anadi fixture render.
3. **S3 — sweep + deploy:** both lanes green; ssrSmoke against a REBUILT dist (P12 find); Pagefind
   reindex (host-only, removes the 9 dropped records; assert row deltas exact); staged deploy per
   the P10/P12 precedent (build image FIRST, then corpus swap → reindex → `just up`; pin the
   degraded window); live edge Playwright on the two provenance pages (/ancestry/shisk single
   chapter + heritage links; /class/alchemist correct Perception Expertise text, zero raw slugs,
   no Lore-card chapter repeat) + SigNoz 0 ERROR; stakeholder screenshot set.

Adversarial review ×2 before build (standing practice). Every count pinned in the spec must be
regenerated from the real corpus at spec time.

## 7. Known risks / spec attention points

- **The suppression heuristic is the one real correctness risk** (R1): a too-eager threshold eats
  genuine content (the 198 ancestry delta sections and the class table tail are the canary set —
  the spec should pin a per-category suppression-count budget derived from the measured delta and
  a handful of named MUST-SURVIVE sections). Prefer exact-id suppression (embeds vs grantedFeatures,
  feature-name headings vs the stream) wherever possible; shingles only for prose.
- **Per-request compute:** the shingle check runs at SSR render — trivial at these doc sizes, but
  memoize per entity id if profiling says otherwise (memoizedEntity 50-LRU precedent exists).
- **`ancestry/index` is NOT debris** — `emit.ts:19-24` names it deliberately preserved; the drop
  predicate must not catch it (it has 8 body nodes; verified non-matching).
- **`class-feature/quick-alchemy` has TWO real candidates** (`feat/` and `action/` — the same page
  already links the action via a different embed); the override table must pick one (action/ is
  the already-linked precedent) and record why.
- **Fixture regen discipline:** virt-* fixtures have NO generator (P10/P12 recurrence — restore
  surgically, never wholesale checkout); the canonical-coverage sweep has twice WIPED them.
- **ssrSmoke stale-dist** (P12) and the pre-existing 7 ssrSmoke fails on main ride along — do not
  chase them into this round's scope.
- **The linguist-commit timer** must be stopped around commit windows (P4/P21 gotcha).
- **Deploy classifier:** deploys run in the orchestrator loop only under explicit stakeholder
  wording (P11 precedent); S3's deploy needs that sanction at execution time.
- **Reindex is mandatory this round** (the debris records) — unlike P12/P13's "search rows
  byte-stable" round shape; assert the exact expected row delta instead.

## 8. Next

`octo:spec` → `thoughts/astra/specs/0029-codex-p14-entity-page-integrity-spec.md` on the back of
this doc (all decisions resolved). Gate H (the consolidated P2–P13 review) remains open and
separate; P14 folds its register additions in: ToC gone everywhere (R2), ancestry in-page nav loss,
the 10 remaining (invisible) unresolved embeds, the 6 nulled grants, the humanization map's
standing maintenance surface.
