# 0005 scribe — pre-implementation thoughts

**Date:** 2026-06-19. **Author:** Claude. **Status:** analysis → awaiting fork confirmation before NLSpec.
**Plan:** [`thoughts/astra/plans/0005-scribe.md`](../../astra/plans/0005-scribe.md). **Depends-on:** Phase 1
(config, observe, ontology-being roster), `libs/py/llm`. **Blocks:** `0006` linguist. Pipeline **head**.

## What 0005 is

Port faerrin's `wretch` producer into astra **scribe** — Craig Discord recordings (`.zip`) → per-session
**`audio.mp3`** (merged) + raw **`script.json`** transcript — as a **Dagster partitioned asset** (one
partition per session/date), transcribing on the **Groq `whisper-large-v3` API** (Decision G) instead of
local whisperx. **New sessions only**; the 76 historical sessions enter as already-materialized state (F3).

## Source to port (faerrin `pkg/wretch`)

faerrin has a **Python** wretch (`python/`) — the natural lift base. Orchestration `process.py`:
unzip → roster-filter `.aac` tracks → merge → per-track transcribe → `SoundStack` merge → `script.json`.

| faerrin piece | astra action |
|---|---|
| `python/sound_stack.py` (~50 LOC, pure) | **port verbatim** + parity test vs a real `script.json` sample |
| `python/process.py` orchestration | re-shape into Dagster assets (ingest/merge/transcribe/merge) |
| `python/transcribe.py` (whisperx + align) | **replace** with the Groq client (segments only, drop words) |
| `src/audio.ts` `mergeArgs` (ffmpeg amix) | port the **ffmpeg amix** invocation to Python subprocess |
| `src/roster.ts` / `python/consts.PLAYERS` | track filter now from **ontology-being** (snowflakes/usernames) |

**Output contract (unchanged so linguist is unaffected):** `audio.mp3` + `script.json` =
`[{start, end, text, user}]` (raw-ID/stem speakers; **word timestamps dropped** — F1, verified unused).

## Groq limits (verified — drives the chunking, Risk 1)

`whisper-large-v3` via the OpenAI-compatible `/audio/transcriptions`:
- **25 MB** direct-upload cap (100 MB is **URL-only**, paid tier) → must **chunk** long tracks.
- `response_format=verbose_json` → segments (`{start,end,text}` + metadata); request **segments only**.
- Accepted formats: flac/mp3/mp4/m4a/ogg/wav/webm — **NOT raw `.aac`** → transcode each chunk to
  **16 kHz mono flac** (~1 MB/min → a ~20-min chunk is ~20 MB, safely under 25 MB), cut on silence.
- Optimal at 30-s internal segments; min-billable 10 s. Cost ≈ **$9/yr** with VAD-trim.

**Per-track pipeline:** VAD-trim (voiced spans + offset map) → chunk each voiced run (silence-cut, ≤~20 min)
→ transcode 16k mono flac → Groq `verbose_json` → **re-offset** each chunk's segment times back to the
session timeline → concatenate → `[{start,end,text}]`. (Re-offset seams = Risk 2; unit-test on synthetic timing.)

## Seams

- **scribe owns:** Craig ingest, roster filter, ffmpeg amix, the Groq transcribe (VAD/chunk/re-offset),
  the SoundStack merge, the Dagster partition + Craig-drop sensor.
- **ontology-being owns:** the roster (player ↔ snowflake/username) — the track filter reads it.
- **libs/py/llm owns:** the LLM/Groq access (standing principle #3 — all model calls go through it).
- **linguist (0006) owns:** `defs.yaml` corrections, ID→speaker resolution, the canonical transcript, and
  finalizing F3 (historical entry at the canonical level).

## Decided already (plan §8): F1 drop word timestamps · F2 VAD-trim · F3 historical enters at
canonical/linguist level (scribe historical partitions pre-satisfied) · F4 audio host stays external.

## Forks — DECIDED (2026-06-19, with Josh)

- **G1 → Machinery + tests now; DEFER the live run.** Build the whole subsystem with unit/parity tests +
  a mocked Groq path; the live end-to-end dry-run is a one-command follow-up when a real Craig zip is handed over.
- **G2 → ffmpeg `silenceremove`** (no torch; tune threshold + keep pre/post-roll).
- **G3 → via `libs/py/llm` (litellm.transcription)** — add a thin `transcribe()` to `libs/py/llm` if not
  exposed; scoped Groq client behind the same seam only if litellm's `verbose_json`/segments are insufficient.

## Genuine forks to confirm (these change the work)

### G1 — Scope this session: machinery + tests now vs a live end-to-end run
scribe's exit criteria include a **live** dry-run (real Craig `.zip` → real Groq call → `audio.mp3` +
`script.json`) + "Groq-only transcription verified." That needs **a real session zip + the Groq key
(spends real $) + ffmpeg + network + a materialized Dagster partition** — none of which is reproducible in
CI. Options:
- **(a) Build the full machinery + unit/parity tests now; DEFER the live run.** Everything ships and is
  green (ingest, roster filter, ffmpeg amix on synthetic audio, VAD/chunk/re-offset with unit tests, the
  Groq client with a **recorded/mocked** response, SoundStack parity vs a real sample, Dagster
  partition+sensor). The live dry-run is a documented gate you run when you point it at a real session.
- **(b) Live run now** — you give me a real Craig zip + confirm spending Groq credits, and I run one
  partition end-to-end. (Per the session rule, I STOP for a credential/spend gate rather than assume.)
**Lean (a)** — build + fully unit/parity test the subsystem; the live run is a one-command follow-up once
you hand me a zip. Confirm, since it bounds "done."

### G2 — VAD implementation: ffmpeg `silenceremove` vs Silero VAD
- **ffmpeg `silenceremove`** — no ML dep, reuses the ffmpeg we already need, lighter; threshold-tuned.
- **Silero VAD** — better voiced detection but pulls **torch** (a heavy ML dep — ironic when Decision G
  exists to *remove* the 2.9 GB whisper model + GPU).
**Lean ffmpeg `silenceremove`** (keeps scribe dependency-light, no torch; tune threshold + keep pre/post-roll).

### G3 — Groq transcription path: via `libs/py/llm` (litellm) vs a thin Groq client
Standing principle #3: **all LLM calls go through `libs/py/llm` (litellm + dspy)**. litellm supports audio
transcription (`litellm.transcription`, `groq/whisper-large-v3`, `verbose_json`) → routing through
`libs/py/llm` honors the principle + gets cost tracking. A thin direct Groq client is simpler but bypasses
the standing rule.
**Lean `libs/py/llm`** (add a thin `transcribe()` there if it's not yet exposed), unless litellm's
transcription lacks `verbose_json`/segment fidelity — then a scoped Groq client behind the same `llm` seam.

## Proposed work breakdown (post-confirm)
1. Scaffold `apps/scribe` (uv; Dagster defs; OTel `libs/py/observe`; config `libs/py/config`).
2. Craig ingest: zip stem parse (`<guild>_<channel>_<date>_<id>`), `unzip -t` integrity gate, extract +
   **roster filter** (ontology-being).
3. Audio merge asset: ffmpeg amix → `audio.mp3` (port `mergeArgs`).
4. Groq transcribe: VAD-trim → chunk → 16k-mono-flac → Groq `verbose_json` (segments) → re-offset →
   per-track segments (via `libs/py/llm`; key from ontology-config/SOPS).
5. Merge asset: SoundStack port → `script.json` (`[{start,end,text,user}]`, no words).
6. Dagster wiring: per-session partition def + Craig-drop sensor; asset dep edge to linguist.
7. Historical (F3): pre-satisfy historical partitions (the real import is linguist's).
8. Tests: SoundStack parity vs a real sample; ffmpeg-args + re-offset unit tests; Groq client with a
   recorded response; an ingest/stem-parse test.

## CI / deps notes
- New **uv** member `apps/scribe` → py lane auto-covered. ffmpeg is a **runtime** dep (present locally +
  in the Dagster image) — tests must not require a live Groq call (mock it) so the py CI lane stays hermetic.
- Groq key from SOPS (`groq_api_key`, present since Phase 1) — only the live run needs it; unit tests don't.

## Sources
- [Groq Speech-to-Text docs](https://console.groq.com/docs/speech-to-text)
- [Whisper Large v3 on GroqCloud (100 MB / URL)](https://groq.com/blog/largest-most-capable-asr-model-now-faster-on-groqcloud)
