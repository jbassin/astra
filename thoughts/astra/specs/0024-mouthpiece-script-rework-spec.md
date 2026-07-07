# 0024 — mouthpiece script-generation rework — NLSpec

- **Status:** SPEC — ready to implement. Decisions resolved; no open questions.
- **Scope doc:** `thoughts/shared/research/2026-07-07-mouthpiece-script-rework-0024-thoughts.md` (verified)
- **Date:** 2026-07-07
- **Subsystem slug:** `mouthpiece-script-rework`
- **Supersedes (behaviorally):** the distill/beats/mega/threads design of
  `0008-mouthpiece-backend-spec.md` (M1–M12 where they reference `SessionDigest.beats`, `distill_tool`,
  mega, threads, and the one-shot arm). 0008's Pass B / TTS / assemble / episodes-index decisions stay
  in force. 0021 Change B (continuity) is untouched and stays in force.

## 1. Overview

Stage 2 of the mouthpiece pipeline compresses each session transcript into a synopsis + 18–25 beats
(`distill_session`), and Pass A writes the debate episode from those beats. That design predates
GLM-5.2's 1,048,576-token context: sessions are 25–40k dialogue words (~35–55k tokens), so the model
can now read the whole table conversation directly — the compression step discards exactly the
dialogue, banter, and texture the debate show feeds on.

This rework:

1. **Replaces distill with clean + enrich** — a windowed keep/drop OOC filter (heartwood
   architecture, mouthpiece bar) emitting **compact line ranges** (never re-emitted text — the
   32k-output / reasoning-shares-`max_tokens` truncation constraint, scope F1), plus one enrich call
   on the cleaned transcript producing `synopsis` + flat `wiki_refs`.
2. **Feeds Pass A the cleaned transcript** (plus a deterministic character-roster block from
   `being.kdl`, plus the unchanged grounding + continuity blocks), with an explicit
   **narrative-mechanics** instruction: refer to rolls/DCs/HP in narrative terms, never recite the
   numbers.
3. **Deletes dead weight:** the threads system (never wired to write), mega (stakeholder D2), and
   the one-shot legacy arm (consumes beats; cannot survive the shape change).

Pass B, chunking, TTS, assemble, episodes-index schema, publish/snapshot, and the frontend are
**untouched**. The chronicle ordering gate and backlog-adoption invariant are **untouched**.

### Resolved decisions (stakeholder, 2026-07-07 — scope doc §2)

- **D1** — enrich = minimum viable: synopsis + wiki_refs. No scene markers, no editorial hints.
  *Verified amendment:* speaker→character mapping already exists upstream (linguist bills speakers to
  character names before writing the canonical transcript), so the roster is delivered
  deterministically from `being.kdl`, not by the LLM.
- **D2** — mega deleted entirely.
- **D3** — full scope → spec → build gates (this doc is the spec gate).
- **D4** — filter bar = cut bookkeeping only: DROP recording chatter, scheduling/logistics, tech
  issues, real-life talk, pure roll/initiative/HP arithmetic; KEEP rules debates, table banter/jokes,
  and all narrative content (combat included — this bar is deliberately wider than heartwood's).

## 2. Actors

- **linguist** — writes the canonical transcripts (`apps/linguist/transcripts/<stem>.<date>.txt`,
  `NNNNNN\tSpeaker: text`, ids strictly 1..N contiguous — scope F2). Speaker labels are already billed
  character names. Unchanged by this rework.
- **mouthpiece Stage 2** (`session_digest` asset — name kept, scope F4) — becomes clean + enrich.
- **mouthpiece Stage 3** (`session_script`) — Pass A input rework; Pass B untouched.
- **episodes_index / publish / frontend** — read only `digest.json`'s top-level `synopsis` string;
  must not need edits (guard rail).
- **ontology-being** (`being.kdl` `campaign`/`role` nodes) — source of the roster block.

## 3. Stage 2: clean + enrich

New module `apps/mouthpiece-backend/src/astra_mouthpiece/clean.py` (replaces `digest.py`'s beat
machinery; `digest.py` is deleted). Orchestrated by the existing `session_digest` asset.

### 3.1 Filter (windowed keep/drop — port heartwood's architecture, not its bar)

Mirror `apps/heartwood-backend/src/astra_heartwood/filter.py` (scope F3):

- Segment the parsed turns (`linguist_io.parse_canonical_transcript` → `(line, speaker, text)`)
  into fixed **20-turn windows** (`FILTER_WINDOW_TURNS = 20`).
- Batch consecutive windows under a **12k-word budget** per `call_tool` (`FILTER_BATCH_WORDS`);
  each call's tool output is a compact verdict list:
  `windows: [{window: int, decision: "keep"|"drop", category: "noise"|"logistics"|"life"|"bookkeeping"|"content"}]`.
  Categories are observability-only; `decision` is the only load-bearing field.
- **Keep-when-in-doubt:** a window with a missing, duplicate-conflicting, or malformed verdict is
  KEPT (heartwood precedent, filter.py:142-143). The client's existing `_TOOL_JSON_ATTEMPTS=3` +
  litellm `num_retries=5` absorb GLM forced-tool flakiness; a still-lost verdict degrades to keep,
  never to a crash or a drop.
- New system prompt (`prompts.py`), bar per D4. It must state both directions explicitly, with the
  KEEP side dominant ("when torn, keep"), and name the drop categories concretely (recording
  markers, scheduling, tech/connectivity, snacks/life, pure check/initiative/HP arithmetic) —
  **plus an explicit `asr_noise` drop category** for unintelligible/content-free ASR repetition
  (adversarial finding 3: the motivating degenerate transcript, 2026-7-6, is ~600× bare `"you"`
  lines — without this category, keep-when-in-doubt would KEEP the gibberish, clear the sanity
  floor, and render a garbage episode instead of failing loud).
- Kept windows collapse to **inclusive line-id ranges** (`kept_ranges: [[start, end], ...]`,
  adjacent kept windows merged). Deterministic helper
  `apply_kept_ranges(turns, ranges) -> list[tuple[int, str, str]]` reassembles the cleaned turns;
  it is the single assembly function used by Stage 2 (for the enrich input) and Stage 3 (for the
  Pass A input).
- **Sanity floor (scope F6):** after filtering, `kept_lines < KEPT_LINES_FLOOR` (constant, `150`)
  ⇒ raise (fail the asset loudly). A degenerate ASR session (e.g. 2026-7-6's "you"-noise transcript)
  must fail here, not render an empty episode.

### 3.2 Enrich (one call on the cleaned transcript)

One `call_tool` whose user content is the **cleaned** transcript (30k words input is fine; output is
small — client default 16k `max_tokens`):

- `synopsis` — 2–4 sentences in the episode-index-blurb register (it is the public blurb on
  mouthpiece.iridi.cc).
- `wiki_refs` — flat list of proper nouns (factions, places, people, concepts) a setting wiki would
  document; same guidance as the old distill instruction (prompts.py:37-39), no fabrication, names
  as they appear in the transcript.

### 3.3 Artifact — `digest.json` (same filename + asset name, new schema — scope F4)

`SessionDigest` (models.py) is **redefined** (same class name — it remains the type threaded through
`session.py`/`script.py`):

```python
class SessionDigest(BaseModel):
    session_id: str
    synopsis: str
    wiki_refs: list[str] = []
    kept_ranges: list[tuple[int, int]] = []   # inclusive line-id ranges into the canonical transcript
    dropped: list[DroppedRange] = []          # [{range: [start, end], category}] — the audit trail
    stats: DigestStats                        # lines, kept_lines, windows, dropped_windows
```

`dropped` keeps heartwood's per-drop audit trail (adversarial finding 7): when acceptance C flags a
coverage question, the answer is readable straight from `digest.json` instead of manually inverting
`kept_ranges` against the raw transcript. `stats.lines` doubles as the Stage-3 drift anchor (§4.3).

Written via `model_dump_json(indent=2)` as today (atomic write). The **only externally consumed key
is the top-level `synopsis` string** (`episodes_index.py:344-345` — reads old-schema and new-schema
files identically; historical episodes keep their old digests forever). `Beat`, `Thread`,
`ThreadKind`, `SessionDigest.beats/discarded` are deleted from `models.py`.

The cleaned transcript is **not stored** — Stage 3 re-derives it from the canonical transcript +
`kept_ranges` (single source of truth; auditable; keeps the artifact small).

## 4. Stage 3: Pass A rework (Pass B untouched)

### 4.1 New user content (replaces `build_script_user_content` + `render_beat`)

`build_script_user_content(digest, cleaned_turns, roster_block, grounding, continuity_block="")`
renders, in order:

1. `SESSION — {session_id}` header + `Synopsis: {synopsis}`.
2. **Continuity block** (0021, unchanged semantics + placement): empty ⇒ the prompt is
   **byte-identical** to the no-continuity form (the existing contract/test carries over).
3. **Roster block** (`THE TABLE:`) — deterministic from `being.kdl`: resolve the session's show via
   `astra_linguist.chronicle.show_for_date` (already imported by the asset for continuity), map show
   → campaign roles, render one line per role. Exact rendering (adversarial findings 1–2 — the
   naive template breaks on real data):
   - PC with class + descs: `- Argyle (champion, played by Jorge): <descs joined>`;
   - PC with **no class** (`Role.character_class is None`, e.g. Arctos, being.kdl:81): omit the
     class — `- Arctos (played by Jorge): <descs>`;
   - **GM** (`class="gm"`, zero descs in every campaign, being.kdl:75 et al.): render
     `- Gamemaster, played by Josh` — no class parenthetical, no trailing colon (precedent:
     `campaigns.py:139` excludes GM names from desc rendering).
   Unmatched/excluded show ⇒ empty block, tolerated (same best-effort posture as continuity).
4. **Cleaned transcript** — rendered as `Speaker: text` lines **without** the numeric line ids
   (cosmetic noise; ~40k of prompt chars saved).
5. **Wiki excerpts** — unchanged rendering and `GROUNDING_BUDGET = 24_000`; `ground_digest`
   (grounding.py:98) switches from flattening per-beat `wiki_refs` to reading the flat
   `digest.wiki_refs`. Matching/dedup logic unchanged.
6. ~~Threads block~~ — deleted.

### 4.2 Pass A system prompt (`build_improv_system_prompt`) — targeted rewrite

Keep verbatim: the debate framing, the two-voice contract, the format contract (plain text,
`Name: text`), and the LENGTH discipline (~4,500–5,500 words, hard ~6,000 cap). Replace:

- Source framing: the hosts debated "the session transcript below" (not "the digest"); "do NOT
  invent events or outcomes not in the transcript".
- **Coverage anchor (replaces "COVER EVERY BEAT"):** walk the session in the order it happened;
  give every major development of the night a real exchange; skip dead table time; sit longer on
  the contested moments. The transcript's own chronology is the through-line (accepted risk R1 —
  no beat list exists to enumerate against).
- **Narrative mechanics (scope F7):** the transcript contains raw dice/DC/HP numbers; the hosts
  refer to outcomes in narrative terms — how close, how costly, how lucky — and **never recite die
  results, modifiers, DCs, or HP arithmetic**. A specific number is allowed only when the number
  itself is the joke.

### 4.3 Signature ripple (kept Dagster-free in `session.py`)

- `session_digest` asset: parse transcript → `clean.filter_session(...)` → `apply_kept_ranges` →
  `clean.enrich(...)` → write `digest.json`.
- `session_script` asset: read `digest.json` → re-read the canonical transcript via `linguist_io`
  (both stages already run in the same container against the same mount) → `apply_kept_ranges` →
  roster block → `build_episode_script(client, digest, cleaned_turns, pages, hosts,
  roster_block=..., continuity_block=..., model=...)`.
  **Stage-3 re-read guards (adversarial finding 4):** `transcript_for(date) is None` ⇒ raise
  `FileNotFoundError` (mirror the Stage-2 guard, assets.py:139-140); and before applying
  `kept_ranges`, assert the re-parsed transcript's line count equals `digest.stats.lines` —
  mismatch (linguist regenerated the transcript between stages, e.g. across a FROM_FAILURE
  re-execution) ⇒ fail loud, never silently apply stale ranges to a different file.
- `generate_script` loses `two_pass`/`threads_block`; `generate_one_shot`,
  `build_script_system_prompt`, and the `two_pass` parameter are **deleted**. `generate_two_pass` is
  renamed/kept as the only arm. `sharpen.py` is untouched (operates on `Script`; stays unwired).
- `produce_episode` (session.py) updated to the same signature.

## 5. Deletions (exact inventory — scope §5, blast-radius verified)

- **threads:** `threads.py`; `models.Thread`/`ThreadKind`; the `threads_block` param through
  `assets.py:46,166,180` → `session.py:35,49,84,99` → `script.py:131,142,175,187,206,221` →
  `prompts.py:242,264,282`; `test_extras.py:144-159` + imports.
- **mega:** relocate `date_sort_key` + `date_in_range` into `episodes_index.py` **first**
  (episodes_index.py:45 imports them); then delete `mega.py`, `MegaConfig` + `mega_digest`
  (assets.py:235-279,395), `dagster/definitions.py:24,72`, `__init__.py:15,49`, mega tests
  (`test_extras.py:54-98`), `test_assets.py` mega expectations.
- **distill/beats:** `digest.py`; `schemas.distill_tool`; `prompts.DISTILL_SYSTEM_PROMPT` +
  `build_distill_user_content` + `render_beat`; `models.Beat` + `SessionDigest.beats/discarded`;
  `__init__.py:11` exports; `test_mouthpiece.py` distill/parse tests.
- **one-shot arm:** `generate_one_shot`, `build_script_system_prompt` (prompts.py:85-210),
  the `two_pass` flag **through its full ripple** (adversarial finding 5): `script.py` +
  `session.py:32` (`build_episode_script`), `session.py:82,97` (`produce_episode`), and the
  explicit `two_pass=True` at the call site `assets.py:179`; its test.
- **stale docs:** assets.py/models.py/episodes_index.py/assemble.py docstring mentions;
  `deploy/docker-compose.yml:24` comment wording; `CALIBRATION.md` mega row + prose.

## 6. Constraints / invariants

1. **Compact-verdict rule (F1):** no LLM call in Stage 2 may emit transcript text — verdicts and
   ranges only. Assembly is deterministic.
2. **The `digest.json` contract (F4):** filename `digest.json`, top-level `synopsis` string. The
   guard-rail tests (`test_episodes_index.py`, `test_episodes_snapshot.py`, `test_migrate.py`, the 7
   golden fixtures) must pass **with zero edits**; an edit there means the contract broke.
3. **Asset names/keys unchanged** (`session_digest`, `session_script`) — no Dagster
   history/lineage churn; sensor untouched; chronicle gate + backlog-adoption invariant untouched.
4. **Forward-only:** published episodes and their on-disk digests are never migrated or re-rendered
   by this change (re-render is an acceptance activity, not a migration).
5. **Keep-when-in-doubt** in the filter; failure direction is over-keeping, never over-dropping.
6. **Byte-identity:** empty continuity ⇒ byte-identical prompt (existing 0021 contract, re-anchored
   on the new builder). Static-per-hosts system prompts stay cacheable (`_cached_system`).
7. **Telemetry from day one:** existing span wrapping stays; new attrs (§8).
8. **No silent scope cuts** ([[no-silent-scope-cuts]]): §5's out-of-scope list is the only
   sanctioned deferral set.

## 7. Implementation slices (each independently CI-green, conventional commits)

- **S1 `refactor(mouthpiece): delete threads`** — remove module/models/params/tests; assets stop
  reading `threads.json`. All defaults were `""` so the chain stays green.
- **S2 `refactor(mouthpiece): delete mega`** — relocate `date_sort_key`/`date_in_range` →
  `episodes_index.py`; delete mega.py/asset/config/definitions.py/exports/tests.
- **S3 `feat(mouthpiece): clean+enrich module`** — `clean.py` (windowing, batching, verdict
  parsing, keep-when-in-doubt, `apply_kept_ranges`, sanity floor, enrich), new prompts + tool
  schemas, new `SessionDigest`/`DigestStats` models, unit tests incl. a degenerate fixture.
  **Unwired** — `digest.py` still drives the asset, so this slice is additive-green.
- **S4 `feat(mouthpiece): cleaned-transcript script stage`** — the atomic cutover: rewire
  `session_digest` to clean+enrich; rework Pass A user content + system prompt + roster block;
  flat-`wiki_refs` grounding; delete `digest.py`/distill prompts/one-shot arm/`Beat`; rewrite the
  affected tests (scope §6). This slice cannot be split — the `SessionDigest` shape change makes
  Stage 2 and Stage 3 move together.
- **S5 `docs(mouthpiece): 0024 stale-reference sweep`** — docstrings, compose comment,
  CALIBRATION.md, 0008 supersession note.
- **S6 deploy + acceptance** — `just up` (dagster-code is image-baked — it must rebuild), then the
  §10 live re-render; memory update.

## 8. Telemetry

- `session_digest` span attrs: `mouthpiece.lines`, `mouthpiece.kept_lines`, `mouthpiece.windows`,
  `mouthpiece.dropped_windows`, `mouthpiece.wiki_refs`.
- `session_script` keeps `mouthpiece.key`/`continuity_*`/`turns`; adds `mouthpiece.cleaned_lines`.
- `astra.llm.*` cost/token attrs continue to land per call (the asset-level span wrapping already
  exists — do not remove it; module-scope metric instruments remain forbidden).

## 9. Tests (py lane only — no ts change)

Per scope §6: delete the threads/mega/distill/one-shot tests; rewrite the grounding, two-pass,
user-content-byte-identity, `test_assets` key-set, `produce_episode`, and `date_sort_key`-import
tests; add filter-windowing/assembly/floor/keep-when-in-doubt/enrich-parse/roster/golden-user-content
tests; keep the guard-rail tests untouched (constraint 2). CI = the standard py lane
(`uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest`).

## 10. Acceptance

A. Both CI lanes green locally; guard-rail tests unedited.
B. Live re-render of one recent real session end-to-end on the new flow (in-container materialize
   with SOPS env — `sh -c`, `/opt/venv/bin/dagster`; see [[pipeline-reorder-0021]]): episode
   renders, index rebuilds, snapshot publishes, frontend serves it. **Measure Pass A wall-clock**
   (adversarial finding 6): input grows ~8k → ~50k tokens against the per-attempt
   `REQUEST_TIMEOUT_S = 300` (client.py:40, added after a real Pass A hang); if the live call lands
   near the ceiling, raising `REQUEST_TIMEOUT_S` is **pre-authorized** — litellm's retries just
   repeat a doomed timeout otherwise.
C. The rendered script: zero recited roll values/DCs/HP arithmetic (spot-grep digits + human read);
   mechanics in narrative terms; coverage subjectively ≥ a recent beat-driven episode (risk R1 —
   if coverage regressed, stop and surface it; the fallback is a new D1 decision, not a silent
   re-add of beats).
D. The degenerate-transcript case fails loudly at the sanity floor — unit-proven AND a
   **mandatory** live negative check against the real 2026-7-6 transcript (adversarial finding 3:
   this is the case the `asr_noise` category exists for; "optional" would let the headline failure
   mode ship unexercised).
E. SigNoz shows the new §8 attrs and `astra.llm.*` costs on the new calls.

## 11. Risks (accepted at scope — §7)

- **R1 coverage without beats** — chronology + prompt craft replace the beat checklist; human
  acceptance C is the check; fallback is revisiting D1, never a silent re-add.
- **R2 cost** — a few batched filter calls + one enrich call replace one distill call; GLM pricing
  makes this well under a dollar per session.
- **R3 GLM forced-tool flakiness × many small calls** — absorbed by client retries +
  keep-when-in-doubt.
- **R4 bigger Pass A input** (~50k tokens) — cheap on GLM; output budget unchanged.

## Adversarial completeness pass

Run 2026-07-07 (independent reviewer over the spec + scoping doc + live source; verdict: **0 formal
blockers**, 2 blocker-grade-in-practice findings; all 7 findings verified against source and folded
in above):

1. **Roster GM line** (blocker-grade) — every campaign's GM role has zero `desc` children
   (being.kdl:75 et al.); the naive template produced a dangling colon on 100% of episodes.
   → §4.1.3 now specs the GM rendering explicitly.
2. **Class-less PC** — `Role.character_class` is `str | None` and a live main-campaign PC (Arctos,
   being.kdl:81) has no class; naive template rendered literal `"None"`. → §4.1.3.
3. **ASR-noise gap** (blocker-grade) — D4's drop categories had no home for ASR gibberish; under
   keep-when-in-doubt the degenerate 2026-7-6 transcript (~600× `"you"`) would be KEPT, clear the
   sanity floor, and render garbage instead of failing loud. → §3.1 `asr_noise` category +
   acceptance D's live negative check made mandatory.
4. **Stage-3 transcript drift** — no guard against the transcript changing between `session_digest`
   and a FROM_FAILURE `session_script` re-run. → §4.3 guards (missing ⇒ raise; line-count vs
   `stats.lines` ⇒ fail loud).
5. **`two_pass` ripple under-enumerated** — session.py:32,82,97 + assets.py:179 added to §5.
6. **Pass A timeout risk** — ~50k-token input vs `REQUEST_TIMEOUT_S=300` per attempt; retries would
   repeat a doomed timeout. → acceptance B measures wall-clock; raising the constant pre-authorized.
7. **Lost drop-audit trail** — heartwood persists per-drop category/sample; the draft kept only
   aggregates. → §3.3 `dropped: [{range, category}]` added to the artifact.
