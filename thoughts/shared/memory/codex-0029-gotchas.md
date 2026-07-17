---
name: codex-0029-gotchas
description: codex (0029) — public-but-noindexed PF2e reference site — 2026-07-17 **P8 DENSITY/TABLE ROUND BUILT + DEPLOYED same 2 days as P7-deploy + edition-icons + the 5e.tools UX comparison that spawned it** — listings are now flat sortable per-category-column tables (5e.tools register, parchment voice kept), site-wide density pass, exact-name search boost (fireball/heal #1), j/k keyboard, nav carets; ⭐ the proxy-pin class struck AGAIN ×2 (hydrate-window 40 vs heal-ranks-43 → 60; gate-B "full set at 1600px" impossible under the 26rem list-track cap → 58/42 grid amendment) and the adversarial reviews caught the omnibar-8-stub no-op + the j/k history/fetch-spam class pre-build; plus the P6 proxy-population finds, the P5 bind-mount/fixture-fail-soft finds, the P4.5 loaderDeps finds + all prior corpus/join/render/browse/search/tree gotchas. ▶ open: gate H consolidated re-run (P2–P8) — screenshots delivered
metadata:
  type: project
---

**codex (0029)** — a PF2e rules-reference site: AoN content breadth × 5etools structure × gothic,
flat TS member `apps/codex` on the strider/site-kit SSR template, **port 10374**, public-but-
NOINDEXED (C-1..C-8 in the scope doc). Per-phase specs: **P1 ingest COMPLETE-pending-review** →
P2 entity pages → P3 faceted browse+search → P4 rules browser → P5 deploy. P2+ get specced
against the REAL corpus P1 produced.

**P8 BUILT + DEPLOYED + LIVE 2026-07-17 (density/table restyle + UX round; spec
`thoughts/astra/specs/0029-codex-p8-density-tables-spec.md` D29-77..82 status BUILT w/ §7 build
record; scope `…/research/2026-07-16-codex-0029-p8-density-thoughts.md` R1–R4).** Provenance
chain, all 2026-07-16→17: **P7 deploy sanctioned + edge-verified** (P7 spec → BUILT; the
"Gambling Lore" reindex proof made non-vacuous via Satinder Morne — a creature whose lore skill
exists only via the D29-74 merge; `codex-refresh`'s corpus-manifest diff was timestamp-only →
REVERTED per the P1 precedent, AoN un-drifted) → **edition icons `e0267e0`** (Remaster/Legacy
text → Four-Point-Spark/History-Ring square SVGs at 10 sites + both filter `labelOf` seams
widened string→ReactNode; gotcha: `regen-goldens.ts` runs under `nodeTsResolve.mjs` which
retries only RELATIVE specifiers — `@/*` imports in EntityPage-reachable modules break golden
regen while tsc/vite/vitest all pass) → **the 5e.tools UX comparison**
(`…/research/2026-07-16-codex-vs-5etools-spell-browse-ux-thoughts.md`; method find: 5e.tools is
Cloudflare-challenged AND this host's DNS filter blocks `*.challenges.cloudflare.com` — headless
can never pass; clone `5etools-mirror-3/5etools-src` and serve locally, byte-identical UI) →
stakeholder adopted its recommendations + the 5e.tools spacing scheme (R1 full table register ·
R2 aligned sortable columns · R3 traits out of rows · R4 site-wide), AskUserQuestion w/ ASCII
previews. **Slices: S1 `0693d61` columnDefs/sort/table · S2 `fa0b42d` density+grid+carets · S3
`e969cf0` search-boost+keyboard · S4 sweep+`just up` (render-only round — NO codex-refresh
needed, the deploy discriminator is "did the transform/index change").**
**⭐ THE P8 finds:** the **proxy-pin class struck ×2 more** (the D29-81 hydrate window was sized
40 off the fireball-rank-10 measurement alone — `heal`, the decision's own second acceptance
query, ranks 43 raw → 60; gate-B's "full set at 1600px" was UNREACHABLE — the pre-P8
`.codex-browse-layout` caps the list track at 26rem/416px at every desktop width → S1-build
amendment, 58/42 grid, 55/45 fell 15px short of the 600px tier floor); **the adversarial
reviews pre-killed two would-be no-ops** (Omnibar hydrates only its first 8 stubs — a
post-hydration name-boost literally cannot see rank-10; j/k reusing the click path's deliberate
non-replace push = 15 history entries + a ~43.5KB-avg entity fetch PER KEYPRESS on /creature →
real-DOM-focus selection + 180ms-settled `replace:true` commit + `memoizedEntity` 50-LRU);
**`/search` silently reuses `.codex-browse-layout`** — S2's widening broke /search's mobile
collapse via specificity (the 2-class scoped override outranked the 56rem media query; restate
the media query inside the override); **React SSR text nodes carry `<!-- -->` separators** —
"145 of 145 shown" is un-greppable as plain text through the edge (match segments or parse;
the three-prong assert scripts must know this); **keyboard Enter on a row anchor is a click
with `detail === 0`** — the split-view row-click intercept must fall through to native
navigation for it or Enter breaks; sortable-header a11y = `aria-sort` on the CELL never the
button; coverage-aware columns (64/88 categories are 0%-level; sidebar has NO rarity) — reuse
the facetKeys classifier rule, never hardcode fallback columns. **Weights: /feat 8.04 MB/630 KB
gz = +35% gz vs P3** (per-row inline Cast-glyph SVGs are the growth) — flagged for H,
`<symbol>`/`<use>` dedupe is the ready fix if felt. **Harness finds:** a user-STOPPED
background agent is UNRESUMABLE (SendMessage refuses; relaunch fresh only on the user's
explicit word — tree was clean, zero work lost); oxlint at default threads OOMs on this host
(the 0023 `--threads=4` fix still required, repo-wide). Alphabet jump strip + letter headers
DELETED (recorded trade-off — quick-filter+sort replace them imperfectly; a jump aid can
return if H asks). ▶ **OPEN: gate H, now the consolidated P2–P8 review on the live site**
(M7/M11 + heal-Pagefind-limitation now FIXED by the boost; P8 register screenshots delivered
2026-07-17).

**P6 BUILT + LIVE 2026-07-15 (gate-H feedback round; spec
`thoughts/astra/specs/0029-codex-p6-feedback-spec.md` D29-59..71, status BUILT; scope
`…/research/2026-07-15-codex-0029-p6-feedback-thoughts.md` R1–R11 all stakeholder-resolved).**
P5's gate H was a REDIRECT with 11 items; the whole round ran scope→spec→adversarial-×2→build→
deploy in one session. **FIRST USE of the 4-parallel-worktree-track structure (D29-71):** Track A
in the MAIN tree (the gitignored `data/{corpus,snapshots,search}` exist ONLY there — a worktree
materializes tracked files only, so the corpus-regenerating track cannot be a worktree), B/C/D in
isolated worktrees gating fixture-only (the hermeticity bar is what makes this safe), a binding
per-track file-ownership table, pinned merge order A→B→C→D (D rebases onto merged A+B+C), NO track
regens shared goldens (regen-locally-and-flag; integration regens ONCE at merged HEAD — A's and
B's golden drift sets overlapped on 3 of 6 files exactly as predicted, the only merge conflicts).
**⭐ THE P6 find — the proxy-population pin failure mode, ×3:** the spec pinned ritual movers=55/
`ritual/`=113 (adversarially reviewed ×2!) but BOTH derivations grepped `legacyOf` pointers — a
proxy population — while D29-59's mechanism actually triggers on any Foundry-spell↔AoN-ritual join
= **143 movers** (87 never-remastered rituals sat miscategorized in `spell/`; Foundry's own
`packs/pf2e/spells/rituals/` subfolder signal is discarded by categoryMap.ts); Runes pinned 323
(raw AoN doc count) vs 273 emitted (aonDedup collapse). Track A ran the REAL transform before
trusting any pin, STOPPED with options instead of improvising, and the resolution was "ship the
mechanism as written, amend the pins" (`d7b3100`, the P4 pin-correction precedent). **Final:
`spell/`=2,461 · `ritual/`=201 (145 visible default) · 143 movers = 45 same-slug colliders + 98
fresh-slug (9 renamed-on-remaster among the paired ones — a mover pattern nobody documented) ·
three named regression cases: commune many-to-one, shadow-double/simulacrum fresh-slug,
unbearable-cacophony pairing-less.** Two bonus real bugs fixed in-flight: the crossref/embed
patcher NEVER walked `HazardStats.disable/routine/reset` BlockNode[] fields (latent since P1.6,
exposed when R4 staled `hazard/the-power-of-faith`→`spell/consecrate`); mastheadExtra appended
unconditionally duplicates labels the typed facet headers already render (caught via golden-diff
review; fix = exact-match label dedup per header, recorded as a D29-62 deviation). **Process
finds:** a Track C engineer ran `git stash` in the MAIN tree (Track A's WIP briefly stashed —
restored + line-by-line verified, `stash@{0}` left as recovery artifact, redundant + droppable;
future worktree briefs must say "never run git outside your worktree path"); the spec-drafting
subagent REFUSED a mid-run SendMessage directive as suspected prompt injection (right instinct —
inter-agent messages arrive interleaved with tool results; re-send with provenance context and
judge-by-consistency framing); R10 abbreviations shipped as a client-safe pure `abbreviateBook()`
module because `sources-index.json` is server-only//sources-consumed (the adversarial review's
biggest catch — the spec'd 7-site wiring had NO data path); 24 dual-form PFS scenarios carry two
book-name strings → distinct codes under the injectivity test (relaxable if the stakeholder
objects at H); 40 UNCERTAIN curated abbreviations flagged inline for one-pass review. Perf: byte
weights flat-to-shrinking, interaction latency ~1.5–2× from R10 per-row lookups (memoizable).
R5 glyphs: traced from foundryvtt/pf2e `pf2e-8.3.0`'s `pathfinder-2e-actions.woff2` via
fontTools TransformPen (naive quadratic flattening corrupts the reaction hook), provenance in
`apps/codex/src/ui/ACTIONS-GLYPH-SOURCE.md`, visual-IP legality stakeholder-cleared w/ lawyers.
R6 footer deleted outright — the site now has ZERO global disclaimer, stakeholder-accepted risk.
`2e.iridi.cc` = discrete alias stanza (heart precedent), TLS ~10s, byte-identical SSR both hosts.

_(P4.5, superseded detail:)_ **P4.5 BUILT 2026-07-15 (UX rework + bespoke restyle; spec
`thoughts/astra/specs/0029-codex-p45-ux-restyle-spec.md` D29-46..52, status BUILT; scope
`…/research/2026-07-14-codex-0029-p45-ux-restyle-thoughts.md` + ui-map + style-tokens
companions).** P4's acceptance H was a stakeholder REDIRECT: 5e.tools-style split-column
browse, header nav dropdowns, real landing, kill the legacy checkbox, and a **bespoke
parchment sourcebook style** (the stakeholder's own book, 36 refs at `/home/jbassin/style-ref`
— gothic dropped from codex ENTIRELY, other astra sites untouched). Slices S1 `4831fec` · S2
`a5e448c` · S3 `28b4392` · S4 `fccee40` · S5 `8505e17` · S6 `157f10b`. **THE P4.5 gotchas:**
(1) **TanStack `loaderDeps` is load-bearing** for any search-param-driven loader — without it
the matchId ignores search params, the router reuses the cached match, and the loader silently
never re-runs (`?entry=a`→`?entry=b` = stale pane; verified vs router-core 1.171.14); (2) the
split view needs a **module-memoized category-keyed listing fetch** (pagefindClient idiom) or
every row click re-fetches the full 8,485-row listing — plus **`entry` must be explicitly
resynced through `filterStateToSearch`** (it rebuilds search from BrowseFilterState alone; same
bug class as the old legacy resync); (3) **R5 semantics: the default-hidden set is
`superseded`-only, NEVER `edition!=="remaster"`** — never-remastered legacy-edition content
stays visible (AoN behavior; stakeholder-resolved) — the param is `?superseded=1` with
`?legacy=` as a forever-decode alias (proven byte-identical; **CORRECTED at P5: NO 307/redirect
exists anywhere** — the alias decode is pure client-side in `urlState.ts`, old links render
in-place and the encoder re-emits `superseded` on the next navigation); (4) search NEVER filters superseded (always-both + Legacy
badges; Pagefind needed NO reindex — superseded+edition were already indexed filters, the swap
is query-time); (5) killing the site-wide toggle COLLAPSED all four M4 two-phase hydration
seams (3 routes + SearchPage.tsx) to bare URL reads — no persisted edition preference exists
anymore, per-page URL is the only truth; (6) UA `dialog:modal` centering breaks on tall
content (explicit `position:fixed;inset:0;margin:auto`); jsdom lacks
`HTMLDialogElement.showModal` (test-only polyfill); (7) a session-limit-killed engineer
resumed CLEANLY via SendMessage on its partial tree (re-read own diffs first); (8) codex owns
its 5 ui/ components (TraitPill/ActionGlyph/Input/Button/ErrorChip, exact prop parity) + a
3-bucket traitBucket (rarity→amber, traditions+alignments→purple, else umber) + tokens.css
repointing gothic's var NAMES to parchment values (globals.css untouched-by-rename); tailwind
+ gothicFontsPlugin removed from vite.config (existed only for gothic; codex uses zero
utility classes). Weights for P5: `/rules` 401/79 gz · `/sources` 705/65 · heaviest host
415/80 · `/` 12/3 · `/feat?entry=` 5.81 MB/537 KB · fonts 70.5 KB.

**P5 DEPLOY BUILT + LIVE 2026-07-15 (spec `thoughts/astra/specs/0029-codex-p5-deploy-spec.md`
D29-53..58, status BUILT — spec'd, adversarially reviewed (0 blockers), built S1 `dd42b19` + S2
`7e3e348`, and LIVE on `codex.iridi.cc` in one session; gate H folds the deferred consolidated
stakeholder review into P5's exit, stakeholder-resolved).** THE P5 finds: (1) **the D29-53
identical-path bind-mount convention** — `codex.data-path` (config.kdl) is host-absolute and
consumed VERBATIM at request time in dev and container alike, and plain config fields have NO
env-override (only SOPS `ref=` secrets do) → mount `data/corpus` + `data/search` at the SAME
absolute path in-container, `:ro` (Dagster pipeline-volume precedent, first frontend use;
repointing to a short `/data` would break host-side real-corpus serving); (2) the image is
**corpus-free on the heartwood model** with ONE departure — runtime `COPY fixtures/` so
corpusFs's fail-soft works — and the fail-soft is the #1 deploy trap: **a mis-mount serves a
healthy-looking 2.1 MB fixture site** (one-time console.warn), so any codex deploy check must
assert a real-corpus marker (dragon page + /spell 2,604), never bare 200s; (3) **Pagefind
bundle = 203 MB measured** (fragment/ 184 MB, 46,192 files 1:1 with entities; index/ 18 MB) —
the "~50–55 MB" figure in earlier docs was stale ~4×; total runtime mount ≈ 891 MB, snapshots
601 MB stay unmounted; (4) **refresh-in-prod**: corpusFs caches listings/tree/sources forever
per-process (`entity()` uncached) → `codex-refresh` now ends with a guarded
`docker compose restart codex`; the Pagefind staticMount alone needs NO restart (per-request
fail-soft, proven live via move-aside → 404 → restore → 200); (5) root `.dockerignore` was
missing `apps/codex/data` + `artifacts` — 1.5 GB sat in every sibling's build context since P1,
masked by BuildKit lazy transfer; (6) noindex = THREE layers live (meta since P2 · robots.txt
in `public/` served via the clientDir fallback, favicon-proven mechanism · plain
`header X-Robots-Tag noindex` in the Caddy stanza — first X-Robots-Tag/robots.txt in the repo);
(7) internet scanners found the new host within minutes (404 noise, non-error — expected under
C-1); the wildcard cert minted in ~20 s. Non-astra host residue surfaced, untouched:
`nextcloud-app` crash-looping for months.

**P1 BUILT 2026-07-13** (spec `thoughts/astra/specs/0029-codex-p1-ingest-spec.md`, status FINAL →
all four slices committed same-day by staff-orchestrator + sonnet engineers): S1 `108571d`
(member + fetchers + real snapshots) · S2 `40b2447` (CodexNode/CodexEntity schema, sluggify port,
enricher grammar, HTML parser, assembly+journals — 25,781 Foundry entities) · S3 `8465625` (AoN
markup grammar 29 tags, link table, 243-book licenseMap, facets — 43,631 metas) · S4 `8d66293`
(join + emit + report + 1.8 MB asserted-coverage fixture + `just codex-refresh` + README). Plus
`98bbef9` fix(ontology): main was red pre-existing — the heartwood apply had not re-seeded
entity.kdl (311→313). 503 hermetic tests; CI green.

**P1.5 (2026-07-13, same day) — exit-gate review → AoN-primary rework (spec §8 `12ea536`,
D29-14..18): S5a `eadb218` dedup · S5b `7ccc5c5` equivalence joins · S5c `0210b1c` drop pass ·
S5d `defd586` link repoint.** The review measured the STOP causes full-set (cross-category map
mismatch, rituals hiding in spell, 61/61 domain suffix) → stakeholder chose **AoN-primary**:
keep all AoN-only + merged; equivalence joins ({weapon,armor,shield}↔equipment; class-feature↔
27 class-subsystem cats; action↔{relic,tactic,feat} exact-tier + level-guarded; spell↔ritual;
domain "X Domain"→"X"); **drop every other Foundry-only entity** incl. the four Foundry-only
categories (2,233 dropped) **except the creature/hazard carve-out** (2,242+660 kept). Post-fix:
domain 100% / weapon 95.2% / armor 90.6% / shield 99.2% / spell 99.7%; STOP residue = only the
3 accepted-asymmetry cats (creature-ability 9%, hazard 42.8%, warfare-army 31.8% — measured
no-AoN-counterpart 485/488, 671/675, 15/15); **corpus 46,326 / 627.7 MB**; 550 tests; D-gate 3×.
**THE P1.5 gotchas:** (1) an engineer wrote RAW NUL bytes in a template literal → git treats the
SOURCE file as binary (no diff/blame; `file` says "data") — always `\\u0000` escapes; (2)
cross-category merges broke every inbound AoN link to the consumed id (joinBrokenRef 890→2,634)
— fix at link-RESOLUTION time, NOT pass-5 patch (a crossref string carries no provenance; the
resolver has url→aonId→finalId) → **joinBrokenRef now 0** (the old 890 baseline was the same
disease via qualifier/alias merges; 6,616 repoints: 2,621 cross-category + 3,995 merged), incl.
the legacy-twin silent-mislink case (a twin squatting the old slug swallowed links to the merged
doc); (3) a drop pass needs its OWN post-drop crossref/embed reconciliation (postDropBrokenRef
530 / postDropEmbedBroken 40 — emit Zod validates shape, not referential integrity); (4) the
creature dedup-artifact theory was REFUTED empirically — all 2,242 unjoined-F creatures have
zero AoN counterpart anywhere pre-dedup (pure asymmetry; dedup's real effect = 982 docs, 100%
equipment/item-bonus ES parent-child duplicates); (5) D29-16 deliberately narrowed (orchestrator-
accepted): AoN-name override on cross-category merges only, so domain pages keep "Air Domain";
(6) **the linguist-commit timer PUSHES main** — it carried the engineer's unpushed commits up
mid-review (review-before-COMMIT is the real gate, not review-before-push).

**The corpus (gitignored `apps/codex/data/`) — post-P1.5: 46,326 entities / 627.7 MB.**
_(Pre-P1.5 build facts, still true of the parsers/snapshots:)_ P1 raw output was 50,952
entities / 97 categories / **656 MB**
(spec estimated 100–200 MB — the P5 COPY-vs-bind-mount decision must use the real number).
Transform = 15.4 s wall. Determinism gate proven (three runs, `diff -r` empty). Corpus layout per
D29-3; `corpus/report.{json,md}` is THE acceptance artifact.

**▶ NEXT: stakeholder review of `apps/codex/data/corpus/report.md` (the P1 exit gate)**, esp.
the **9 both-source categories <50% joined (spec §6 STOP condition — re-decide join keys with
Josh BEFORE P2, no fuzzy-matching):** `domain` 0% (systematic: Foundry "X Domain" vs AoN "X" —
one new normalization rule would fix it); `armor` 18%/`weapon` 27%/`shield` 14% (**2026-07-13 review CORRECTED the cause: NOT
"AoN doesn't split tiers" — AoN splits them fine but files magic weapons/armor/shields under its
`equipment` category while categoryMap routes Foundry docs to weapon/armor/shield, so the
category-scoped join never compares them; measured full-set: weapon 634/715 + 33 tier-strip,
armor 142/165 + 9, shield 96/102 + 5 unjoined-F have exact same-slug AoN `equipment` entities →
category-equivalence join projects ≈95/93/99%**); `class-feature` 41%/`creature-ability` 9%
(granularity mismatch — AoN generic names vs Foundry per-creature docs); `hazard` 43%,
`action` 44% (AoN glossary fragments), `warfare-army` 32%. Creature overall 57.6% despite the
dragon-family proof (raw 13.8% → **98.1%** post-normalization); spells 91.7%.

**THE load-bearing empirical finds (don't re-derive):**
- **Packs carry NO `system.slug`** — the pack file basename IS the slug; the ported `sluggify`
  agrees on **28,636/28,636** real docs (154 committed vectors).
- **AoN urls are NOT unique** — 2,269 collision groups (tiered items, class/class-feature
  twins); canonical pick via `_id == {category}-{urlQueryId}`, 62 ambiguous residue.
- **licenseMap = zero unknown residue**: rule = title ends "(Remastered)" → ORC (load-bearing —
  reprints keep ORIGINAL release dates), else earliest `release_date >= 2023-11-15` → ORC else
  OGL; 91 ORC / 152 OGL books, machine-verified transcription.
- AoN `<traits>` blocks DROPPED (53,255): 98.8% duplicate the structured fields; facets win the
  653 disagreements. `<title right=…>` → heading meta. row/column ~187k pairs flattened (far
  above the scope-doc sample); `<image>` 3,193 dropped (not 22).
- `localizedBoilerplate` needed recursive `children` (69/200 real @Localize keys resolve to
  block HTML); lang merge: `en ∪ re-en` covers all 200 keys, re-en wins collisions.
- **Plain crossref targets can't disambiguate renamed collision ids** (`{category}/{slug}`
  carries no provenance) — only `embed` nodes (real uuid/aonId) resolve to `@legacy`/`-2`
  members; 890 crossrefs downgraded brokenRef, report-visible. **(SUPERSEDED at P1.5 S5d:**
  the fix is at link-RESOLUTION time where url→aonId→finalId IS available — repointing cured
  all 890 plus the cross-category class; brokenRef residue is now only the postDrop classes.) 9,994 collisions resolved:
  7,367 `@legacy` + 2,494 `-2` residual (mostly creature — partly an artifact of the AoN
  slug-index one-winner dedup, flagged for P2) + 133 same-edition anomalies.
- Emit-time Zod validation caught 3 real-corpus bugs no unit fixture hit: mid-string `<p>`
  reopen (HTML5 implicit close), actor-relative `@Check dc:@self.level` (NaN), literal JSON
  `null`s needing a `present()` guard — acceptance C's gate earns its keep.
- **Dockerfile manifest ripple = 13 sibling Dockerfiles** (the old "21" was COPY-lines-per-file);
  vp discovers new members automatically, CI needs no edit. `**/codex/data/**` AND
  `**/codex/fixtures/**` are in BOTH `.oxlintrc.json`/`.oxfmtrc.json` ignores (`**/tests/
  fixtures/**` does NOT match `apps/codex/fixtures/`).
- AoN fetch: `search_after` on `name.keyword`+`url` (cluster rejects `_id` sort), per-category
  term queries, ≤4 req/s, UA w/ contact email; snapshot-once. Foundry: blobless sparse clone of
  the pinned tag, `packs/pf2e` ONLY (sf2e out of scope) + ALL `static/lang/*.json` +
  `system.pf2e.json` (repo root) + `src/util/misc.ts`.
- `just codex-refresh` refuses on a dirty `apps/codex` index; refresh is the ONLY corpus-refetch
  path; the committed `corpus-manifest.json` diff is the reviewable event.
- Ops: two background engineer agents were killed mid-S3 by a session usage limit —
  `SendMessage` resume-from-transcript continued them cleanly (files already on disk survive;
  re-establish state by re-reading own files).

**P2 (entity pages) BUILT 2026-07-14** (spec `0029-codex-p2-entity-pages-spec.md` status →
BUILT; one autonomous overnight run, one reviewed commit per slice): **S6 `b174b15`** (P1.6:
npc-only import — 150 `character` pregens excluded, 16 persist as AoN-only twins; typed
`stats` + EmbeddedItem attack/damage/dc/attack/tradition, schemaVersion 2; `_index.json`
rename — corpus **46,192** == manifest exact) · **S1 `031a7fb`** (total renderer + goldens) ·
**S2 `72f224e`** (scaffold + reader + routes) · **S3 `c9d1d3b`** (listings + Popover +
acceptance sweep). A–G met with evidence; **▶ H = stakeholder page review, then spec P3.**

**THE P2 gotchas (don't re-derive):**
- **TanStack Start client-bundle leak class:** ANY export co-located in a `createServerFn`
  file (even one no client code imports) drags its imports into the client bundle — the
  splitter only rewrites the `.handler(fn)` argument. And any module-scope statement that
  CALLS into `node:fs`/`loadConfig` leaks on import. Cure = heartwood's split taken further:
  `corpusFs.ts` (fs, lazy singleton `getCorpusReader()`) ← `corpusFns.ts` (ONLY serverFn
  defs) ← pure logic in its own route-unreachable file (`entityPageData.ts`). Verify by
  byte-searching the built client bundle for `readFileSync`/`loadConfig`.
- **`import.meta.dirname`-relative paths break under `vite build`** (module relocates to
  `dist/server/assets/`) — the built server's fixture fallback silently pointed at a
  nonexistent dir and 500'd. Cure = upward marker-walk (`findAppRoot`, the `findRepoRoot`
  idiom).
- **Two engineers hardcoded plausible-but-wrong game data; only corpus cross-checks caught
  it:** inlineAction "all single-action" allowlist was wrong 11/39 ways (grab-an-edge is a
  REACTION, pick-a-lock 2 actions, 9 passive activities) — the corpus's own
  `action/<slug>.json` `facets.actionCost` is the ground truth; and per-request Zod crept
  into the reader against D29-23's explicit NO (46 parses/request on class pages).
  Orchestrator review-before-commit caught both.
- **`blockquote` is corpus-extinct post-D29-19** (its only 8 nodes lived in pregen docs) —
  renderer stays total (synthetic unit test); `extract-fixture.ts` `KNOWN_EXTINCT_KINDS`
  asserts extinction by full-corpus scan both ways.
- One upstream pack typo (unterminated `@Check[...` in a PFS hazard's `disable`) forced the
  ONLY fail-soft in the transform: `hazardStatsHtmlFailed=1`, field omitted, report-visible;
  entity `body` keeps hard-fail.
- Popover port needs akasha's CSS too (component carries none); mount on entity routes only
  (8k-row listings would thrash). Feat listing = 4,438,105 bytes (spec's ~4 MB estimate);
  loader payload trimmed to rendered fields (drop `traits` from rows).
- Agent ops: a mid-slice API-error/session-limit death is cheap — `SendMessage` resumes from
  transcript with files intact; a small fully-specified review fix is faster done by the
  orchestrator than a resume.

**P3 SPEC FINAL 2026-07-14 `242ee0c`** (`0029-codex-p3-browse-search-spec.md`, D29-32..38;
adversarially reviewed, 3 blockers folded). Stakeholder decisions: **5e.tools-depth facets
everywhere** (data-derived; classifier + pinned big-12 sets) · omnibar + `/search` page ·
**legacy hidden by default behind a site-wide toggle** · **full rows client-side, filter
locally** · extractor gap closed for all 5 categories · `creature.family` populated from AoN.

**P3 BUILT 2026-07-14 — ALL FIVE SLICES same-day** (staff-orchestrator + sonnet engineers, one
reviewed commit per slice; spec build record carries per-gate evidence): S1 emit extensions ·
S2 Pagefind index+mount · S3 faceted browse · S4 omnibar+/search · S5 sweep+docs. A–G met;
**acceptance H (ONE consolidated stakeholder review: browse + P2-H spot-set w/ M7/M11
expected + search w/ the heal limitation) was deferred AGAIN at P4-spec time → it now folds
into P4's exit gate.** Decisions closed in-build: D29-36 traits filter KEPT (176 KB); feat listing
4.49 MB/465 KB gz accepted (P2 weight class); NO creature-saves trim (61 ms interaction);
index-envelope 11.31 MB accepted (spec's 10.23 MB predated required `superseded` + gap facets).

**THE P3-build gotchas (don't re-derive):**
- **Pagefind `writeFiles` is NOT idempotent against a pre-existing outDir** — stale
  content-hashed fragments accumulate on every re-run (two fragments both claiming
  `/spell/heal` after a 2nd build); `build-search.ts` rm-rf's before write. Any pre-fix index
  dir is silently polluted — rebuild.
- **`meta.title` carries NO ranking weight on the `addCustomRecord` path** (display-only);
  weight-span injection into content doesn't move rankings at 46k scale AND leaks raw
  `data-pagefind-weight` attribute text into excerpts (window anchors inside the span exactly
  when the query matches the name). Single-common-word name queries ("heal" → not top-40 of
  2,676) are an accepted Pagefind TF limitation; distinctive names rank fine. Don't re-attempt.
- **`vite dev` does NOT serve site-kit staticMounts** (createSsrServer-only) — anything
  touching `/pagefind/` needs `pnpm build` + the production server.
- **Comma-bearing facet values shred a naive CSV URL codec** — creature.family "Dragon,
  Black" ×380 + source.book ×240; backslash-escape at the string level (post-percent-decode);
  byte-identical for comma-free values.
- **The SSR legacy-flash pattern:** a shared `?legacy=1` link must render legacy content in
  SSR HTML — first render reads `search.legacy` isomorphically (the live-toggle store's server
  snapshot is always false), the live toggle takes over only post-hydration. And the URL-wins
  seed must run at MODULE-EVAL time, not an effect (children's effects fire before the root's
  — a route's URL-reflect effect would strip the param before a root-effect seed ran).
- **Two hydration-mismatch classes only the at-HEAD sweep caught:** (1) an inline resolved
  embed renders a block `<div class=codex-embed-card>` inside `<p>` → the B2 paragraph guard
  must consult `embedRendersAsBlock` (the exact renderEmbed conditions, factored); (2) a
  pre-hydration script that stamps `<html>` needs `suppressHydrationWarning` on `<html>`
  itself, not just `<body>`.
- **`statsText` is NOT category-agnostic post-S1** — gap extractors put hp/size on
  ancestry/class/vehicle; the search build gates it to creature/hazard or spurious "HP 8"
  fragments get indexed.
- **No browser MeterProvider exists in astra** (@astra/observe/web = traces only) — a client
  RUM *metric* is really a fire-and-forget serverFn incrementing the server meter (every repo
  lazyCounter site is server-side).
- A global vitest `jsdom` default breaks an unrelated `import.meta.url` test under vp's
  concurrent run — DOM tests carry per-file `@vitest-environment jsdom` docblocks.
- Hermeticity checks must rename `data/` OUT of the tree (`/tmp`) — an in-tree rename makes
  the vendored snapshots visible to lint (false-fail).
- The in-cluster OTLP hostname doesn't resolve from host-run processes; the host-published
  collector port works for local smokes (`localhost:10353`).

**THE P3-spec measured facts (empirical, this session — do not re-derive):**
- **Pagefind 1.5.2 probe over the REAL 46,192-entity corpus:** build 33.0 s; bundle 49.1 MB
  apparent (46,192 fragments avg 648 B; 536 index chunks avg 32 KB max 341 KB; meta 316 KB);
  cold-start ~470–535 KB, warm query ~35–100 KB; **native indexer peak RSS ~3.8 GB** (matches
  public 30k–100k-page OOM reports) → **index build is HOST-ONLY** (`just codex-search-index`),
  never CI/Docker. `addCustomRecord` takes structured `filters`/`meta` (no HTML round-trip);
  Pagefind filters are string-equality ONLY (no numeric ranges); its zero-result prefix
  fallback is truncation recovery, NOT typo tolerance.
- **Facet analysis (all 88 cats):** `facets` exists ONLY on Foundry-merged entities — coverage
  ceiling = 1 − proseOnly, all-or-nothing per entity; 15/88 categories carry any facets,
  75/88 are core-only (level/rarity/traits/source/edition); `featLevel`/`rank` are PROVEN
  exact `level` duplicates; **trait casing is edition-coupled** (remaster lower, legacy
  Title-Case): 1,082 raw → 644 case-folded — fold or the trait filter fragments; price 100%
  parseable to copper (`per 10` batch suffix divides); `usage`/`itemCategory` mean different
  things per category (weapon.usage card 4 vs equipment.usage 116) — never share defs by key
  name; size uses Foundry abbreviations (`med`/`grg` — label map); level spans **-2..28, 31
  values**; `superseded` (`remasteredAs` non-empty) = **11,012** (10,970 legacy + 42
  remaster) — NOT P2's 7,152 legacy-pair figure (different question); source.book 519
  distinct. **5-cat extractor gap** (background/heritage/ancestry/condition/class have merged
  Foundry data, zero facets extracted).
- **THE codec find (verified empirically):** TanStack Router's default search parser follows
  the `URLSearchParams` convention — a bare `+` in a param value decodes to a SPACE, and bare
  numerics coerce to JS numbers. Tri-state URL sigils must be no-marker=include /
  `-`=exclude; `validateSearch` must accept `1` as number.
- site-kit `StaticMount` fails soft PER-REQUEST (`isFile` in the fetch handler) — register
  mounts unconditionally; an index built after server start comes online with no restart.
- Enriched compact `_index.json` measured 10.23 MB raw / 1.12 MB gz total (compact-vs-pretty
  alone saves 31%); creature compresses worst (+42.5% gz, near-unique stat ints) — accepted.
- Process: no external octo providers on this host — orchestrate.sh probe hard-stops; the
  sanctioned fallback is in-house agent research + a separate adversarial-review agent (P2
  precedent). The octopus state-manager drops a `.claude-octopus/` state dir in the repo
  ROOT — delete it, don't commit it.

**P4 SPEC FINAL 2026-07-14** (`0029-codex-p4-rules-browser-spec.md`, D29-39..45;
staff-orchestrator + two in-house research agents + adversarial reviewer — 3 blockers +
9 minors + 3 nits ALL folded). Stakeholder decisions: **`/rules` = tree browser** (the P3
flat listing for rules dies) · **superseded predicate in-tree** (Dark Archive 29/29 +
Guns & Gears 65/65 are 100% superseded → "all N hidden" collapsed headers, never dropped) ·
**attached sidebars on ALL categories** · **`/sources` index + mechanical book-name
normalize** (no hand-curation; residual splits accepted). H folds into P4's exit gate as
ONE consolidated review (P2-H + P3 + P4). ▶ NEXT: `octo:embrace` P4 S1.

**THE P4-spec measured facts (empirical — do not re-derive):**
- **⭐ AoN `next`/`previous` links are per-level SIBLING chains, NOT page-turn order** (THE
  adversarial find — the draft's ordering algorithm + pager were wrong): 0/3,642 hops
  descend into a subtree (2,656 same-depth + 986 shallower); 780 fork targets (always
  ancestor/descendant sets); 986 prev/next asymmetries; **106 hops cross book boundaries**.
  Usable ONLY restricted within one sibling group (head = the member no other member
  targets; unchained members alphabetical after). The pager derives from the tree's DFS
  pre-order instead; NO `readingOrder` entity field exists.
- Rules 3,645 (2,033 legacy/1,612 remaster; superseded 1,288): raw breadcrumbs 96% — the
  145 absent ARE the roots (~40 childless single-node trees, their names never appear as
  anyone's bc[0]); depth ≤6 modal 3; **trees scope per (book, path)** — generic chapter
  titles recur verbatim across the 45 books ("Chapter 1: Introduction" = 116 CRB + 109 PC).
  Parent resolution = path-prefix rule + name-only/root-preferring fallback (rescues Divine
  Mysteries "Rules Elements") + **lowest-aonId tie-break** (2 duplicate (book,name,path)
  groups in APG make determinism flap otherwise) → synthetic nodes pinned == 3.
- 192 breadcrumb strings carry embedded `\r\n` (GMG "Chapter 2: Tools" children ×192 +
  "Building Creatures" ×47) — normalize at extraction or the tree forks. Legacy↔remaster
  pairs can CHANGE path entirely (Counteracting: Ch9/General Rules → Ch8/Afflictions).
- Sidebars 689 (694 raw = 1 empty-name + 4 same-(slug,url) dedup): NO breadcrumbs, NO
  next/prev (0/694); attachment = the sidebar's own `url` == host page url (689/689
  resolve, rules 361, max 7/host); **65 host urls are SHARED by multiple entities (class
  page vs its 60+ class-features) → resolve via pickCanonical page-owner → aonId → pass-4
  `aonIdToFinalId`; the S5d parse-time repoint seam returns PRE-collision ids — wrong for
  any P4 url-keyed join.**
- Sources: `primary_source_category` present on 43,684/43,684 AoN docs (product-line signal
  total for AoN-cited books); 519 `source.book` strings = 276 Foundry-only + AoN's; the
  `"Pathfinder "+name` prefix rule merges only 23 → **"Other" bucket ≈253 books / 5.4% of
  entities EXPECTED** (renders last + collapsed). **Book-level edition needs the
  "(Remastered)" title override** — Treasure Vault (Remastered)'s docs measure 57 legacy/12
  remaster off the shared release_date; Foundry-only books get license "unknown" (explicit
  pill, never guessed OGL). `/sources` (aggregate index) and `/source` (the 245 book-entity
  faceted listing) BOTH remain, recorded.
- Frontend: codex has NO sidebar today — P4 introduces the first via a route-local
  `RulesLayout` (never a `__root.tsx` retrofit); akasha Explorer = the repo's only tree
  precedent (portable pure parts: `ensureFolder` in akasha `site.ts:327`, `explorerState`'s
  `computeOpen` w/ the SSR-safe two-phase seed); a static `/rules` route out-ranks
  `$category` safely while `/rules/{slug}` still falls through ($category/$slug).

**P4 BUILT 2026-07-14 — same day as its spec** (staff-orchestrator + sonnet engineers, one
reviewed commit per slice): S1 `0e75391` (transform: breadcrumbs threaded, sibling-chain tree,
sidebar reverse-join, book normalize 519→496, both artifacts, fixture regen, host index
rebuild) · S2 `c9ad9d1` (`/rules` tree browser, akasha computeOpen port, quick-filter, legacy
counts) · S3 content in `b71d3f4` + marker `a3184ce` (trail + RulesLayout first-sidebar +
DFS pager; see the timer gotcha below) · S4 `65036ba` (AttachedSidebars on all categories +
`/sources`; `categoryCounts` added to sources-index.json — spec gap, closed additively w/
determinism re-proven) · S5 `43caa6c` (A–G sweep, README P4 section, spec → BUILT).
Codex 1,362 tests; both lanes green incl. hermeticity. **▶ H = ONE consolidated stakeholder
review (P2-H spot-set w/ M7/M11 expected + P3 browse/search w/ heal limitation + P4
tree/sidebars/sources), then `octo:spec` P5 (deploy).**

**THE P4-build gotchas (don't re-derive):**
- **The linguist-commit timer race is REAL at second granularity:** it fired BETWEEN the
  orchestrator's `git add` and `git commit` in one shell invocation, sweeping the staged S3
  slice into a mislabeled `chore(mouthpiece)` auto-publish commit (`b71d3f4`) AND pushing
  it. Recovery = `--allow-empty` marker commit with the correct message (`a3184ce`), never
  force-push. Since then: `systemctl --user stop linguist-commit.timer` around every commit
  window, restart + `is-active` after.
- **The P1.5 raw-control-byte gotcha RECURRED twice** (S1 `ingest/rulesTree.ts` NUL+SOH,
  S2 `treeModel.ts` NUL, as key separators in template literals) and review missed it both
  times because (a) NEW untracked files show no diff line to expose "Bin", and (b) **the
  Read tool silently swallows control chars** — the source looked clean. Detection =
  `perl -ne 'print "$ARGV\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/'` sweep; fix = unicode
  escapes (`\\u0000` in source), byte-identical runtime strings.
- **The spec's synthetic-node pin (3) was WRONG — measured 2 is correct** (amendment in
  spec §4 S1): the "Divine Mysteries → Gods & Magic" case counted a PATH-CONTEXT element,
  not an immediate parent; a real breadcrumb-less "Gods & Magic" doc exists
  (`/Rules.aspx?ID=798`) and resolves its 5 children; DM's "Rules Elements" children are
  the fallback-rescued case. Lesson: a materializability estimate over every (book,
  parent-name) pair is a COARSER question than immediate-parent resolution — verify pins
  against the algorithm as specified before treating a mismatch as an implementation bug.
- **Hermeticity-masked test class:** an S2 ssrSmoke assert (`/rules` root renders as link)
  passed ONLY because the real corpus was present — the fixture's GMG root is `superseded`
  so legacy-off prunes it; caught by S4's hermetic run, fixed by asserting under
  `?legacy=true`. Every new SSR assert must pass with `data/` renamed OUT of tree.
- `pruneForLegacy` gained `currentId` (S3): the entity-page sidebar must never prune the
  page you're standing on even when it's superseded and the toggle is off.
- `send`'s static traversal guard 403s on a literal `".."` SUBSTRING in the configured dir
  string even when the path resolves inside the root — `path.resolve` dirs before handing
  them over (bit an S5 throwaway driver script, not app source).
- Local telemetry smoke recipe: call `initTelemetry("astra.codex", {endpoint:
  "http://localhost:10353"})` BEFORE `createSsrServer` (the module-singleton state guard
  makes the first call win over config.kdl's in-cluster endpoint), then verify via the
  `signoz_*` MCP tools — 64 spans / all 3 new routes confirmed this way.
- P4 weights (feed P5): `/rules` 393,058 B / 78,044 gz · `/sources` 696,918 / 63,869 gz ·
  heaviest 7-sidebar host (`rules/building-creatures@legacy?legacy=1`) 378,215 / 77,866 gz ·
  tree-toggle latency avg 35 ms. Corpus artifacts additive only — NO search-index rebuild
  needed for breadcrumbs/attachedSidebars/sources changes (statsText/meta untouched).

Docs: viability `…/research/2026-07-12-codex-0029-viability-thoughts.md` + scope
`…/research/2026-07-12-codex-0029-thoughts.md`. Builds on [[portal-0023-gotchas]] (pf2e document
model) + [[akasha-frontend-0011-gotchas]] + [[strider-0016-gotchas]] (template) +
[[heartwood-0020-gotchas]] (corpusFs/Fns split precedent) + [[config-single-source]] +
[[no-silent-scope-cuts]].
