# 0024 — mouthpiece script-generation rework: scoping doc

- **Date:** 2026-07-07
- **Subsystem:** `apps/mouthpiece-backend` (Stage 2/3 — digest + script), package `astra_mouthpiece`
- **Status:** SCOPED — all open questions RESOLVED with the stakeholder; ready for spec (`0024-mouthpiece-script-rework-spec.md`)
- **Supersedes (behaviorally):** the distill/beats design in `thoughts/astra/specs/0008-mouthpiece-backend-spec.md` (M-decisions referencing `SessionDigest`/beats/mega) — the new spec should note the supersession explicitly.
- **Verified against:** the live repo (prompts, assets, tests read first-hand); two exhaustive sweeps (blast-radius inventory; transcript-corpus calibration). faerrin's working copy is deleted from disk (2026-07-04) so no faerrin cross-check is possible or needed — the prompts being replaced are the byte-for-byte port.

## 1. Motivation (stakeholder, 2026-07-07)

1. **Threads are dead weight** — the running-threads system (`threads.py`) was never wired to write
   (`extract_threads`/`merge_threads` are called only from tests; `threads.json` is read-if-present but
   nothing produces it). Stakeholder: delete it.
2. **The distill stage is obsolete at today's context sizes.** GLM-5.2 (`z-ai/glm-5.2`) has a
   1,048,576-token context. Sessions are 25–40k dialogue words (~35–55k tokens) — the whole transcript
   plus grounding plus continuity fits with an order of magnitude to spare. Compressing to
   synopsis/beats (the digest) throws away the actual table dialogue Pass A could feed on. Stakeholder:
   replace distill with a **clean + enrich** stage — remove OOC noise, keep everything narrative, and
   let Pass A read the cleaned transcript directly.
3. **Episodes recite exact roll values.** Root cause verified: the distill prompt *explicitly asks for
   them* — beat `details` should capture "a clutch or disastrous dice roll" (`prompts.py:46-48`) and
   Pass A must "COVER EVERY BEAT" including its details (`prompts.py:326`). Stakeholder: hosts should
   refer to mechanics in narrative terms ("barely scraped by", "a catastrophic whiff"), not numbers.

## 2. Settled decisions (RESOLVED 2026-07-07, AskUserQuestion)

| # | Decision | Resolution |
|---|---|---|
| D1 | Enrich scope | **Minimum viable**: short synopsis (episode-index blurb) + `wiki_refs` (akasha grounding) + speaker→character mapping. No scene markers, no editorial/tone hints. |
| D2 | mega fate | **Drop entirely** — delete `mega.py`, the `mega_digest` asset, `MegaConfig`. Rebuildable later on the new shapes if a month-in-review is ever wanted again. |
| D3 | Process | Full **scope → spec → build** gates. |
| D4 | Filter bar | **Cut bookkeeping only**: drop recording chatter, scheduling/logistics, tech issues, snack/life talk, pure initiative/HP/check arithmetic. **Keep rules debates and table banter** — they are the comedy the debate show feeds on. Keep all narrative content. |

Verified amendment to D1: **the speaker→character mapping already exists upstream and needs no LLM
output.** Canonical transcript speaker labels are *already billed character names* — linguist resolves
Discord user → player (`roster.py:21-37`) → billed character (`campaigns.py:73-104`,
`context.py:34-37`) before `to_canonical()` (`canonical.py:14-34`) writes the file. Every line of
every sampled transcript matches its campaign's exact character roster (e.g. all 4,055 lines of
2026-6-8 match `Argyle|Arctos|Benny|Johnny|Anzu|Gamemaster`). So D1's mapping is delivered
**deterministically**: a roster block (character, class, one-line description, player) read from
`ontology/ontology-being/being.kdl` (`campaign` → `role player= character= class=` nodes,
being.kdl:70-167) via the session's show, injected into Pass A's user content. The enrich LLM output
is therefore just **synopsis + wiki_refs**.

## 3. Current flow (verified, for the record)

`session_digest → session_script → session_audio_clips → session_episode`, one dynamic partition per
date, chronicle-gated (`linguist_io.chronicle_gate_open`, linguist_io.py:91-100).

- **Stage 2 distill** (`digest.py:94`, `DISTILL_SYSTEM_PROMPT` prompts.py:17-57): one forced-tool call
  over the raw transcript → `SessionDigest{synopsis, beats[18-25], discarded}` → `digest.json`.
- **Stage 3 script** (`session.py:26` → `script.py:123` `generate_two_pass`):
  - user content (`build_script_user_content`, prompts.py:237-282) = synopsis + continuity block
    (0021, `CONTINUITY_BUDGET=26k` chars) + rendered beats + wiki excerpts (`GROUNDING_BUDGET=24k`
    chars, matched from beat `wiki_refs` by `ground_digest`, grounding.py:80-113) + threads block.
  - **Pass A** improv debate (`build_improv_system_prompt`, prompts.py:288-343): free-text
    `call_text`, ~4,500–5,500 words, `max_tokens=32k` (`DEFAULT_SCRIPT_MAX_TOKENS`, script.py:27).
  - **Pass B** dressing (`build_dressing_system_prompt`, prompts.py:346-383): formatter-not-writer
    forced-tool pass → `ScriptTurn`s + title, chunked at `PASS_B_CHUNK_WORDS=2,200` (script.py:35).
- Retry layering: Dagster `_EXTERNAL_RETRY` (3×, exp backoff) × litellm `num_retries=5` ×
  `_TOOL_JSON_ATTEMPTS=3` on malformed forced-tool JSON; `finish_reason=length` fails loud, no retry.

## 4. Verified constraints and findings

### F1 — Input is a non-issue; **output** is the binding constraint
Largest transcript: 6,202 lines / ~34k dialogue words (2026-6-18). GLM-5.2 context 1M tokens. But
generatively **re-emitting** a cleaned transcript would need 30–50k output tokens — over the 32k
budget, and GLM's reasoning tokens *share* `max_tokens` (the exact mechanism that silently truncated
heartwood's extraction — see memory `heartwood-0020-gotchas`). **Therefore the filter must emit
compact verdicts (line ranges), never the transcript text itself.** Assembly is deterministic.

### F2 — Line ids are a safe addressing scheme
All 46 canonical transcripts use `NNNNNN\t Speaker: text  `, ids strictly 1..N contiguous, no
gaps/duplicates (generator is a bare incrementing counter, `canonical.py:26-33`; spot-verified on 4
files: last id == line count, mid-file id == file line). `parse_canonical_transcript`
(linguist_io.py:46-54) already returns `(line, speaker, text)` tuples — the ranges apply directly.

### F3 — heartwood's filter is the architecture to port (verify-before-acting)
`apps/heartwood-backend/src/astra_heartwood/filter.py` already OOC-filters these same sessions:
fixed **20-turn windows** (`FILTER_WINDOW_TURNS=20`), windows batched under a 12k-word budget per
call (filter.py:76-90), each window classified keep/drop with a category
(`in_world|ooc|combat|play_by_play`), **keep-when-in-doubt** (missing verdict ⇒ keep,
filter.py:142-143). Port this architecture; do **not** port its bar — heartwood keeps only
wiki-durable content and drops combat/banter, whereas D4 keeps banter, rules debates, and all
narrative including combat. New prompt, same machinery. (heartwood reads the pre-canonical
`data/<date>.json`, mouthpiece reads `transcripts/*.txt` — no shared artifact today; unifying them is
explicitly **out of scope** for 0024, noted as a future option.)

### F4 — The downstream contract of Stage 2 is exactly one field
The only readers of `digest.json` outside the script stage: `episodes_index.py:344-345,352` reads a
top-level `synopsis` string (missing file/key degrades cleanly to `""`), and `migrate.py:54-57`
copies the file if present. The frontend consumes only the index's `synopsis` string
(`build-content.ts:55,100`; `episode/$id.tsx:68-71`). **Nothing anywhere reads `beats`.**
⇒ Keep the on-disk filename **`digest.json`** and a top-level `synopsis` key; the rest of the schema
is free to change with **zero** ripple into episodes_index / publish / migrate / frontend. Keep the
Dagster asset name **`session_digest`** too — renaming an asset key orphans materialization history
and touches `dagster/definitions.py` + sensors for no benefit.

### F5 — Deletion traps
- `episodes_index.py:45` imports `date_sort_key` from `mega.py` — pure, mega-independent; **relocate
  it (and `date_in_range`) before deleting `mega.py`** (natural home: `episodes_index.py` itself).
- `dagster/definitions.py:24,72` imports + registers `mega_digest` — the code location
  `ImportError`s if missed.
- `__init__.py` exports `distill_session`, `parse_digest`, `Beat`, `SessionDigest`, `mega_id`,
  `fuse_digests`, `select_members` (`__init__.py:11,15,16-25,49`).
- The **one-shot legacy arm** (`generate_one_shot`, script.py:167-194) consumes beats directly — it
  cannot survive the shape change. Delete it (and the `two_pass` flag + `build_script_system_prompt`,
  prompts.py:85-210). The golden A/B comparison it served (0008 gate) is long closed.
- **Sharpen** (`sharpen.py`) operates on `Script` + hosts only — unaffected; stays as-is (unwired).

### F6 — Degenerate sessions exist
2026-7-6's canonical transcript is largely ASR noise ("you" repeated hundreds of times). The filter
must degrade gracefully: dropping most windows of a degenerate session is *correct*; the stage should
fail loud only if the cleaned transcript falls below a sanity floor (a handful of kept lines), so a
bad ASR run doesn't silently produce an empty episode.

### F7 — Roll-value fixation is caused by the deleted stage, belt-and-suspenders anyway
Deleting distill removes the "capture the dice roll" instruction (prompts.py:46-48). But the cleaned
transcript now *contains* the raw numbers, so Pass A gets an explicit instruction: refer to mechanics
in narrative terms (how close, how costly, how lucky) — never recite die results, modifiers, DCs, or
HP arithmetic; a specific number is allowed only when the number itself is the joke.

## 5. Proposed design

### New Stage 2 — clean + enrich (asset `session_digest`, file `digest.json`, new schema)

Two sub-steps inside the same asset:

1. **Filter (windowed classification, ported from heartwood):** segment the parsed turns into
   20-turn windows; batch windows under a word budget per forced-tool call; each window →
   `keep|drop` (+ category for observability). Bar per D4: DROP recording markers, scheduling/
   logistics, tech issues, real-life talk, pure roll/initiative/HP arithmetic; KEEP rules debates,
   banter/jokes, and all narrative (combat included). Keep-when-in-doubt. Compact output only —
   window verdicts, never transcript text (F1).
2. **Enrich (one forced-tool call on the *cleaned* transcript):** → `synopsis` (2–4 sentences,
   index-blurb register) + `wiki_refs` (flat list of proper nouns a setting wiki would document —
   same guidance as the old distill's wiki_refs instruction, minus beats).

**Artifact — `digest.json` (new schema, same filename per F4):**
```jsonc
{
  "sessionId": "...",
  "synopsis": "...",              // the one load-bearing legacy key (F4)
  "wikiRefs": ["..."],            // flat; ground_digest drops its per-beat flattening
  "keptRanges": [[1, 14], [52, 388], ...],  // inclusive line-id ranges into the canonical transcript
  "stats": {"lines": 6202, "kept": 4980, "windows": 311, "dropped_windows": 61}
}
```
The cleaned transcript is **not stored** — `session_script` re-derives it deterministically
(`transcript_for` + `parse_canonical_transcript` + apply `keptRanges`). Single source of truth, small
artifact, and the ranges are auditable against the source. Sanity floor per F6 (fail the asset if
kept lines < floor).

### Stage 3 — Pass A reworked, Pass B untouched

- **New user content** (replaces `build_script_user_content` + `render_beat`): continuity block
  (unchanged, 0021) + **roster block** (deterministic from being.kdl via the session's show — D1
  amendment) + the **cleaned transcript** (`NNNNNN\tSpeaker: text` lines, or speaker+text without
  ids — spec decides the cosmetic detail) + wiki excerpts (grounding unchanged except the flat
  `wikiRefs` read). Threads block deleted.
- **Pass A prompt rewrite** (`build_improv_system_prompt`): keep the debate voice, format contract,
  and length discipline verbatim where possible; replace every digest/beat reference:
  - source framing: "the session transcript below" instead of "the digest";
  - coverage anchor: "walk the session in the order it happened; give every major development a real
    exchange" — **the transcript's own chronology replaces the beat list** (accepted risk, see R1);
  - grounding rule: "do NOT invent events not in the transcript";
  - **narrative-mechanics instruction** per F7.
- **Pass B, chunking, TTS, assemble:** unchanged. `PASS_B_CHUNK_WORDS`, dressing prompt, and all
  downstream stages are input-agnostic.

### Deletions
- `threads.py` + `models.Thread`/`ThreadKind` + the `threads_block` parameter threaded through
  `assets.py:46,166,180` → `session.py:35,49,84,99` → `script.py:131,142,175,187,206,221` →
  `prompts.py:242,264,282`.
- `mega.py` (after relocating `date_sort_key`/`date_in_range`), `MegaConfig` + `mega_digest` asset
  (assets.py:235-279,395), `dagster/definitions.py:24,72`, `__init__.py:15,49`.
- `digest.py`'s beat machinery (`parse_digest`, `_parse_beat`, beat renumbering), `models.Beat`,
  `SessionDigest.beats/discarded`, `schemas.distill_tool`, `prompts.DISTILL_SYSTEM_PROMPT` +
  `build_distill_user_content` + `render_beat`, `generate_one_shot` + `build_script_system_prompt` +
  the `two_pass` flag.
- Stale doc lines: assets.py/models.py/episodes_index.py/assemble.py docstrings,
  `deploy/docker-compose.yml:24` comment, `CALIBRATION.md` mega row.

### Explicitly out of scope (spec must not silently expand)
- Sharing the cleaned artifact with heartwood (future option).
- Re-rendering historical episodes (forward-only, same as 0021's continuity).
- Any change to Pass B, TTS, assemble, episodes_index schema, frontend, publish/snapshot flow.
- Rebuilding a mega/month-in-review capability.

## 6. Test plan (from the blast-radius inventory)

- **Delete:** `test_extras.py` threads tests (:144-159), mega tests (:54-98);
  `test_mouthpiece.py::test_parse_digest_*` (:65-96), `::test_distill_session_uses_call_tool`
  (:99-108), one-shot test (:218-222).
- **Rewrite:** `test_assets.py::test_the_four_assets_plus_mega_and_index_have_expected_keys` (drop
  mega); `test_extras.py::test_script_user_content_byte_identical_when_no_continuity` (re-author
  against the new user-content builder — keep the byte-identical-when-empty continuity contract);
  `test_mouthpiece.py` grounding tests (:142-194, flat wikiRefs), two-pass tests (:204-215,243-255,
  new fixture), `test_audio.py::test_produce_episode_end_to_end` (:162, new fixture);
  `test_extras.py::test_date_sort_key_and_range` (import from the new location).
- **New:** filter windowing/assembly (ranges → cleaned turns, boundary cases, keep-when-in-doubt on
  missing verdicts, sanity floor on a degenerate fixture); enrich parse; roster block rendering;
  Pass A user-content golden; the `digest.json` synopsis contract (old-schema *and* new-schema files
  both index correctly — historical episodes keep old digests forever).
- **Survive untouched (guard rail):** `test_episodes_index.py`, `test_episodes_snapshot.py`,
  `test_migrate.py` and the 7 golden fixtures — they only read `synopsis`/`turns` and must stay green
  with zero edits; if they need edits, the F4 contract was broken.

## 7. Risks / accepted trade-offs

- **R1 — coverage without beats.** The beat list was Pass A's table of contents ("COVER EVERY
  BEAT"). The stakeholder explicitly declined scene markers (D1), so chronology + prompt craft is
  the coverage mechanism. Accepted; acceptance includes a human listen/read for coverage and depth
  vs a recent episode (see §8). If coverage regresses, the fallback is revisiting D1's "also scene
  structure" option as a follow-up decision — not a silent re-add.
- **R2 — filter cost/latency.** ~310 windows/session ⇒ a handful of batched classification calls +
  one enrich call, replacing one big distill call. GLM-5.2 is cheap; well under a dollar per
  session. Non-issue, noted for the record.
- **R3 — GLM forced-tool flakiness** on many small calls: already handled by the client
  (`_TOOL_JSON_ATTEMPTS=3`, litellm `num_retries=5`) + keep-when-in-doubt absorbing a lost window
  verdict.
- **R4 — longer Pass A input** (~50k tokens vs ~8k): prompt-cache still covers the static system
  prompt; per-call cost rises modestly (input tokens are cheap on GLM). The 32k output budget and
  length discipline are unchanged.

## 8. Acceptance sketch (for the spec)

A. CI lanes green with the §6 test plan; the guard-rail tests untouched.
B. Re-render one recent real session end-to-end on the new flow (in-container materialize,
   SOPS-injected env — see memory `pipeline-reorder-0021` for the `sh -c`/`/opt/venv/bin/dagster`
   gotchas): episode renders, index rebuilds, frontend snapshot publishes.
C. The rendered script: no recited roll values/DCs/HP arithmetic (spot-grep numbers + human read);
   mechanics referenced narratively; coverage subjectively ≥ a recent beat-driven episode (R1).
D. A degenerate-transcript fixture fails loud at the sanity floor, not silently empty.
E. SigNoz: `session_digest` span shows the new window/kept stats attrs; `astra.llm.*` cost attrs
   present on the new calls.
