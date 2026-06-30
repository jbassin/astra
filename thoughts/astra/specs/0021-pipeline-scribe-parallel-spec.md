# 0021 — pipeline reorder, Change A: parallelize scribe — NLSpec

- **Status:** SPEC — ready to implement. Decisions resolved (scope doc + this spec); **no open questions**.
- **Scope doc:** `thoughts/shared/research/2026-06-30-pipeline-reorder-0021-thoughts.md` (verified)
- **Date:** 2026-06-30
- **Subsystem slug:** `pipeline-reorder` (Change A of two; Change B = `0021-pipeline-chronicle-context-spec.md`)
- **Roadmap:** Decision H (pipeline = a Dagster asset graph, one partition per session, lineage). A
  refinement of 0005 (scribe), not a new subsystem. The scribe `assets.py` docstring already names
  this split as the planned refinement.

## 1. Overview

Split scribe's single `session_outputs` asset — which today **sequentially** merges audio then
transcribes inside one `process_session` call — into a fan-out/fan-in of four assets so that **audio
merge and transcription run in parallel**, with a shared one-time extraction and an explicit cleanup
step:

```
session_tracks          verify_zip + extract + roster-filter → persist player tracks to {tmp_path}/<date>/tracks/
   ├─► session_audio        (deps=session_tracks)  merge_audio       → saved/<date>/audio.mp3
   └─► session_transcript   (deps=session_tracks)  build_transcript  → saved/<date>/script.json
            session_cleanup (deps=[session_audio, session_transcript])  rm -rf {tmp_path}/<date>/
```

`session_audio` and `session_transcript` are independent given the extracted tracks, so Dagster's
multiprocess executor runs them concurrently. `session_cleanup` fans in on **both** tails, so the
temp tracks are deleted only after audio + transcript both succeed (the stakeholder-requested step).

Output paths (`saved/<date>/{audio.mp3,script.json}`) are **unchanged**, so the downstream linguist
sensor and the out-of-band `akasha-seed` recipe keep working with **no config or path change**.

This NLSpec assumes the verified facts + resolved decisions in the scope doc. **No open questions.**

## 2. Actors

- **The Craig-drop sensor** (`craig_drop_sensor`) — registers a `scribe_sessions` partition + run per
  new zip; its target becomes the four-asset selection.
- **The pipeline** (Dagster) — materializes the four assets in one run, audio ∥ transcript.
- **Downstream (unchanged):** linguist `scribe_output_sensor` (watches `saved/<date>/script.json`),
  the `akasha-seed` host recipe (reads `saved/<date>/audio.mp3`).

## 3. Asset graph + data flow

### 3.1 `session_tracks` (partitioned per date; root)
- `verify_zip(zip)` (`unzip -t`) → `extract_tracks(zip, scratch)` → `player_tracks(…, roster)`
  (drop bots/guests).
- **Persist** the surviving player tracks to a **stable per-partition dir** `{cfg.tmp_path}/<date>/tracks/`
  (filenames preserved — the stem encodes the discord user-id that `build_transcript` needs for
  `roster.user_of`). Publish the dir **atomically** (populate a `.partial` sibling, `os.replace` to
  the final name) so a downstream asset never sees a half-populated dir.
- Metadata: `{tracks: <count>}`.

### 3.2 `session_audio` (deps=`session_tracks`)
- `tracks = sorted(Path(cfg.tmp_path)/<date>/"tracks").glob("*.aac")`.
- `merge_audio(tracks, Path(cfg.data_path)/"saved"/<date>/"audio.mp3")` — existing function,
  unchanged (atomic `.tmp`→`os.replace`).
- Metadata: `{tracks: <count>}` (and optionally probed duration).

### 3.3 `session_transcript` (deps=`session_tracks`)
- Same `tracks` glob; `roster = Roster.from_being(BEING_KDL_PATH)`; `transcriber =
  TrackTranscriber(api_key=…, model=cfg.model)`.
- `script = build_transcript(tracks, roster, transcriber, work=<tempdir>)` — existing function,
  unchanged. Write `saved/<date>/script.json` atomically (the `.json.tmp`→`os.replace` discipline
  lifted from today's `process_session`).
- Metadata: `{segments: <count>}`. **This is the trigger surface for linguist** (it writes
  `script.json`).

### 3.4 `session_cleanup` (deps=`[session_audio, session_transcript]`)
- `shutil.rmtree(Path(cfg.tmp_path)/<date>, ignore_errors=True)` — removes the persisted tracks +
  any extract scratch. Runs only after **both** tails succeed (fan-in).
- Metadata: `{removed: true}`.

### 3.5 Refactor of `session.py`
`session.py` keeps the **pure, injectable** helpers (`merge_audio`, `build_transcript`, and a new
`extract_session_tracks(zip, dest, roster, *, verify=verify_zip, run=…) -> list[Path]` that wraps
verify + extract + filter + persist). `process_session` is **removed** (no test references it; the
four assets own orchestration now). Helpers stay free of Dagster + config (the assets supply paths).

## 4. Behaviors

- **B1** A new Craig zip triggers one Dagster run that materializes all four assets.
- **B2** `session_audio` and `session_transcript` execute **concurrently** (both depend only on
  `session_tracks`), each reading the shared persisted tracks — extraction + `verify_zip` happen
  **once** per session.
- **B3** `saved/<date>/audio.mp3` and `saved/<date>/script.json` are produced at the same paths as
  today, each written atomically.
- **B4** After both tails succeed, `session_cleanup` deletes `{tmp_path}/<date>/`. If either tail
  fails, the run fails and the tracks dir is **retained** (so a re-run reuses it / aids debugging).
- **B5** Downstream is untouched: linguist's `scribe_output_sensor` fires on `script.json` exactly as
  before; `akasha-seed` reads `audio.mp3` as before.

## 5. Constraints / invariants

- **C1 — config-single-source.** Use `cfg.tmp_path` (already in `ScribeConfig` + config.kdl, currently
  unused) for the persisted tracks; `cfg.data_path` for outputs. **No new config field, no schema
  change.** No hardcoded paths.
- **C2 — atomic appearance.** `audio.mp3` + `script.json` keep `.tmp`→`os.replace`; the tracks dir is
  published atomically (`.partial`→`os.replace`). A crash mid-write never exposes a partial artifact.
- **C3 — telemetry from day one.** Split the single `scribe.process_session` span into
  `scribe.extract` / `scribe.merge` / `scribe.transcribe` / `scribe.cleanup` spans; each asset returns
  Dagster `MaterializeResult` metadata. **Increment `_sessions_counter` exactly once** — on
  `session_transcript` (transcription = the "session transcribed" event) — not three times. The
  dagster code location already calls `init_telemetry`.
- **C4 — output contract frozen.** `saved/<date>/{audio.mp3,script.json}` paths + formats unchanged
  (linguist + akasha-seed depend on them). The roster filter still yields the same `tracks` set
  feeding both tails.
- **C5 — preserve the pure-helper testability.** `merge_args`/`chunk_args` purity and the
  inject-the-ffmpeg/transcriber/verify seams stay intact (CI has no ffmpeg/`unzip`/Groq).
- **C6 — no silent scope cuts.** All four assets (incl. the cleanup fan-in) ship; the parallelism is
  real (separate assets, not a sequential refactor).
- **C7 — port faerrin where applicable.** N/A — verified **no prior art** (faerrin `wretch/process_zip`
  also coupled merge→transcribe sequentially, zero concurrency). This is a net-new refinement.
- **C8 — re-run caveat (documented invariant).** Because `session_cleanup` deletes the tracks, the
  default executor won't auto-run upstream when you re-materialize a single tail. **To re-run
  `session_audio` or `session_transcript`, materialize from `session_tracks`** (select the root). Note
  this in the asset docstrings.

## 6. Implementation slices (each independently CI-green, conventional-commit per slice)

> Reproduce the py CI lane locally before pushing (`uv run ruff check && uv run ruff format --check &&
> uv run ty check && uv run pytest`); push when the chunk is done; do not watch GHA.

**S1 — `session.py` helper refactor (py).** Add `extract_session_tracks(...)` (verify + extract +
roster-filter + atomic persist to a dest dir); keep `merge_audio`/`build_transcript`; remove
`process_session`. Pure/injectable (verify + ffmpeg + transcriber seams). Unit tests: build a tiny
in-test `ZipFile` with two `.aac` (one player, one bot), monkeypatch `verify_zip`, assert only the
player track is persisted with its stem preserved. *Gate: pytest green; ruff + ty clean.*

**S2 — the four assets + sensor + definitions rewire (py).** Replace `session_outputs` in
`apps/scribe/.../assets.py` with `session_tracks`, `session_audio`, `session_transcript`,
`session_cleanup` (deps as in §3); set `craig_drop_sensor.target = [the four assets]`; update the
module docstring (drop the "v1 ships one asset" note). Update `dagster/definitions.py` `assets=[…]`
(swap the one for the four). Asset-layer unit tests with stubbed helpers: assert the deps wire
audio∥transcript after tracks and cleanup after both; assert `_sessions_counter` increments once.
*Gate: pytest green; `dagster/definitions.py` imports cleanly (definition-time introspection ok).*

**S3 — telemetry spans + cleanup + tmp hygiene (py).** Wire the four spans (C3); confirm
`{tmp_path}` (`apps/scribe/tmp`) is gitignored and that `session_cleanup` removes `{tmp_path}/<date>/`
fully; test cleanup deletes the dir and that a failed tail leaves it intact. *Gate: pytest green;
spans named per C3.*

**S4 — deploy + live verify.** Rebuild the dagster-code image (`docker compose build dagster-code` /
`just up`) so the new graph is live (image-baked code). Materialize a test partition (an existing
`scribe_sessions` date with a zip available, or a small fixture zip) and verify in SigNoz: the run
shows `session_tracks → session_audio ∥ session_transcript → session_cleanup`, the four spans, audio
∥ transcript overlapping in time, `saved/<date>/{audio.mp3,script.json}` produced, and
`{tmp_path}/<date>/` gone afterward. **No config.kdl / Caddy / edge change.** *Gate: a real partition
materializes through all four assets; linguist `scribe_output_sensor` still fires on the produced
`script.json`.*

## 7. Telemetry

- Spans: `scribe.extract`, `scribe.merge`, `scribe.transcribe`, `scribe.cleanup` (replacing
  `scribe.process_session`). `astra.scribe.sessions` counter incremented once (on `session_transcript`).
- Dagster `MaterializeResult` metadata per asset (tracks / tracks / segments / removed).
- Verify the audio ∥ transcript overlap in the SigNoz trace (proves the parallelism shipped).

## 8. Tests (py lane only — no ts change)

- `extract_session_tracks`: in-test zip, monkeypatched `verify_zip`, player-only persistence, stem
  preserved, atomic publish (no `.partial` left behind).
- Asset wiring: deps order (tracks → audio∥transcript → cleanup), single counter increment, metadata
  shapes (stubbed helpers; no ffmpeg/Groq).
- `session_cleanup`: removes `{tmp_path}/<date>/`; retained when a tail raises.
- Existing pure tests (`merge_args`/`chunk_args` purity, SoundStack parity, VAD, `new_sessions`)
  unchanged and still green.
- No `process_session` test existed; the new asset-wiring test is the replacement regression net.

## 9. Out of scope

- Change B (chronicle → mouthpiece context + ordering gate) — separate spec
  `0021-pipeline-chronicle-context-spec.md`.
- Making `craig-sync` (the host FUSE→incoming copy) a Dagster step — stays a systemd timer.
- Any change to the transcription model, ffmpeg merge args, roster, or output formats.
- Parallelizing the per-track transcription loop inside `build_transcript` (still serial per track;
  out of scope — this spec parallelizes only merge vs transcribe).

## 10. Acceptance

B1–B5 hold; a real session materializes through `session_tracks → session_audio ∥ session_transcript
→ session_cleanup` with audio + transcript overlapping in the SigNoz trace; `saved/<date>/{audio.mp3,
script.json}` produced at the unchanged paths and atomically; `{tmp_path}/<date>/` cleaned up after
both tails; linguist's sensor still fires on `script.json`; `_sessions_counter` increments once per
session; py CI green; the four spans visible in SigNoz; memory updated with the load-bearing gotchas
(persisted-tracks path + cleanup fan-in; default-executor separate-process fact; the re-run-from-root
caveat C8).
