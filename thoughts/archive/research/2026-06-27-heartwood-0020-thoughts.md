---
date: 2026-06-27
subsystem: heartwood
slot: "0020"
kind: scope (umbrella / cross-phase)
status: scoping — decisions settled this session; per-phase scope+spec to follow
author: Claude (Opus 4.8) + Josh
---

# heartwood (0020) — umbrella scope

**heartwood** is a net-new astra subsystem that keeps the akasha **setting wiki** (the encyclopedia
of campaign "nouns" — people, places, things) up to date automatically, by reading play-session
transcripts and proposing wiki changes for human review. It fulfils the akasha namesake (the
"Akashic Records"): a living record of the world that maintains itself, instead of decaying because
maintaining it by hand is more work than one GM can sustain.

This is an **umbrella** doc. It establishes the whole-system vision, the decisions settled with the
stakeholder this session, the verified research the design rests on, the phase breakdown, and the
open questions. **Each phase gets its own scope doc + NLSpec** (per the stakeholder); this doc is the
spine they hang off.

---

## 1. The problem & the vision

The akasha corpus (`apps/akasha-backend/content/`, 121 `.vellum` pages today) documents the *setting*
— the durable "nouns" sorted into **Divinity / Geography / Org / Phenomena / Rules** (+ a possible
future **Bestiary** for flora/fauna/items). It is a genuinely useful resource and exceptionally
time-intensive to maintain — more than is worth it for a solo home game. Modern LLMs (GLM-5.2 here)
make automated maintenance plausible for the first time.

heartwood ingests a transcript, extracts durable facts about nouns (deliberately **excluding
play-by-play, out-of-character chatter, and combat** — see §5), resolves messy ASR names to the right
canonical entities (the `Ichel`-transcribed-as-`Y'shael` problem), and **proposes** new pages or edits
to existing ones — surfaced as PR-style reviewable change-sets in a bespoke review app. The setting is
about nouns, not narrative sequence; "first a happened, then b" is already covered by **chronicle**
(Show→Season→Episode timeline) and the **Script** transcript pages.

**The bar that dominates the design: the prose must read like a human wrote it.** If it reads like AI
slop — lists of facts, formulaic structure, AI-isms ("load-bearing", "not X but Y", "it's worth
noting") — no one will read it, and the whole effort is wasted. Quality is the spec, not a nice-to-have.

---

## 2. Decisions settled this session (load-bearing)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | **Write/trust model** | **Human-gated.** Nothing edits the corpus silently; heartwood *proposes*, a human approves. | Curated, hand-authored lore + a subjective prose bar. Mirrors linguist's existing "discovery automatic, SSOT edits human-gated" stance. |
| D2 | **The review gate** | A **bespoke PR-style review surface at `heartwood.iridi.cc`**, built on the **vellum-editor base** (CodeMirror + live gothic render). Approve / edit / reject change-sets. | The hardest thing to judge is prose *rendered in the house voice*; the vellum editor already renders + edits vellum. Reviewing-and-polishing is the realistic workflow. |
| D3 | **Existing-page handling** | **Propose a merged rewrite** — heartwood drafts an updated full page weaving new facts into the existing prose, surfaced as a diff. (Not append-only blocks; not flag-only.) | Best reading result; preserves a single coherent voice per page. Accepts the cost of careful voice-matching + diff review. |
| D4 | **First build milestone** | **Read-only proposer** — split across **Phase 2 (extraction engine)** + **Phase 3 (prose proposer)**, both **zero corpus writes**, after the registry foundation. | De-risks the subjective quality bar cheaply before building any write/commit/deploy/review machinery. |
| D5 | **Auth** | **None.** `heartwood.iridi.cc` is exposed on the open internet like every other astra site. | Stakeholder is comfortable with it (same posture as the vellum editor — `strider-editor-auth-accepted`). Simplifies the review-surface phase (no sign-in). |
| D6 | **Slot / structure** | New slot **0020 / heartwood**; multi-phase; **each phase gets its own scope + spec**. | Large project; the umbrella anchors it. |
| D7 | **Content filter** | Exclude **OOC chatter AND combat** in addition to play-by-play. The unifying rule: extract *durable facts about nouns*, drop *narrative sequence / out-of-fiction talk*. | Stakeholder requirement. Combat/OOC are the purest non-setting content. Nuance: keep a noun *revealed* in combat (a monster exists), drop the blow-by-blow. |
| D8 | **The entity registry is its own phase** | The typed entity registry (under `ontology/`) is **Phase 1**, sequenced first, ahead of the proposer. | It's net-new foundational data infra that everything downstream depends on for resolution; reusable beyond heartwood; deserves its own scope+spec rather than being buried in the proposer. |
| D9 | **Split the read-only proposer into two phases** | **Phase 2 = extraction engine** (filter + facts + resolution → structured facts); **Phase 3 = prose proposer** (facts → drafts + merged diffs + change-sets). Review surface → Phase 4, backfill → Phase 5. | Separates "are the facts right?" from "does the prose read human?" — cleaner gates, and isolates the dominant prose risk into its own step. (A standalone upfront prose spike was considered and **declined** — prose is proven in Phase 3 instead.) |
| D10 | **`world` field on campaigns; faerrin-only scope** | Add a typed `world` field to `Campaign` in ontology-being (both schemas); tag each campaign's world; heartwood ingests only `world == faerrin` for now. | Transcripts span the faerrin setting + the Astra meta-setting (one-shots); a typed `world` is the clean, reusable boundary (not a hardcoded list). Faerrin-only keeps the corpus coherent; the Astra meta-setting can be enabled later by flipping the filter. |

**Still open (deferred, by design):** the steady-state automation level *beyond* human-gated — e.g.
whether brand-new pages eventually auto-commit while edits stay gated. We decided **not to decide this
now**; the proposer phase's output will tell us how much trust the prose earns. See §7.

---

## 3. Verified research (the ground truth heartwood builds on)

All of the below was checked against the live repos this session (four parallel research passes). Key
file paths are inline so the per-phase specs can go straight to them.

### 3a. The akasha corpus — what heartwood reads & writes

- **Location:** `apps/akasha-backend/content/` (**not** the frontend — the frontend's `content/` is a
  `.gitkeep`). 121 `.vellum` files. Real taxonomy on disk: **Divinity (17), Geography (26), Org (68),
  Phenomena (6), Rules (2)** + root `index.vellum` + `Timeline.vellum`. **No Bestiary yet** (adding a
  section = adding a folder; trivial).
- **Format:** YAML frontmatter (`title?` — used in 1/121, `tags`, `aliases`, `img?`, `extra` catch-all
  where the universal `date` lives) + Markdown-ish vellum body with inline `[[crossref]]`s and `@name {
  … }` brace constructs. Constructs actually used in the corpus: `@handout` (21×, diegetic in-world
  text), `@deity` (7×, PF2e stat block), `@timeline` (1×), `@fields` (1×). Parser: `libs/py/vellum-lang/
  src/astra_vellum_lang/models.py` (+ TS mirror `libs/ts/vellum-lang/src/model.ts`).
- **Hierarchy is 100% folder structure.** There is **no `parent`/`kind`/`section` frontmatter.** The
  folder path *is* the hierarchy; a folder with an `index.vellum` is a container; people live at
  `Org/<Org>/People/<Person>.vellum`; geography nests 4 deep
  (`Geography/Calaria/Hallia/Sableclutch/Sin and Tonic.vellum`). **The filename IS the page title AND
  the crossref target.** Renaming/moving a file silently breaks inbound `[[stem]]` links.
- **Slugs** are a verbatim Quartz `sluggify` of the path (`apps/akasha-frontend/src/domain/lib/
  slug.ts`); case/commas/apostrophes/Unicode preserved. **Crossref resolution is exact path-key /
  filename-stem only** (`apps/akasha-backend/src/astra_akasha_backend/crossref.py`) — **no fuzzy/alias
  matching.** Frontmatter `aliases:` generate redirect *pages*, but do **not** participate in crossref
  resolution. Unresolved links are non-fatal (collected into an `unresolved` report; gothic renders a
  placeholder).
- **The prose voice (the bar):** present-tense, third-person, **encyclopedic-but-wry** — a gazetteer
  with opinions and humor, concrete sensory detail, em-dash/`--` rhythm, parenthetical asides; person
  stubs are short and declarative ("Cassian is a member of [[The Scale]]."); `@handout`s flip to
  lyrical second-person. **Anti-patterns to forbid:** "Overall," "it's important to note,"
  tricolon-of-abstractions, bullet summaries, hedging, uniform paragraph lengths, AI-isms.
- **Build/deploy seam:** content → committed snapshot `apps/akasha-backend/snapshot/akasha-snapshot.json`
  (a Dagster asset `akasha_corpus_snapshot`) → akasha-frontend `scripts/build-content.ts` reads snapshot
  (graph) + raw corpus (bodies) → generated modules → SSR site. **A content edit is only live after the
  snapshot is regenerated + the akasha container rebuilt.** The `linguist-commit` systemd timer already
  auto-commits generated content + redeploys akasha on a schedule (precedent heartwood's write-back
  reuses).
- **ontology-being boundary:** `ontology/ontology-being/being.kdl` is **META** (real players, PCs,
  campaigns, podcast personas) — explicitly *not* in-world setting nouns. The **PCs** (Argyle, Benny,
  Anzu…) live there with prose `desc`s, **not** in akasha, and the crossref resolver deliberately won't
  cross the boundary. heartwood will read it to identify speakers/PCs.
  **⤷ REVISED by Phase-2 decision P2.1 (2026-06-27): PCs ARE wiki-eligible** — the deliberate decision
  this paragraph deferred has been made: the akasha wiki documents the setting's people *including* the
  player characters. (being.kdl stays the META/podcast source; the being↔akasha overlap is a Phase-3/4
  merge concern.) See `…-phase2-extraction-thoughts.md` §P2.1.

### 3b. chronicle (0019) — the architectural template

heartwood's pipeline half closely mirrors chronicle (`apps/linguist/src/astra_linguist/`):

- **Per-session partitioned Dagster asset** (`session_episode_summary`, `assets.py`) keyed on session
  date, reading the linguist `Transcript` JSON (`apps/linguist/data/<date>.json`) + an **aggregate
  asset** (`campaign_timeline`) with an **`inputs_hash` skip-when-unchanged** gate + an hourly schedule
  + sensor wiring.
- **GLM via `call_structured`** (`chronicle_llm.py`) — **not** the dspy judge (wrong task). Pydantic
  output schema with `Field(description=…)`; structured output enforced via forced-tool-call; truncation
  fails loud. **Lesson:** for large structured generation, emit compact **boundaries, not lists** (the
  33-ep season grouping truncated mid-JSON until rewritten that way). Whole transcript goes in one call
  (output is small); mouthpiece's `_split_transcript` is the chunking precedent if inputs exceed context.
- **Committed-data → frontend** pattern (`apps/linguist/timeline/` → akasha build-content) + a
  **host-run resumable thread-pooled backfill** (`apps/linguist/scripts/backfill_chronicle.py`, ~$2–3,
  SOPS on host) + the **linguist-commit timer + Dockerfile COPY** deploy wiring.
- **Telemetry is free** via `LiteLLMClient` (cost/latency → SigNoz). Assets add domain metrics.
- **What differs for heartwood:** chronicle appends to a namespace *it alone owns* (blind overwrite is
  safe). heartwood writes into **hand-curated** content others edit → needs **merge/diff semantics,
  provenance, per-target content hashing for idempotence, dedup/accumulation across sessions**, and the
  write path runs **through akasha's snapshot/deploy machinery**, not heartwood's own files.

### 3c. Entity resolution — the messy-name problem is half-solved

- **linguist's `surface/` already has a real phonetic + LLM-judge corrector** (a faerrin port):
  `phonetics.py` (double-metaphone + rapidfuzz ensemble `ensemble_sim`), `lexicon.py`
  (`Lexicon.has()/nearest()`), `known.py`/`english.py` (OOV pre-flag via `wordfreq`), `judge.py` +
  `dspy_judge.py` (dspy/GLM `confirm|new|reject` classifier with deterministic guardrails + a committed
  `judge.compiled.json`).
- **`apps/linguist/src/astra_linguist/defs.yaml`** is a **232-key canonical↔known-garble map** — and it
  *literally contains* `Ichel: [Eshell, Michelle, Ixchel, Y'shell, Ischel]`. It is exactly an
  alias/misspelling registry. **linguist already rewrites known garbles into the corrected transcripts**
  at ingest (`corrections.py` regex replacer) — so **heartwood should consume the linguist-*corrected*
  transcripts**, getting known fixes for free and only doing fuzzy work on the residue.
- **What does NOT exist (net-new for heartwood):** any link from a **canonical string → a wiki
  page/entity** (the lexicon↔akasha union is documented-but-unwired); any **typed, unified entity
  registry** spanning people/places/orgs/gods (defs.yaml is flat/untyped; ontology-being is META-only,
  no spelling aliases); any fuzzy/phonetic/embedding entity resolution **outside** linguist's surface
  module. heartwood can reuse `ensemble_sim` + `Lexicon` as building blocks but must build the
  **entity-linking layer** itself.
- **Real noise sample (verified):** `Y'shael` and `Ichel` appear in adjacent lines of the same session;
  `Y'shael` isn't even in defs.yaml yet (only `Y'shell` is) — so the text-replacer misses it and only a
  phonetic+judge pass catches it. Other real garbles: `Meridian→Marudine`, `Hildebrandt→Hiltabrand`,
  `Alkahest Freight→Alkahaz Freight`.

### 3d. LLM lib + prose precedent

- **`libs/py/llm/src/astra_llm/`** — `LiteLLMClient` with `call_structured` (Pydantic-schema-enforced,
  forced-tool), `call_tool` (raw), and **`call_text` (free-form prose, no tool-forcing)**. `call_text`
  is the prose path — no single-string-field hack needed. `DEFAULT_MODEL = openrouter/z-ai/glm-5.2`;
  `DEFAULT_MAX_TOKENS = 16_000`; `REQUEST_TIMEOUT_S = 300`; `num_retries=5`; truncation + empty-output
  fail loud. **`ensure_openrouter_env()` must be called before any GLM call** (resolves the SOPS key into
  `OPENROUTER_API_KEY`). Cost auto-emits to SigNoz; **a new model needs a `pricing.py` row or its cost
  reads $0**.
- **Prose precedent = mouthpiece** (`apps/mouthpiece-backend/src/astra_mouthpiece/{prompts,script}.py`):
  **two-pass** — Pass A generates messy prose as **free text** (`call_text`) to "keep the model out of
  the clean-podcast attractor"; Pass B *only typesets* it (forbidden to improve). Carries an explicit
  **"AVOID THESE TELLS" catalog**, engineers deliberate imperfection, and enforces a hard **grounding
  contract** (use lore only for names, never invent events/outcomes). This is the directly-applicable
  anti-slop template for heartwood prose.
- **dspy vs raw:** dspy/MIPROv2 (`optimize.py --live`, gold set in `surface/`) pays off only for
  **classification with objective labels** (the judge). **Prose quality is subjective → no metric → no
  dspy for the writing.** dspy *could* help heartwood's *extraction/filter* step **iff** we author
  labels for it; otherwise raw `call_structured` per the chronicle precedent.

---

## 4. Reused vs. net-new

**Reused (port/import, don't reinvent):**
- linguist-**corrected** transcripts as input (`apps/linguist/data/<date>.json`) + `defs.yaml` lexicon +
  `surface/phonetics.ensemble_sim` + `surface/lexicon.Lexicon` for residual fuzzy resolution.
- chronicle's Dagster shape: per-session partitioned asset + aggregate + `inputs_hash` + backfill +
  sensor/schedule + the linguist-commit-timer/Dockerfile-COPY deploy wiring.
- `astra_llm` (`call_text` for prose, `call_structured` for extraction, `ensure_openrouter_env`, cost
  telemetry); config-single-source model selection (`load_config().llm.default_model`).
- mouthpiece's anti-slop prompt techniques (two-pass, tells-to-avoid, grounding contract).
- the **vellum-frontend editor** (`apps/vellum-frontend`) as the base for the review surface (CodeMirror
  + live gothic render); the frontend SSR template (strider/harrow/ledger) for the app shell; gothic
  `DocumentView` for rendering proposals exactly as they'll look live.
- akasha's snapshot/build/deploy machinery as the write-back target.
- `ontology-being` (`astra_ontology_being.load()`) for PC/player identity (read-only, boundary-respected).

**Net-new (the real engineering):**
- **The entity-linking layer:** canonical/resolved name → akasha wiki page (create-vs-update decision),
  spanning people/places/orgs/gods, with cross-session accumulation/dedup.
- **The noun-fact extractor + OOC/combat/play-by-play filter** (durable-fact classification).
- **The prose generator/merger** that hits the house voice and weaves new facts into existing pages.
- **Page placement logic:** which folder + filename (load-bearing — filename = title = crossref target),
  respecting the no-frontmatter-hierarchy convention.
- **The proposal model + store** (PR-like state: pending/approved/edited/rejected, base version, diff,
  attached entity decisions + dropped-span samples).
- **The `heartwood.iridi.cc` review app** (Phase 4) + the **approve → write `.vellum` → akasha snapshot
  → commit → akasha redeploy** write-back path.

---

## 5. The hard problems (carry into each phase's spec)

1. **Prose quality / anti-slop** — the dominant risk. No objective metric → relies on prompt craft
   (mouthpiece's two-pass + tells-list + grounding) + human review/edit. *This is why the read-only
   proposer (Phases 2–3) precedes any write machinery, and why prose gets its own gate (Phase 3).* Build
   a **voice guide** distilled from the best existing pages — an explicit early artifact (it's the spec
   for this risk).
2. **Entity linking** — net-new. Resolve a (possibly still-misspelled) transcript name to: an existing
   page (update), a new page (create), ~~a PC in ontology-being (skip — boundary)~~ **a PC (now also a
   valid wiki target — REVISED by P2.1)**, or "uncertain" (flag for the human). False links are *more*
   damaging than clumsy prose → gate them too.
3. **Durable-fact vs. narrative filter (D7)** — distinguish a lasting setting fact about a noun from
   play-by-play / OOC / combat narration. Edge case: combat/scenes that *reveal* a noun (keep the noun,
   drop the sequence).
4. **Page placement & naming** — choosing folder + filename correctly, since filename is identity and a
   wrong/renamed name breaks inbound `[[links]]`. New sections (e.g. Bestiary) are folders.
5. **Cross-session accumulation & idempotence** — a noun appears across dozens of sessions; heartwood
   must *accumulate* into one page without duplicating or thrashing. chronicle's self-contained
   `inputs_hash` doesn't transfer; needs per-target content hashing / diff-against-current.
6. **Merge into curated prose (D3)** — rewriting a hand-written page risks flattening its voice or
   dropping detail. The diff review is the safety net. (Provenance: resolved → no marking, §7.)
7. **Contradiction / evolving lore** — a new fact may *contradict* an existing page (a retcon, an
   in-fiction lie, lore that changes over time). heartwood must not blindly overwrite; surface the
   conflict in the change-set for the human to adjudicate. A Phase-3 (prose-merge) concern.
8. **Write-back ripple** — approval edits `apps/akasha-backend/content/`, regenerates the akasha
   snapshot, commits, and redeploys akasha-frontend. heartwood is effectively an authoring front-end for
   akasha's corpus; the deploy path is akasha's, not heartwood's.

---

## 6. Phase breakdown

> Each phase gets its **own** scope doc + NLSpec (D6). Below is the umbrella sketch; depth tapers for
> later phases (they'll be detailed when reached).

### Phase 1 — ontology infra: the typed entity registry + the `world` field — *detailed next*
The net-new in-world entity layer astra lacks (the documented-but-unwired "lexicon ↔ akasha union"),
on which everything downstream depends for resolution — plus the small **ontology-being schema change
that gates ingestion** (D10). Two deliverables, both pure `ontology/` data infra (no transcript
ingestion, no LLM), which is why they stand alone and first:
- **The `world` field on campaigns** — add a typed `world` field to `Campaign` in ontology-being
  (`being.kdl` + `being.canonical.json` + the Pydantic + Zod models, both-schemas rule), tag every
  campaign's world (faerrin vs the Astra meta-setting), so heartwood ingests only `world == faerrin`
  (D10). Reusable beyond heartwood (chronicle's show-matching, future multi-world akasha).
- **The typed entity registry** — a typed KDL registry: kind (person/place/org/god/creature/item),
  canonical name, alias set (incl. known ASR garbles), wiki page path, ontology-being ref if a PC —
  **seeded from existing sources without forking them** (references defs.yaml's canonical↔garble pairs +
  akasha page-stems/aliases + ontology-being PCs; adds only the net-new typed `kind` + page link). Likely
  a sibling under `ontology/` (the in-world counterpart to META `ontology-being`). Ships with the
  resolution API (reusing linguist's `surface/phonetics.ensemble_sim` + `Lexicon`) the proposer calls.

*Acceptance: `world` is on every campaign + filterable; the registry seeds correctly from the three
sources (spot-checked against the corpus), resolves known garbles (e.g. `Y'shael → Ichel`) to the right
typed entity + page, and is consumed by a thin resolution API with telemetry.*

### Phase 2 — the extraction engine (read-only)
The first `heartwood` app code (heartwood-backend). Ingest one session (restricted to `world == faerrin`
campaigns) → **filter** (OOC/combat/play-by-play, dedicated keep-when-in-doubt pass → dropped-span
artifact) → **extract noun-facts** (`call_structured`) → **resolve each fact's entity against the
Phase-1 registry** → emit **structured per-session facts** (facts + entity decisions + dropped-span
sample). **No prose, no corpus writes, no surface.** *Acceptance, judged on a held-out session: the
right content is dropped (OOC/combat out, lore-in-combat kept), and facts are correct, complete, and
attributed to the right resolved entity.* This isolates the "are the facts right?" question from prose.

### Phase 3 — the prose proposer (read-only) — *where the house-voice premise is proven*
Facts (Phase 2) → **generate/merge prose** (`call_text`, mouthpiece-style anti-slop, against a distilled
**voice guide**) → **emit proposal change-sets** (KDL manifest + `.vellum` bodies: new-page drafts +
merged-rewrite diffs for existing pages + the entity decisions + dropped-span sample; also proposes
registry additions for new entities). Handles **page placement/naming** (folder + filename = identity)
and **contradiction** (a new fact that conflicts with the existing page). **No corpus writes, no
surface, no deploy** — reviewed crudely (render the staged `.vellum` with gothic). *Acceptance: produced
pages read like the house voice and merge faithfully, judged by the stakeholder.* **This is the
make-or-break gate** (we chose to prove prose here rather than in an upfront spike).

### Phase 4 — the `heartwood.iridi.cc` review surface + write-back
The bespoke PR-style review app (heartwood-frontend) on the vellum-editor base (config namespace
`heartwood`, next port in the 1036x/1037x range — ledger took 10370). Consumes Phase-3 change-sets;
renders each as a reviewable PR (diff for edits, full render for new pages, entity decisions surfaced
for correction); approve/edit/reject; **approve → write `.vellum` → akasha snapshot regen → commit →
akasha redeploy** (+ apply approved registry additions). No auth (D5). Needs the proposal store. Deploy
ripple: Dockerfile sibling-manifest, Compose unit, Caddy block (`*.iridi.cc` wildcard → the subdomain
should just work, per `ledger-0018-gotchas`).

### Phase 5+ — backfill, automation, polish
Host-run resumable backfill over all historical `world == faerrin` sessions (chronicle-backfill
template) to bootstrap the corpus + the registry; scheduling/sensor wiring so new sessions auto-produce
proposals; the Bestiary section (opportunistically); ongoing voice tuning; possibly relaxing the
automation level (§7) if trust is earned.

---

## 7. Open questions (resolve in the relevant phase's spec — not blocking the umbrella)

- **Home app:** ~~new `heartwood` Python app, or extend `linguist`?~~ **RESOLVED → new `heartwood`
  app(s)** (heartwood-backend across Phases 2–3, heartwood-frontend in Phase 4), importing linguist's
  `surface/` + astra_llm as libraries. Matches astra's one-subsystem-per-app pattern; keeps linguist
  focused. (The Phase-1 registry + `world` field live under `ontology/`, separate from the `heartwood` app.)
- **Proposal store shape:** ~~committed JSON files, a small DB, or git branches/PRs?~~ **RESOLVED →
  committed KDL** (matches the repo convention — KDL at the edges, parsed to Pydantic/Zod). Recommended
  shape (settle in the Phase-3 prose-proposer spec): a **KDL manifest** (id/session/status/target paths/ops/entity
  decisions/dropped-span sample) that **references sibling `.vellum` files** for the proposed bodies, so
  prose stays native vellum (rendered + diffed natively) and state stays KDL.
- **Filter implementation:** ~~LLM classification per segment vs. heuristic pre-pass vs. both.~~
  **RESOLVED → dedicated LLM filter pass** (keep-when-in-doubt; emits an inspectable dropped-span
  artifact for review; extraction runs on kept context). Higher quality than inline (single-job calls)
  + makes the dangerous failure mode — invisible false-exclusion — reviewable.
- **Extraction granularity:** ~~one structured "noun-facts" pass then a prose pass, or end-to-end?~~
  **RESOLVED → two-stage: structured fact extraction → grounded prose generation/merge.** Facts (raw
  `call_structured`, chronicle-style) are the per-session intermediate that drives entity-linking,
  create-vs-update, dedup, and review; prose (`call_text`, mouthpiece-style) is grounded on them. **Page
  prose stays the SSOT — no separate fact-KB** (a fact-KB would clobber human polish + fight D3). dspy:
  **raw to start** (no labels yet); revisit dspy for the extraction/filter step only if quality demands
  it and labels are worth authoring.
- **Entity-link representation:** ~~build a typed unified entity registry, or resolve opportunistically?~~
  **RESOLVED → build a typed unified entity registry** (KDL), the in-world entity layer astra lacks (the
  documented-but-unwired "lexicon ↔ akasha union"). Holds: kind (person/place/org/god/creature/item),
  canonical name, alias set (incl. known ASR garbles), wiki page path, ontology-being ref if a PC.
  Reusable beyond heartwood (could later power akasha fuzzy crossref). **This is now its own Phase 1
  (D8).** Sub-decisions for the **Phase-1 registry spec:** (a) **must not fork existing SSOTs** — seed
  from + reference defs.yaml (ASR-correction SSOT) and ontology-being (PC SSOT), adding only net-new
  (typed `kind` + page link); (b) **home** — likely a sibling under `ontology/` (the in-world
  counterpart to META `ontology-being`), though machine-maintained; (c) **discovery of new entities** is
  a later concern (the proposer proposes registry additions in Phase 2–3; they're applied on
  review-approval in Phase 4) — Phase 1 builds the seed + the resolution API. Resolution reuses linguist's
  `surface/phonetics.ensemble_sim` + `Lexicon`.
- **Provenance:** ~~mark machine-touched content, or keep pages indistinguishable once approved?~~
  **RESOLVED → no marking.** Once approved, a page is indistinguishable from hand-authored — human
  review makes them the author-of-record. Provenance lives out-of-band in git history + the change-set
  KDL store. (Keeps rendered prose clean; honors the human-feel goal.)
- **Steady-state automation (deferred D1 tail):** stay fully human-gated, or eventually auto-commit
  brand-new pages while gating edits? **CONFIRMED-DEFERRED** → revisit after the prose-proposer phase
  (Phase 3) shows the prose's earned trust. All phases through the review surface (Phase 4) are
  always-human-gated regardless.
- **Bestiary:** ~~opportunistic, or a deliberate seeding pass?~~ **RESOLVED → opportunistically.**
  heartwood creates the Bestiary folder + first page naturally the first time a session yields a
  flora/fauna/item noun that warrants one; it grows like any other section. No dedicated seeding effort.
- **Which campaigns/settings to ingest:** ~~faerrin only? the Astra meta-setting one-shots too? how to
  bound it?~~ **RESOLVED → a typed `world` field on campaigns (D10); ingest `world == faerrin` only for
  now.** Add `world` to `Campaign` in ontology-being (both schemas, part of Phase 1); the Astra
  meta-setting is enabled later by flipping the filter. (A future extension: `world` on registry
  entities too, for a multi-world akasha — not now.)

---

## 8. Next step

**✅ The Phase-1 scope doc is authored + question-free** (decisions P1.1–P1.8; the matchers + names
vocabulary lift into a new shared lib **`astra-lexicon`** with `defs.yaml → defs.kdl`). Next is its
NLSpec.

The Phase-1 scope doc — ontology infra (entity registry + `world` field) —
(`thoughts/shared/research/2026-06-27-heartwood-0020-phase1-registry-thoughts.md`) details: the
**`world` field** on `Campaign` (both schemas, faerrin-only filter); the registry **KDL schema**
(kind/canonical/aliases/page-path/being-ref); the **seed-don't-fork** mechanism against defs.yaml + the
akasha snapshot + ontology-being; its home under `ontology/`; the **resolution API** (reusing
`surface/phonetics.ensemble_sim` + `Lexicon`) the proposer will call; telemetry; and the Phase-1
acceptance gate — then its NLSpec via `octo:spec`. **Per `resolve-open-questions-before-next-stage`, I'll
surface any decision points one at a time while drafting, and won't advance to the spec until the doc is
question-free.** Then the **Phase-2 (extraction engine)** and **Phase-3 (prose proposer + voice guide +
KDL change-set format)** scope docs follow in turn. Implement each with `octo:embrace`, telemetry from
day one, reproducing CI locally before pushing, per `CONTRIBUTING.md`.
