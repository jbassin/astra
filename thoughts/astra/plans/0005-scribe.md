# Astra Sub-plan 0005 — scribe (transcription: Craig → transcript + merged audio)

**Status:** Plan (pre-implementation). **Phase:** 3 (pipeline). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decision in force:** G = **Groq hosted `whisper-large-v3` API** (no GPU/local model; import 76 historical verbatim — do not re-transcribe).
**Depends-on:** Phase 1 (config, observe, ontology-being for the roster). **Blocks:** `0006` linguist.

> Goal: port faerrin's `wretch` producer into astra's **scribe** — Craig Discord recordings →
> per-session **transcript** + a **merged audio** file — as a **Dagster partitioned asset** (one
> partition per session/date), with transcription on the **Groq API** (Decision G) instead of local
> whisperx. **New sessions only**; the 76 historical sessions are imported as-is (§7).

---

## 1. Current state (faerrin `wretch`, hybrid)

TS reconciler (`src/process.ts`) around a thin Python whisper CLI (`python/transcribe.py`):

```
Craig .zip ─▶ process.ts ─┬─ unzip + integrity gate (unzip -t, FUSE-safe)
                          ├─ track filter (keep .aac whose stem is a known player — roster)
                          ├─ ffmpeg amix ────────────────▶ saved/{date}/audio.mp3
                          ├─ transcribe.py (whisperx) ────▶ per-track {stem}.json (segments+words)
                          └─ SoundStack merge ───────────▶ saved/{date}/script.json
```

- **`transcribe.py`** (the one Python step): per track → `load_audio` → `transcribe(batch_size=16)`
  → **`whisperx.align`** (a separate wav2vec2 model adds **word-level** timestamps) → writes
  `result["segments"]` = `[{start,end,text,words[]}]`. Per-track resume (skip finished `.json`), atomic
  `.tmp`→rename, model loaded once per batch.
- **`SoundStack`** (`soundStack.ts`): time-orders per-user segment arrays into one stream by `start`
  (pop-from-front), tagging each with its `user` (raw Discord ID). → `script.json`.
- **Reconciler** (`process.ts`): **level-triggered, disk-as-ledger** (dedup on `script.json` existence),
  single-flight lock, atomic appearance, downstream cascade only on new materialization.
- **Output shapes:** `audio.mp3`; `script.json` = `[{start,end,text,words,user}]` (raw Discord IDs;
  speaker resolution happens later, in linguist). **`words` is captured but never consumed downstream
  (verified) — astra drops it (§3).** Craig stem = `<idx>-<discordid>.aac`; zip stem =
  `<guild>_<channel>_<date>_<id>`. Disk grows ~400 MB/session.

## 2. Target (astra scribe)

Python (uv) **Dagster partitioned asset**, **one partition per session/date**. No GPU, no 2.9 GB model.
Same output contract (`audio.mp3` + a raw **line-level** transcript with raw-ID speakers; word
timestamps dropped as unused), so linguist is unaffected by the engine change.

## 3. The transcription swap (whisperx → Groq)

whisperx did transcribe + a forced-align pass for **word** timestamps — but **`words` is never consumed
downstream** (verified: the canonical transcript + `:::transcript-line` directive carry only line-level
`second`/`start`; no word usage in `content/scripts` or aether's `TranscriptPlayer`). So astra **drops
word timestamps** (F1) and requests **segment-level** only. Per track:

1. **VAD-trim** (F2): detect voiced spans locally (Silero VAD or `ffmpeg silenceremove`) and submit only
   voiced audio (~75% fewer audio-minutes). Keep a **span → original-time** offset map.
2. **Chunk** each voiced run to Groq's file-size/duration limits (**verify exact limits** — a long track
   exceeds one request); cut on silence boundaries.
3. **Submit** each chunk → Groq `whisper-large-v3` `response_format=verbose_json` (segments only).
4. **Re-offset** each chunk's segment times back to the original session timeline (chunk start + the VAD
   span map), concatenate → the per-track **segment** array `[{start,end,text}]`.

**Cost (measured):** ~$9/yr ongoing with VAD-trim. Negligible. Per-track output = `[{start,end,text}]`;
the merge (§6) tags each with `user`.

## 4. Dagster modeling (the reconciler → assets)

- **Sensor** on the Craig drop location (`LISTENER_INCOMING_PATH` equiv, from ontology-config) →
  detects new session zips → requests the matching **session/date partition**.
- **Partitioned assets** (per session): `session_audio` (ffmpeg amix → `audio.mp3`) and
  `session_transcript` (Groq per track → SoundStack merge → raw `script.json`). Dagster's
  **materialization state replaces the disk-ledger** (a materialized partition = "done"); per-track
  resume becomes per-chunk/per-track caching within the asset.
- **Downstream** (linguist→akasha→mouthpiece) becomes **asset dependencies**, not a `downstream.sh`
  cascade — Dagster re-materializes the lineage for a session's partition.
- **Single-flight / idempotency** come from Dagster's run queue + partition identity.

## 5. Audio merge (stays local)

`ffmpeg amix` (per-speaker Craig tracks → one `audio.mp3`) is unchanged — Groq doesn't do this. Port
`audio.ts`'s ffmpeg invocation to a Python `subprocess`/`ffmpeg` call. Audio is then **published to the
static audio host** (faerrin serves it from `static-audio.iridi.cc`, outside the repo) — see decision **F4**.

## 6. Time-merge (SoundStack → Python)

Port `SoundStack` verbatim: per-user segment arrays → globally-earliest-`start` pop-merge → one stream
tagged with `user`. ~30 lines; pure; add a parity test against a faerrin `script.json` sample.

## 7. Historical sessions (Decision G: don't re-transcribe)

The 76 historical sessions are **already canonical** (`content/scripts/data` + `content/transcripts`).
scribe processes **new (post-cutover) sessions only**; history enters the pipeline as already-materialized
state. **Where** it enters — at scribe's output (raw `script.json`) vs at the canonical linguist level —
is decision **F3** (it spans scribe+linguist; I lean: enter at the canonical/linguist level, since the
canonical artifacts are linguist-shaped, and scribe's historical partitions are simply pre-satisfied).

## 8. Open decisions (recommend; confirm or override)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| F1 | Word timestamps | keep (Groq-native / local align) vs drop | **DECIDED: drop** — `words` is unused downstream (verified); request segment-level only. |
| F2 | Silence handling | full chunked vs VAD-trim | **DECIDED: VAD-trim** before submit (voiced spans + offset map); chunk within voiced runs. |
| F3 | Historical entry point | scribe (raw) vs canonical/linguist | **DECIDED: canonical/linguist level** — don't re-derive history; scribe historical partitions pre-satisfied. |
| F4 | Audio hosting | external `static-audio` vs in-astra | **DECIDED: keep external** (out of scope for v1; scribe publishes to it). |

## 9. Work items

1. **Scaffold** `apps/scribe` (uv; Dagster asset defs; OTel via `libs/py/observe`; config via `libs/py/config`).
2. **Craig ingest**: zip detect/parse (`<guild>_<channel>_<date>_<id>`), `unzip -t` integrity gate,
   extract + **track filter** via the roster (now from **ontology-being**, not `content/scripts/lib`).
3. **Audio merge asset**: ffmpeg amix → `audio.mp3` (port `audio.ts`).
4. **Groq transcribe**: per-track **VAD-trim → chunk → Groq `verbose_json` (segments only) → re-offset**
   → per-track segments. Wire the Groq key from ontology-config (SOPS). Verify Groq file/duration limits
   + retry/backoff.
5. **Merge asset**: SoundStack port → raw `script.json` (`[{start,end,text,words,user}]`).
6. **Dagster wiring**: per-session partition def + a Craig-drop **sensor**; asset deps to linguist.
7. **Historical import** (per F3): pre-satisfy historical partitions / import canonical outputs.
8. **Parity tests**: SoundStack merge vs a faerrin sample; a real Craig session dry-run (one partition).

## 10. Exit criteria

- [ ] A new Craig session (one partition) runs end-to-end: zip → audio.mp3 + raw `script.json`
      (line-level segments + raw-ID speakers; **no** word timestamps) — linguist unaffected.
- [ ] Transcription is **Groq-only** (no whisperx, no model download, no GPU worker).
- [ ] SoundStack merge matches faerrin's ordering on a sample (parity test).
- [ ] Historical 76 sessions are present as materialized state **without re-transcription** (F3).
- [ ] Dagster sensor triggers on a dropped zip; materialization state is the ledger (no disk dedup file).

## 11. Risks

1. **Groq file/duration limits** — long tracks must chunk; get the limits right + handle partial-chunk
   failures (retry per chunk; the asset must be resumable mid-track). Verify before building.
2. **VAD + chunk timestamp seams** — VAD spans and chunk cuts both re-offset to the session timeline; a
   segment split across a boundary shouldn't duplicate/drop. Cut on silence; test on a real multi-hour track.
3. **VAD over/under-trim** — too aggressive drops quiet speech, too lax wastes the saving; tune the
   threshold against a real session and keep a small pre/post-roll around voiced spans.
4. **whisperx non-determinism / the accepted lowercase regression** — new Groq output may differ in
   casing/punctuation from the historical corpus; `defs.yaml` corrections (linguist) were tuned to the
   old output and may need a pass against Groq output.
5. **Roster source moved** — track-filtering now reads ontology-being (not `content/scripts/lib/roster`);
   keep the player↔snowflake map authoritative there.

## 12. Hand-off to 0006 (linguist)

scribe emits the raw per-session `script.json` (`[{start,end,text,user}]`, raw Discord IDs; **no word
timestamps**) + `audio.mp3`. linguist
consumes the transcript: applies `defs.yaml` corrections, resolves Discord IDs → speaker `{name,color}`
(from ontology-being), reformats timestamps, and produces the canonical line-numbered transcript +
mouthpiece context. F3 (historical entry) is finalized there.
