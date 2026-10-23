# NLSpec 0005 — scribe (transcription: Craig → transcript + merged audio)

**Status:** **implemented + verified** (gates A–G; **H deferred by design**, G1). The full subsystem ships
with hermetic unit/parity tests (py ruff/format/ty/**57 pytest**; no ffmpeg/network/Groq key needed); the
live end-to-end run (H) is a one-command follow-up when a real Craig zip is provided. **Phase:** 3
(pipeline). **Source plan:**
[`../plans/0005-scribe.md`](../plans/0005-scribe.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-19-scribe-0005-thoughts.md`](../../shared/research/2026-06-19-scribe-0005-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (python-pro, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** Phase 1 (`libs/py/{config,observe,llm}`, ontology-being roster, ontology-config). **Blocks:**
`0006` linguist. The pipeline **head**.

## Goal

Port faerrin's `wretch` into astra **scribe** — Craig Discord recordings (`.zip`) → per-session merged
**`audio.mp3`** + raw **`script.json`** transcript — as a **Dagster partitioned asset** (one partition per
session/date), transcribing on the **Groq `whisper-large-v3` API** (Decision G), not local whisperx. New
sessions only; the 76 historical sessions enter as already-materialized state (F3, finalized in linguist).

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| G (roadmap) | Engine | **Groq hosted `whisper-large-v3`** — no GPU, no 2.9 GB model. |
| F1 | Word timestamps | **Drop** — `words` is unused downstream (verified); request **segment-level** only. |
| F2 | Silence handling | **VAD-trim** before submit — **ffmpeg `silenceremove`** (G2; no torch), voiced spans + offset map. |
| F3 | Historical entry | **Canonical/linguist level** — scribe's historical partitions are **pre-satisfied**, not re-transcribed. |
| F4 | Audio hosting | **External** `static-audio` host — scribe publishes; hosting out of scope for v1. |
| G1 | Session scope | **Machinery + unit/parity tests now; the live end-to-end run deferred** (needs a real zip + Groq spend). |
| G2 | VAD impl | **ffmpeg `silenceremove`** (dependency-light). |
| G3 | Groq path | **Via `libs/py/llm`** (litellm `transcription`, `groq/whisper-large-v3`, `verbose_json`) — standing principle #3 + cost tracking. |

## Scope (in)

- **`apps/scribe`** (uv app): Dagster partitioned-asset defs (loaded by `dagster/definitions.py`); OTel via
  `libs/py/observe`; config via `libs/py/config`; roster from ontology-being; Groq key from ontology-config (SOPS).
- **Craig ingest**: parse the zip stem (`<guild>_<channel>_<date>_<id>`) → session/date; `unzip -t`
  integrity gate; extract `.aac` tracks; **roster filter** (keep tracks whose stem matches a known player,
  read from **ontology-being** — not faerrin's `content/scripts/lib/roster`).
- **Audio merge** (`session_audio` asset): **ffmpeg amix** (`amix=inputs=N:duration=longest:normalize=0`,
  `-f mp3`) → `audio.mp3` (port `src/audio.ts` `mergeArgs` to a Python subprocess).
- **Groq transcribe** (per track): **VAD-trim** (ffmpeg `silenceremove` → voiced spans + a span→original-time
  offset map) → **chunk** each voiced run on silence to ≤~20 min → **transcode** chunk to 16 kHz mono flac →
  **Groq `verbose_json`** (segments only, via `libs/py/llm`) → **re-offset** each chunk's segment times back
  to the session timeline → concatenate → per-track `[{start,end,text}]`. Retry/backoff per chunk; resumable.
- **Merge** (`session_transcript` asset): **SoundStack** port (per-user segment arrays → globally-earliest-
  `start` pop-merge, tag each with `user`) → `script.json` = `[{start,end,text,user}]` (**no `words`**).
- **Dagster wiring**: a per-session **DynamicPartitionsDefinition** (keyed by session/date) + a Craig-drop
  **sensor** (watches the incoming path → registers the partition); `session_transcript` depends on the
  extracted tracks; an asset-dep edge toward linguist (0006).
- **Historical (F3)**: pre-satisfy the 76 historical session partitions (mark materialized without running);
  the real canonical import is linguist's.
- **`libs/py/llm`**: add a thin `transcribe(audio_path, *, model, response_format)` if not already exposed,
  so scribe's Groq call goes through the one LLM seam (cost tracking included).

## Scope (out)

- **whisperx / local model / GPU / word-level alignment** — replaced by Groq segments (F1/G).
- **The live end-to-end dry-run** (real zip → real Groq $ → outputs) — **deferred** (G1); a documented
  one-command run once a real session zip is provided. CI/tests use a **mocked/recorded** Groq response.
- **`defs.yaml` corrections, ID→speaker resolution, the canonical line-numbered transcript** → **linguist (0006)**.
- **The historical canonical import** itself → finalized in linguist (F3); scribe only pre-satisfies partitions.
- **Audio hosting** (the `static-audio` host) → external, out of scope (F4); scribe publishes to it later.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| N1 | Output contract | `script.json` = `[{start,end,text,user}]` — identical to faerrin minus `words` (linguist unaffected). `user` = the Craig track stem (raw id; resolved in linguist). |
| N2 | Roster source | ontology-being (player ↔ snowflake/username); the track filter + `user` tagging read it (Risk 5). |
| N3 | Groq format | Craig `.aac` is **not** a Groq-accepted format → transcode each chunk to **16 kHz mono flac** (~1 MB/min) before submit; chunk ≤~20 min keeps each request well under the **25 MB** direct-upload cap. |
| N4 | Re-offset | each chunk's Groq segment times += (chunk start in the voiced run) + (voiced-span offset in the session) — a single composed offset; unit-tested on synthetic timing (Risk 2: no dup/drop across seams). |
| N5 | Transcribe purity | the VAD/chunk/re-offset logic is **pure** (operates on span/segment lists) with the ffmpeg + Groq calls injected, so it unit-tests without ffmpeg-on-PATH or a live Groq call. |
| N6 | ffmpeg | a small Python `ffmpeg` subprocess wrapper (amix, silenceremove, transcode); arg-builders are pure (port `mergeArgs`’ unit-testability). ffmpeg is a **runtime** dep (present locally + in the Dagster image). |
| N7 | Dagster ledger | a materialized partition = "done" (replaces faerrin's disk-as-ledger + `db.processed`); outputs are written `.tmp`→rename so a partition only appears whole. Single-flight from Dagster's run queue. **Per-chunk resume** (caching transcoded/transcribed chunks across re-runs) is a **refinement deferred with the live run (G1)** — v1 re-materializes a partition wholesale. |
| N8 | Tests hermetic | py CI must not need ffmpeg or a live Groq call — SoundStack parity (real sample), re-offset (synthetic), ingest stem-parse, and the Groq client (recorded response) all run without external services. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | `apps/scribe` scaffolded; uv + py CI lanes green (ruff/format/ty/pytest) | run locally |
| B | SoundStack port matches faerrin's ordering on a real `script.json` sample | parity test |
| C | VAD/chunk/**re-offset** maps chunk segment times back to the session timeline with no dup/drop across seams | unit test (synthetic) |
| D | Craig ingest: zip stem → session/date, `unzip -t` gate, roster filter (ontology-being) | unit test |
| E | Transcription path is **Groq-only via `libs/py/llm`** (no whisperx/model/GPU); segments only, `words` dropped | code + a recorded-response test |
| F | ffmpeg amix arg-builder + the Groq client are unit-tested **without** ffmpeg/live Groq | tests |
| G | Dagster per-session partition + Craig-drop sensor defined; loaded by `dagster/definitions.py` | import + a sensor unit test |
| H | **(deferred, G1)** live run: a real Craig zip → `audio.mp3` + `script.json` end-to-end | documented one-command follow-up |

## Risks

1. **Groq limits** — 25 MB direct-upload cap → chunk ≤~20 min @ 16 kHz mono flac; retry/backoff per chunk; resumable mid-track (N3/N7). Verified limits in thoughts.
2. **VAD + chunk seams** — re-offset composes voiced-span + chunk offsets; a segment split across a boundary must not dup/drop. Cut on silence; unit-test (N4/C).
3. **VAD over/under-trim** — tune the `silenceremove` threshold against a real session; keep pre/post-roll (finalized at the live run).
4. **Casing/punctuation drift** — Groq output may differ from the historical corpus; linguist's `defs.yaml` may need a pass against Groq output (linguist's concern; flagged here).
5. **Roster source moved** — track-filter + `user` read ontology-being, not `content/scripts/lib` (N2).

## Hand-off to 0006 (linguist)

scribe emits per session: `audio.mp3` + `script.json` = `[{start,end,text,user}]` (raw-id speakers, **no
word timestamps**). linguist applies `defs.yaml` corrections, resolves ids → `{name,color}` (ontology-being),
reformats timestamps to the canonical line-numbered transcript + mouthpiece context, and **finalizes F3**
(historical entry at the canonical level). The live dry-run (H) is run when a real Craig session is available.
