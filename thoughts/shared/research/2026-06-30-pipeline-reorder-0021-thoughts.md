---
date: 2026-06-30
subsystem: pipeline-reorder
plan: "0021"
status: scoped — decisions resolved, ready to spec
related:
  - thoughts/astra/plans/0000-astra-migration-roadmap.md  # Decision H (Dagster asset graph)
  - thoughts/shared/memory/chronicle-0019-gotchas.md
  - thoughts/shared/memory/pipeline-live-run-gotchas.md
  - thoughts/shared/memory/mouthpiece-glm-debate-switch.md
---

# Pipeline reorder (0021) — scoping / research

## Why

Reshape the data-processing pipeline into the order the stakeholder wants:

```
craig zip lands
  → in parallel:  transcribe  ∥  merge audio
  → chronicle
  → mouthpiece   (using chronicle output as context)
```

Two independent changes fall out of comparing that target to the real graph:

- **Change A — parallelize scribe.** Today `merge` and `transcribe` are welded into one
  sequential asset; split them so they run concurrently.
- **Change B — chronicle feeds mouthpiece.** Today chronicle and mouthpiece are independent
  parallel branches off linguist; make mouthpiece (a) wait for chronicle and (b) consume its
  output as prompt context.

Stays inside **Decision H** (pipeline = a Dagster asset graph, one partition per session, lineage).
No roadmap decision conflicts; this is a refinement of the existing 0005 (scribe) / 0008
(mouthpiece) / 0019 (chronicle) assets, not a new subsystem.

## Current flow (verified against the live wiring)

Cross-app ordering is enforced by **sensors + on-disk file handoffs**, NOT cross-app Dagster
`deps`. Three sensors + one schedule drive everything (`dagster/definitions.py` is the single
code location).

```
[Craig recording on Google Drive]
   │  craig-sync systemd timer (5 min) — copies *.zip → scribe/incoming  (Docker can't read the FUSE mount)
   ▼
incoming/*.zip
   │  craig_drop_sensor            [scribe]   target: session_outputs
   ▼
session_outputs                    [scribe]   ONE asset (process_session, session.py:59-86):
   ├─ merge_audio      → saved/<date>/audio.mp3    (ffmpeg amix; atomic .tmp→os.replace)
   └─ build_transcript → saved/<date>/script.json  (Groq per-track transcription + SoundStack merge)
   │  scribe_output_sensor         [linguist]  watches saved/<date>/script.json
   ▼
session_transcripts                [linguist]  apply known corrections → canonical transcript
   ├─► correction_candidates       (deps=session_transcripts)  dspy judge → candidates
   └─► session_episode_summary     (deps=session_transcripts)  GLM → timeline/episodes/<date>.json   ← CHRONICLE
   │      └─► campaign_timeline (aggregate, hourly schedule, deps=session_episode_summary) → seasons.json
   │  linguist_output_sensor       [mouthpiece]  watches transcripts/*.txt (backlog-ADOPTING)
   ▼
session_digest → session_script → session_audio_clips → session_episode   [mouthpiece]
                                   (ElevenLabs TTS — its OWN audio, unrelated to craig audio.mp3)

OUT-OF-BAND (systemd linguist-commit timer, 15 min — NOT Dagster):
  akasha-seed: saved/<date>/audio.mp3 → artifacts/audio/akasha/<date>.mp3  (akasha serves /audio/<date>.mp3)
  mouthpiece-publish + mouthpiece-seed: episodes-index snapshot + episode mp3 → artifacts/audio/mouthpiece
```

**How the target differs (the three gaps):**
1. merge ∥ transcribe are coupled + sequential in one asset — not parallel.
2. the stakeholder model collapses `scribe → linguist`; chronicle/mouthpiece both read the
   **corrected** transcript, not scribe's raw `script.json`. **Linguist correction stays in the
   chain** (confirmed with stakeholder).
3. chronicle and mouthpiece are independent siblings — neither waits for the other, and
   mouthpiece consumes no chronicle output.

---

## Change A — parallelize scribe (split `session_outputs`)

### What's there (verified)

`process_session` (`apps/scribe/src/astra_scribe/session.py:59-86`) is a shared prefix + two
independent tails:

- **Shared prefix** (L70-73): `out.mkdir` · `verify_zip(zip_path)` (`ingest.py:24`) ·
  `tracks = player_tracks(extract_tracks(zip_path, work/"tracks"), roster)` (`ingest.py:34,43`).
  Output = a list of roster-filtered `.aac` paths.
- **Tail A — audio** (L75): `merge_audio(tracks, out/"audio.mp3")` — ffmpeg `amix`, atomic
  `.tmp`→`os.replace` (`session.py:27-42`).
- **Tail B — transcript** (L76-82): `build_transcript(tracks, roster, transcriber, work/"chunks")`
  → per-track Groq → `SoundStack.drain()` → `script.json`, atomic.

The two tails are **fully independent given `tracks`** — neither reads the other's output, they
write different files. `extract_tracks` is a **plain `ZipFile.extractall` (unzip only, NO
transcode)** — transcode happens later inside each tail (`audio.py` `merge_args`/`chunk_args`).
Extraction lands in a `tempfile.TemporaryDirectory()` (`assets.py:60`) → **ephemeral per run**.

`audio.mp3` has **no Dagster consumer** — only the out-of-band `just akasha-seed` recipe reads it
(`justfile:363-379`). Only `script.json` has a Dagster downstream (linguist `scribe_output_sensor`,
which checks `script.json` presence, never `audio.mp3`). So splitting audio into its own asset
needs **no new downstream sensor/dep**.

The scribe `assets.py` docstring (L9-12) **already anticipates this exact split**: *"the plan
models `session_audio` + `session_transcript` as two assets; v1 ships one `session_outputs` asset
(both files share one extraction). Splitting them is a refinement…"* — so this is a sanctioned
refinement, and "share one extraction" names the property to preserve.

### Faerrin prior art: NONE

faerrin's `wretch/python/process.py` `process_zip()` (L30-58) also coupled merge→transcribe
**sequentially in one function**, zero concurrency anywhere (grep for futures/asyncio/threadpool =
empty). So parallelizing is net-new, not a port — and astra's current coupling is not a regression.

### Decision A1 — RESOLVED: **shared extract asset**

Three Dagster assets replace `session_outputs`:

```
session_tracks      [scribe]  verify_zip + extract_tracks + player_tracks → persist tracks/ to a STABLE path
   ├─► session_audio       (deps=session_tracks)  merge_audio → audio.mp3
   └─► session_transcript  (deps=session_tracks)  build_transcript → script.json
```

- One unzip + one `verify_zip` per session (no redundant archive reads); `session_audio` and
  `session_transcript` run as parallel steps under the multiprocess executor.
- **Why not "re-extract in each":** wall-clock is equal either way (transcribe dominates the
  critical branch), but re-extract double-reads the archive; the stakeholder chose the cleaner
  lineage. *Cost of this choice:* `session_tracks` must persist tracks to a **stable filesystem
  path** (not a `TemporaryDirectory`) because Dagster's default multiprocess executor runs each
  asset in a separate process — two assets in one run do NOT share in-memory state or a per-step
  temp dir. So the spec must define a per-partition tracks dir (e.g.
  `data_path/work/<date>/tracks/`) **and its cleanup** (delete after `session_transcript` +
  `session_audio` both succeed, or a sweep — the temp-dir auto-clean we lose here).

### Change-A wiring + invariants the spec must hold

- `craig_drop_sensor.target` → `session_tracks` (the new root); the sensor logic is unchanged
  (still keys on `incoming/*.zip` → `scribe_sessions` partition).
- `dagster/definitions.py` `assets=[…]` swaps `session_outputs` → the three new assets.
- Preserve: atomic `.tmp`→`os.replace` for both outputs; `merge_args`/`chunk_args` purity; the
  roster filter producing one `tracks` list; output paths `saved/<date>/{audio.mp3,script.json}`
  unchanged (so akasha-seed + the linguist sensor keep working with **no config change**).
- **Test gap to close:** `test_scribe.py` has **no `process_session` integration test** (only pure
  arg-builders + sub-functions). Splitting the orchestrator breaks no existing test, but there's no
  regression net at this seam — the spec should add a small orchestration test for the new
  three-asset decomposition (extract once → both tails consume the persisted tracks).
- Telemetry: keep the `scribe.process_session` span intent — split into `scribe.extract` /
  `scribe.merge` / `scribe.transcribe` spans; keep `_sessions_counter` semantics (count a session
  once, not three times).

### Change-A risk notes

- Persisted tracks dir = new on-disk state to clean up (the one real cost of A1). Define ownership
  + cleanup explicitly in the spec; runs as `1000:1000` so writes are host-owned ([[deploy-artifacts-run-as-user]]).
- Modest latency win: the split removes only `merge` time from the critical path (transcribe ≫
  merge). Worth doing (stakeholder-requested + cleaner graph), but not a large speedup — note it.

---

## Change B — chronicle output as mouthpiece context + ordering gate

### Decision B1 — RESOLVED: **prior episodes + arc placement**

Mouthpiece consumes **recent PRIOR episode summaries + this session's season/arc placement**
("last time on…" continuity), NOT (primarily) this session's own summary — the current
transcript is already in the digest, so its own summary is largely redundant. This is the
genuinely additive context.

### B1 ⨉ B3 reconciliation (important)

"Prior episodes" already exist before this session runs, so strictly it wouldn't *need* a
per-session gate. But the chosen **hard gate on this session's own `episodes/<date>.json`** is a
clean **"chronicle has caught up through session N"** signal: chronicle processes in date order, so
N's file existing guarantees 1..N-1 exist → the prior-episode set mouthpiece reads is complete and
consistent (notably the immediately-preceding session is chronicled). The gate earns its keep even
though the context is prior-episodes.

### The context source (Seam 1, verified)

- Model `EpisodeSummary` (`apps/linguist/src/astra_linguist/chronicle.py:43-57`): 8 required
  fields — `title`, `synopsis`, `key_beats: list[str]` (an in-episode mini-timeline; **note
  `key_beats`, not `beats`**), `characters_present`, `locations`, `factions`, `items`,
  `cliffhanger`.
- Serialized as `EpisodeEntry` (`chronicle.py:84-89`): `{date, show, summary: EpisodeSummary}` →
  `timeline/episodes/<date>.json` (`assets.py:170-173`, `EPISODES_DIR` = linguist
  `timeline/episodes`). The asset **writes nothing** when `show_for_date(date) is None` (excluded /
  unmatched) — `assets.py:165-168`, `EXCLUDED_DATES` at `chronicle.py:39`.
- **No read-by-date loader exists** — only `load_episode_entries()` (loads ALL,
  `chronicle.py:117-122`). The spec adds a `load_episode_summary(date)` (trivial; must handle
  file-absent) and a "recent prior entries before date" selector (sort by `date_key`, the
  non-zero-padded `YYYY-M-D` tuple sort from `chronicle.py:111-114`; take last N before this date,
  same-show).

### Injection site (Seam 2, verified) — RECOMMENDED: **script stage**

faerrin put cross-session continuity at the **script** stage, not the digest: caster's
`running-threads` memory (jokes/grudges/predictions/recurring chars mined from past episodes) is
injected via a `threadsBlock` arg into `buildScriptUserContent`
(`faerrin/pkg/caster/src/script/prompt.ts:174-211`), deliberately keeping the per-session **distill
clean** (`distill/prompt.ts` is static/cacheable). astra already ports this: `session_script` reads
the akasha corpus + `threads_block` and `build_script_user_content` appends a `---`-separated block
(`apps/mouthpiece-backend/.../prompts.py:237-278`).

→ **Inject "prior episodes + arc" as a new context block at the script stage**, threaded the same
way as `threads_block` (through `build_episode_script` → `generate_script` →
`generate_two_pass/one_shot` → `build_script_user_content`, all with `= ""` defaults so the
one-shot arm + tests keep working). This matches faerrin precedent (continuity = script-stage) and
keeps the digest per-session. *Alternative (digest stage, `build_distill_user_content` header,
`prompts.py:60-79`) is rejected for B1* — it would bleed prior-session context into a summary
meant to describe only this session, and `mega_digest` bypasses distill entirely so wouldn't see it.

- **Budget guard:** `build_script_user_content` already budgets the akasha grounding
  (`GROUNDING_BUDGET = 24_000` chars). The prior-episode block needs its own cap (N episodes ×
  compact synopsis+beats) so it doesn't crowd the window.
- This is **forward-only** (like the GLM/debate switches): published episodes keep their scripts.

### The ordering gate (Seam 3, verified) — Decision B3 RESOLVED: **hard gate + carve-out**

`linguist_output_sensor` (`apps/mouthpiece-backend/.../assets.py:332-355`) currently fires off
transcript presence via `linguist_io.new_sessions` (`linguist_io.py:71-87`). Gate change:

- **Gate predicate:** a session is runnable when its transcript exists **AND** (its
  `episodes/<date>.json` exists **OR** its show is one chronicle will never summarize — excluded /
  unmatched). The carve-out is **mandatory**: without it, mouthpiece permanently stalls on every
  session chronicle skips. The "will never exist" test reuses chronicle's own
  `show_for_date(date)`/`EXCLUDED_DATES` (`chronicle.py`), imported from the linguist package.
- **Reach the path via the existing package-path convention.** mouthpiece config
  (`MouthpieceConfig`, `models.py:70-73`) has no linguist path, and linguist's
  `timeline/episodes` dir is a code constant — but `linguist_io` already reaches linguist's
  filesystem via `_LINGUIST_ROOT` (`linguist_io.py:18-21`), and `astra_linguist` is already a
  mouthpiece dependency. So import `astra_linguist.chronicle.EPISODES_DIR` /
  `show_for_date` directly — consistent with how `transcript_for` already works. *(Spec-time
  question: formalize a configured linguist→mouthpiece contract per [[config-single-source]], or
  keep the package-path convention `transcript_for` already set? Lean: keep the convention — this
  is internal cross-app filesystem layout, not deployment config, and matches existing precedent.)*
- **PRESERVE the backlog-adoption invariant.** The 2026-06-23 incident (re-enable → 42 PAID runs)
  is guarded by the `cursor is None` adoption branch. Adoption (register-as-known) and gating
  (defer-run) are **separate axes**: adopt partitions by **transcript** presence (unchanged), gate
  **run requests** by **episode** presence/skip. A gated-but-adopted session simply doesn't emit a
  run until its episode lands; it must never become "new" and fire a paid run later.

### Change-B risk notes

- The gate must not stall excluded/unmatched sessions (carve-out) and must not reintroduce the
  paid-replay incident (adoption-vs-gating separation). Both are testable predicate-level units.
- Cross-app filesystem coupling (mouthpiece importing linguist chronicle internals) is an implicit
  contract — acceptable (precedent: `linguist_io`), flag in the spec.
- Prompt-budget: prior-episode block competes with akasha grounding; cap it.

---

## Spec plan

Two independent specs under the **0021** umbrella (Change A ships first as a standalone win; Change
B is the feature that brings its own ordering edge — do its prompt change + gate together, never the
gate alone, which would only add latency):

- `thoughts/astra/specs/0021-pipeline-scribe-parallel-spec.md` — Change A.
- `thoughts/astra/specs/0021-pipeline-chronicle-context-spec.md` — Change B.

### Resolved decisions (carry into the specs)
- **A1** = shared `session_tracks` extract asset (persist tracks to a stable per-partition path +
  define cleanup).
- **B1** = prior episodes + this session's arc/season placement (not its own summary).
- **B2** (injection site) = script stage (faerrin precedent; digest rejected for B1).
- **B3** = hard gate + carve-out for chronicle-skipped sessions; preserve adoption.

### Open items to settle while writing the specs (none block scoping)
1. Change A: ~~exact persisted-tracks path + cleanup mechanism~~ **RESOLVED (stakeholder):**
   persist tracks under `cfg.tmp_path/<date>/tracks/`; cleanup is a dedicated **fan-in
   `session_cleanup` asset** (`deps=[session_audio, session_transcript]`) that `rm -rf`s the temp dir
   only after both tails succeed. Specced in `0021-pipeline-scribe-parallel-spec.md`.
2. Change B: N = how many prior episodes, and the per-block char budget.
3. Change B: keep package-path coupling vs add a configured linguist-timeline path
   ([[config-single-source]] tension — lean keep).
4. Change B: same-show only for "prior episodes," or whole-campaign? (likely same `show`, since
   `EpisodeEntry.show` is the campaign slug).

### Slice sketch (per spec, CI-green increments)
- **A:** (1) `session_tracks` extract asset + persisted tracks path; (2) `session_audio` +
  `session_transcript` split + sensor/definitions rewire + orchestration test; (3) telemetry spans
  + tracks cleanup; (4) deploy (rebuild dagster-code image, materialize a test partition).
- **B:** (1) `load_episode_summary(date)` + recent-prior selector in linguist chronicle; (2)
  prior-episode context block + script-stage plumbing + budget cap; (3) the gated
  `linguist_output_sensor` (predicate + carve-out, adoption preserved) + tests; (4) deploy +
  one live re-render to verify context lands in a script.
