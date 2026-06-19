# Astra Sub-plan 0008 — mouthpiece-backend (roundtable script → TTS audio)

**Status:** Plan (pre-implementation). **Phase:** 3 (pipeline). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** Bun→Python Dagster rewrite; LLM→litellm+dspy; tone golden A/B gate; reads linguist + akasha; external audio (F4-consistent).
**Depends-on:** `0006` linguist (context + transcript), `0007` akasha-backend (grounding corpus), Phase 1 (libs/py/llm, config, observe). **Blocks:** `0012` mouthpiece-frontend.

> Goal: rewrite faerrin's `caster` (Bun TTS pipeline) into astra's **mouthpiece-backend** — session
> transcript → a tavern-tone roundtable **script** → **audio** — as a **Dagster asset graph** (per-session
> partitions), LLM via litellm+dspy. The headline risk is **tone regression**: caster's two-pass
> technique is tuned and green; the Python port must preserve it (golden A/B, §5).

---

## 1. Current state (faerrin `caster`, Bun CLI, 5 cached stages)

```
ingest → distill → script → tts → assemble        (+ mega: fuse → script → tts → assemble)
```

| Stage | Does | LLM |
|---|---|---|
| ingest | transcript + speaker resolve + wiki link-graph | — |
| distill | transcript → ordered **story beats** (`SessionDigest`) | Claude Opus, `callTool` |
| script | beats → 3-host roundtable, wiki-grounded, inline v3 audio tags | Claude, **two-pass** |
| tts | script → audio clips | ElevenLabs v3 (default) · Edge (free) · mock |
| assemble | clips → `episode.mp3` + `transcript.md` | ffmpeg (concat + loudnorm) |

- **The two-pass (the crux, `script/index.ts`):** `generateTwoPass` = **Pass A** `callText`
  (free-text "raw imperfect transcript" — keeps the model out of the clean-podcast attractor) → **Pass B**
  `callTool` (protective "dressing" into structured turns **without polishing**). Both reuse cacheable
  per-host system prompts; the **craft lives in the prompts** (`buildImprovSystemPrompt`,
  `buildDressingSystemPrompt`). Optional `sharpen` (3 calls), cross-session `threads`.
- **Quality scorer (`lint.ts`):** `computeMetrics`/`scoreScript`/`THRESHOLDS` — objective script metrics.
  **Reuse this for the tone-parity gate (§5).**
- **Caching:** each stage caches to `out/` (`loadOrGenerateScript` skips the LLM if the artifact exists) →
  maps directly to **Dagster asset materialization**.
- **mega:** `fuse` collapses in-range digests → one month-in-review `SessionDigest` → script→tts→assemble.
- **Inputs:** transcripts ← `content/transcripts`, wiki ← `content/wiki` (grounding), shibboleth
  (speaker map), `pronunciations.json` (term→IPA for v3). Default hosts Bram/Maeve/Pip — in astra these
  come from **ontology-being** as a distinct `podcast persona` type (H5), separate from weal-bot hosts.

## 2. Target (astra mouthpiece-backend)

Python (uv) **Dagster asset graph**, per-session partitions. **Inputs come from astra subsystems**:
- transcript + `mouthpiece_context` + speaker map ← **linguist** (0006) — speaker resolution is already done.
- grounding corpus ← **akasha** (0007) — `groundDigest` reads the akasha vellum corpus, not `content/wiki`.
LLM → **litellm + dspy** (dspy as typed plumbing, H1). TTS/ffmpeg stay HTTP/subprocess. Output
`episode.mp3` + `transcript.md` → mouthpiece-frontend; audio published to the external host (F4).

## 3. Assets (the stages as a Dagster graph)

1. **`session_digest`** (← linguist transcript): distill → ordered story beats. litellm structured output.
2. **`session_script`** (← digest + akasha grounding): the **two-pass** generation (§4). The hot, tone-
   critical asset.
3. **`session_audio_clips`** (← script): TTS (ElevenLabs v3 / Edge / mock). Port the HTTP calls + the
   pronunciation IPA wrap.
4. **`session_episode`** (← clips): ffmpeg concat + loudnorm → `episode.mp3` + `transcript.md`.
5. **`mega_digest`** (← a date-range of `session_digest`s): the fuse path → reuses 2–4 on a synthetic id.

Per-session partitions; Dagster materialization replaces caster's `out/` disk cache. `--minutes` length
tuning (beat budget + maxTokens ceiling) becomes asset config.

## 4. LLM re-platform (litellm + dspy)

- **distill** (`callTool`) → a litellm structured call (Pydantic `SessionDigest`).
- **script two-pass** → **two dspy modules**: Pass A (free-text improv `Predict`) → Pass B (structured
  "dressing" `Predict` with a typed `Script` output). **Port the system prompts verbatim** — the tavern
  tone is in the prompt craft, not the framework. Keep `sharpen`/`threads` as optional modules.
- **dspy is typed plumbing here, NOT an optimizer** (research §3.3: creative gen has no crisp metric).
  → decision **H1** (dspy-as-plumbing vs raw litellm).
- **Parity to re-establish** (from `@faerrin/llm`): the `stop_reason==max_tokens → raise` guard (don't
  silently truncate a 32k-token script), prompt caching of the per-host system prompts, forced-tool →
  Pydantic. (All live in `libs/py/llm`, Phase 1.)

## 5. Tone preservation (the #1 risk) — golden A/B

caster's two-pass is tuned + green; a naive Python port can regress into "clean podcast." Gate it:
1. **Port `lint.ts`** (`computeMetrics`/`scoreScript`/`THRESHOLDS`) to Python — objective script metrics.
2. **Golden A/B:** run faerrin caster (TS) and mouthpiece (Py) on the **same digests**; compare on the
   lint metrics + a human spot-read of N episodes. The Python output must hit the same thresholds.
3. **Freeze the prompts** as shared fixtures; any prompt change re-runs the A/B.
→ decision **H2** (how rigorous the gate is: lint-metrics + human spot-check vs human-only vs accept-drift).

## 6. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| H1 | dspy role | dspy-as-plumbing vs raw litellm | **DECIDED: dspy-as-plumbing** — typed modules, prompts verbatim, no optimizer. (Raw litellm is the fallback if dspy fights Pass A.) |
| H2 | Tone-parity gate | lint-metrics+human vs human-only vs accept-drift | **DECIDED: lint-metrics + human spot-check** — objective threshold gate (port `lint.ts`) + a human read of a few episodes. |
| H3 | TTS default | keep ElevenLabs v3 (paid, quality) vs Edge (free) default | **Keep ElevenLabs v3** — it's the quality choice the tone is tuned for; Edge/mock stay as free/offline options. Verify the v3 Text-to-Dialogue tier in astra's env. |
| H4 | Audio output hosting | external host (F4-consistent) vs in-astra | **External** — consistent with scribe (F4); mouthpiece publishes `episode.mp3` to the static host. |
| H5 | Podcast host personas (Bram/Maeve/Pip) home | mouthpiece config vs ontology-being | **DECIDED: ontology-being** — as a **distinct entity type** (`podcast persona`), explicitly **NOT** conflated with weal-bot's Discord host identities. mouthpiece reads them from ontology-being. |

## 7. Work items

1. **Scaffold** `apps/mouthpiece-backend` (uv; Dagster assets; OTel; config). Wire ElevenLabs/Anthropic
   keys from ontology-config (SOPS).
2. **`session_digest` asset**: port distill (litellm structured `SessionDigest`).
3. **`session_script` asset**: port the two-pass + grounding (reads akasha corpus); prompts verbatim;
   `sharpen`/`threads` optional. dspy-as-plumbing (H1).
4. **Port `lint.ts`** → Python; wire the golden A/B harness (H2).
5. **`session_audio_clips` asset**: ElevenLabs v3 / Edge / mock providers (HTTP) + pronunciation IPA wrap.
6. **`session_episode` asset**: ffmpeg concat + loudnorm → `episode.mp3` + `transcript.md`; publish audio (F4).
7. **mega path**: fuse asset over a date-range partition → reuse script/tts/assemble.
8. **Inputs**: consume linguist `mouthpiece_context`/transcript + akasha grounding (replace the faerrin
   `../content/...` filesystem reads).

## 8. Exit criteria

- [ ] One session runs linguist→mouthpiece end-to-end: digest → two-pass script → clips → `episode.mp3`
      + `transcript.md`.
- [ ] **Tone golden A/B passes**: Python output hits the same `lint.ts` thresholds as faerrin caster on a
      shared digest set; human spot-read of N episodes confirms the tavern tone (no "clean podcast" drift).
- [ ] LLM is litellm+dspy; the `max_tokens→raise` guard + prompt caching are in place (no silent truncation).
- [ ] Grounding reads the **akasha** corpus; transcript/context read from **linguist** (no `content/` reads).
- [ ] mega path produces a month-in-review episode on a date-range partition.

## 9. Risks

1. **Tone regression** (the #1 risk) — the two-pass + prompts are load-bearing; port prompts **verbatim**,
   gate with the lint A/B (§5), and treat any drift as a release blocker.
2. **dspy fighting the two-pass** (H1) — if dspy's abstractions add friction to free-text Pass A, fall back
   to raw litellm calls for the script stage (keep dspy for the structured distill).
3. **ElevenLabs v3 tier** — the Text-to-Dialogue path is a paid/tiered feature; verify the key + model
   access in astra's env before relying on it (Edge/mock as fallbacks).
4. **Long-output truncation** — a 30–40 min episode is ~32k tokens; re-establish the fail-loud
   `max_tokens` guard (a silent truncation produces a half-episode).
5. **Grounding shape change** — `groundDigest` read `content/wiki`; now it reads the akasha vellum corpus
   (different shape). Re-validate proper-noun grounding against akasha.

## 10. Hand-off to 0012 (mouthpiece-frontend)

mouthpiece-backend emits `episode.mp3` + `transcript.md` + sidecars per session id (the id schema that
faerrin `face` sorts on). 0012 (face successor, TanStack) consumes these artifacts and renders the
player — replacing face's build-time read of `caster/out/` with mouthpiece-backend's outputs.
