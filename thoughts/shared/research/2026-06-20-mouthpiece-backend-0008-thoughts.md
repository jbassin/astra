# 0008 mouthpiece-backend — pre-implementation thoughts

**Date:** 2026-06-20. **Author:** Claude. **Status:** analysis (verified against both repos) → awaiting
NLSpec (`octo:spec`) before `octo:embrace`.
**Plan:** [`thoughts/astra/plans/0008-mouthpiece-backend.md`](../../astra/plans/0008-mouthpiece-backend.md).
**Depends-on:** `0006` linguist (transcript + `mouthpiece_context` + speaker map), `0007` akasha-backend
(grounding corpus), Phase 1 (`libs/py/llm`, `astra_config`, `astra_ontology_being`, `observe`).
**Blocks:** `0012` mouthpiece-frontend.

## What 0008 is

Rewrite faerrin's `caster` (Bun TTS pipeline, ~4,300 LOC) into astra **mouthpiece-backend** — a session
transcript → a tavern-tone roundtable **script** → **audio** — as a **Dagster asset graph** (one partition
per session/date), LLM via `libs/py/llm`. The headline risk is **tone regression**: caster's two-pass
technique is tuned and green, and the craft lives in the prompts, not the framework.

## Source map (faerrin `pkg/caster/src`)

caster's 5 cached stages map 1:1 onto Dagster assets (each `out/` disk-cache → asset materialization):

```
ingest → distill → script → tts → assemble        (+ mega: fuse → script → tts → assemble)
```

| Stage → asset | faerrin file(s) | LOC | Port disposition |
|---|---|---|---|
| ingest | `ingest/*` | ~380 | **Replace** — inputs come from linguist, not `content/transcripts`/`content/wiki` |
| distill → `session_digest` | `distill/{index,prompt,schema,parse}.ts` | ~340 | **Port ~verbatim** → `call_structured`/`call_tool` with `record_session_digest` schema → Pydantic `SessionDigest` |
| script → `session_script` ⚠ | `script/{index,prompt,schema,grounding,parse}.ts` | ~360 | **Tone-critical.** Two-pass = `call_text` (Pass A) → `call_tool` (Pass B). **Prompts ported byte-for-byte.** |
| tts → `session_audio_clips` | `tts/*` (elevenlabs/edge/mock, dialogue chunking, pronunciation IPA) | ~700 | **Port as HTTP** — ElevenLabs v3 Text-to-Dialogue + Edge + mock; pronunciation IPA wrap |
| assemble → `session_episode` | `assemble/*` (ffmpeg concat + loudnorm, gaps/fades, ambient bed) | ~600 | **Port as subprocess** — pure ffmpeg arg-builders (like scribe's `audio.py`) |
| mega → `mega_digest` | `mega/*` | ~270 | Date-range partition → `fuse` collapses digests → reuses script/tts/assemble |
| **lint (golden A/B gate)** | `script/lint.ts` | 300 | **Port verbatim to Python** — the tone-regression gate (§5) |

### The two load-bearing artifacts (port VERBATIM — the craft is here)

1. **`script/prompt.ts`** — `buildImprovSystemPrompt` (Pass A: "RAW, unedited recording… not a script",
   keeps the model out of the clean-podcast attractor) + `buildDressingSystemPrompt` (Pass B: "you are a
   careful transcript FORMATTER… DO NOT improve the dialogue"). The imperfection budget, voice-inequality
   rules, tavern-as-background framing, and ElevenLabs v3 tag conventions are all prose inside these
   strings. Also `buildScriptUserContent` (digest beats + a 24k-char grounding budget + optional running
   threads) and the legacy one-shot `buildScriptSystemPrompt` (kept for the A/B `twoPass:false` path).
2. **`script/lint.ts`** — `computeMetrics` / `scoreScript` / `THRESHOLDS` (mechanical rubric R1–R4, R6:
   vocab spread, turn-length stdev, meta-recap ratio, disfluency ratio, clean-line ratio; R5 retired,
   R7–R9 are human/LLM-judge). **In-code caveat:** thresholds are PROVISIONAL/calibration-pending — set
   against fixtures, not real episodes. First job of the A/B is to lint the committed faerrin scripts and
   recalibrate before treating the gate as a blocker.

## Substrate is already built (the big de-risk vs the plan)

The `0008` plan was written assuming this was greenfield. It isn't — Phase 1 already shipped the seam:

- **`libs/py/llm` (`astra_llm.LiteLLMClient`)** already exposes everything the two-pass needs:
  - `call_text(TextRequest) -> str` — free-text, **Pass A**.
  - `call_tool(ToolCallRequest) -> dict` — forced-tool, **Pass B** + distill.
  - `call_structured(...)` — convenience Pydantic wrapper.
  - The `stop_reason == max_tokens → raise` **truncation guard** (no silent half-episode) is in place.
  - Prompt caching (`_cached_system`) for the static per-host system prompts.
  - Cost recording → OTel (`_record_cost` → `astra.llm.cost_usd`).
  - `make_dspy_lm()` if we want dspy for `distill`.
- **`astra_config.MouthpieceConfig`** exists; `mouthpiece { elevenlabs-api-key ref="sops:elevenlabs_api_key" }`
  is in `ontology-config`. **Verified live (2026-06-20):** `cfg.mouthpiece.elevenlabs_api_key.resolve()`
  returns a valid 51-char `sk_…` key through SOPS. Same plumbing pattern as scribe's `groq_api_key`.
- **`astra_ontology_being`** carries all three hosts as the distinct `PodcastPersona` type (separate from
  `WealHost`). **Verified:** `bram`/`maeve`/`pip` each load with `name`, `voice_id`, and full persona prose
  (462/513/529 chars). The persona text AND the ElevenLabs voice IDs (faerrin `hosts.ts` + `elevenlabs.ts`)
  are both consolidated here — mouthpiece reads hosts+voices from ontology-being (H5), no local host config.

So the riskiest substrate (LLM two-pass seam, key resolution, host/voice identity) is **done**. 0008 is a
prompt-verbatim port + Dagster wiring + two genuinely-new integration seams (below).

## Decisions to revisit before the NLSpec

- **H1 (dspy role) — RESOLVED 2026-06-20 (see the spec).** Script + distill use **raw `libs/py/llm`**
  (`call_text`/`call_tool`/`call_structured`); typed I/O via **Pydantic**, not dspy signatures; **dspy
  reserved for the linguist judge** (the only optimizer-bearing case). Deciding facts: creative gen has no
  optimizer metric (research §3.3); `make_dspy_lm` is a **bare `dspy.LM`** that bypasses
  `LiteLLMClient._complete`, so routing through dspy would lose the `max_tokens→raise` guard, static-prompt
  caching, and `astra.llm.cost_usd`; dspy's adapter owns the wire format (no verbatim passthrough) → breaks
  byte-fidelity and the golden A/B; and `call_structured` already covers typed output without that tax.
- **Lint thresholds are provisional.** Don't treat the `/10` mechanical subtotal as a hard gate until it's
  recalibrated against real linted episodes (the faerrin `out/*.script.json` baseline below).

## Integration seams that genuinely change (not a port)

1. **Grounding (Risk 5).** `groundDigest` matched beat `wikiRefs` against a `WikiCorpus` (title/basename
   lookup over `content/wiki`). In astra it must read **akasha's vellum corpus** (`apps/akasha-backend`
   `corpus.py` `load_corpus`). This is the one new code path; re-validate proper-noun grounding against
   akasha's page index/titles.
2. **Inputs.** transcript + `mouthpiece_context` + speaker map come from **linguist** (0006) — speaker
   resolution is already done upstream; ingest's shibboleth/transcript parsing mostly drops out.

## Golden A/B baseline — present, no LLM spend to establish it

`pkg/caster/out/` has **7 committed `*.digest.json`**, all carrying the full enriched Beat schema
(`order/summary/significance/details/tone/tableAngle/characters/locations/wikiRefs` — matches the current
`distill` tool schema, no degraded shape):

- **6 per-session digests** (10–12 beats each) → the golden set for the `session_script` A/B.
- **1 mega digest** (`…6-8-recap-of-5-7`, 21 beats, 0 discarded) → exercises the `mega_digest` fuse path.

Each has a **matching committed `*.script.json`** = the faerrin TS reference *output*. So `out/` is both
halves of the A/B pair: lint the existing TS scripts to fix the thresholds, then run astra `session_script`
on the same digests and diff on the lint metrics + a human spot-read. The baseline metrics need **zero**
LLM calls (the reference scripts already exist).

## Remaining genuine unknown

The **ElevenLabs v3 Text-to-Dialogue** call itself (paid, tier-gated) — the credential is live, but whether
the v3 dialogue endpoint accepts it is untestable without a real call. Edge/mock providers are the
offline/free fallbacks and let everything except final v3 audio be built + tested hermetically.

## Suggested slicing (for the NLSpec)

1. **Scaffold** `apps/mouthpiece-backend` (uv member; Dagster code location; `init_telemetry`; read
   `MouthpieceConfig` + personas/voices from ontology-being).
2. **`session_digest`** asset — port distill (`call_structured`), Pydantic `SessionDigest`/`Beat`.
3. **`session_script`** asset — two-pass (`call_text`→`call_tool`), **prompts verbatim**, grounding reads
   akasha; `sharpen`/`threads` optional.
4. **Port `lint.ts`** → Python + the golden A/B harness over `caster/out/` (recalibrate thresholds).
5. **`session_audio_clips`** — ElevenLabs v3 / Edge / mock providers (HTTP) + pronunciation IPA wrap.
6. **`session_episode`** — ffmpeg concat + loudnorm; `episode.mp3` + `transcript.md`; publish (F4).
7. **`mega_digest`** path over a date-range partition.
8. Wire all into `dagster/definitions.py`; SigNoz traces+metrics+logs in the real runtime
   ([[telemetry-built-in]]).

## Exit gates (carry from plan §8)

- One session runs linguist→mouthpiece end-to-end: digest → two-pass script → clips → `episode.mp3` +
  `transcript.md`.
- **Tone golden A/B passes:** astra output hits the (recalibrated) `lint.ts` thresholds on the shared
  `out/` digests; human spot-read confirms no "clean podcast" drift.
- LLM is `libs/py/llm`; `max_tokens→raise` guard + prompt caching active.
- Grounding reads **akasha**; transcript/context read from **linguist** (no `content/` reads).
- mega path produces a month-in-review episode.
