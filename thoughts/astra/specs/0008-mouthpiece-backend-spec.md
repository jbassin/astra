# NLSpec 0008 — mouthpiece-backend (roundtable script → TTS audio)

**Status:** **BUILT; Stage 2 + Pass A input SUPERSEDED by 0024** (2026-07-07 — distill/beats, mega,
threads, and the one-shot arm are deleted; see `0024-mouthpiece-script-rework-spec.md`. Pass B / TTS /
assemble / episodes-index decisions below stay in force.) _(Originally:)_ **Plan (pre-implementation)** — scoping verified against both repos; **decisions locked (H1
resolved below)**; ready for `octo:embrace`. **Phase:** 3 (pipeline). **Source plan:**
[`../plans/0008-mouthpiece-backend.md`](../plans/0008-mouthpiece-backend.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-20-mouthpiece-backend-0008-thoughts.md`](../../shared/research/2026-06-20-mouthpiece-backend-0008-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (python-pro, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** `0006` linguist (transcript + `mouthpiece_context` + speaker map), `0007` akasha-backend
(grounding corpus), Phase 1 (`libs/py/{llm,config,observe}`, `astra_ontology_being`). **Blocks:** `0012`
mouthpiece-frontend.

## Goal

Rewrite faerrin's `caster` (Bun TTS pipeline, ~4,300 LOC) into astra **mouthpiece-backend** — a session
transcript → a tavern-tone roundtable **script** → **audio** (`episode.mp3` + `transcript.md`) — as a
**Dagster asset graph** (one partition per session/date), LLM via `libs/py/llm`. The headline constraint is
**tone preservation**: caster's two-pass technique is tuned and green, and the craft lives in the prompts —
so the prompts and the tone-linter port **byte-for-byte**, gated by a golden A/B.

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| H (roadmap) | Runtime | **Dagster asset graph**, per-session partitions; `out/` disk-cache → asset materialization. |
| F4 (roadmap) | Audio hosting | **External** `static-audio` host — mouthpiece publishes `episode.mp3`; hosting out of scope. |
| H2 (plan) | Tone-parity gate | **lint-metrics + human spot-check** — port `lint.ts`, objective threshold gate + human read of N episodes. |
| H3 (plan) | TTS default | **ElevenLabs v3** (the tone is tuned for it); **Edge** (free) + **mock** (offline) stay as fallbacks. |
| H4 (plan) | Audio output | **External host** (F4-consistent). |
| H5 (plan) | Host personas | **ontology-being `PodcastPersona`** (bram/maeve/pip) — distinct type from weal `WealHost`; mouthpiece reads name+voice_id+persona from there. |

### H1 — dspy role — **DECIDED (2026-06-20): raw `libs/py/llm`, typed contracts via Pydantic; dspy reserved for the judge**

**Both `session_script` and `session_digest` are built on raw `libs/py/llm`** — Pass A on `call_text`,
Pass B on `call_tool`, distill on `call_structured`. **Typed I/O contracts come from Pydantic models**
(the schemas of M3), **not from dspy signatures**. **dspy is reserved for the optimizer-bearing case only**
— the linguist judge (gate J), which has a gold set + a metric. Rationale:

- **dspy earns its keep only where the optimizer pays off.** Creative gen has no crisp metric
  (research §3.3), so uncompiled dspy-as-plumbing would be all tax, no optimization.
- **In this repo, `make_dspy_lm` is a bare `dspy.LM`** — it bypasses `LiteLLMClient._complete`, so routing
  the script/distill through dspy would **lose the `max_tokens→raise` guard (silent half-episode — Risk 4),
  the static-prompt cache_control, and the `astra.llm.cost_usd` metric**, all of which the raw path gives
  for free. dspy would force re-implementing the three around it.
- **dspy's adapter owns the wire format** (field markers + preamble; no verbatim passthrough), which would
  break byte-fidelity with faerrin and **invalidate the golden A/B** (M2/M10), and on the tone-critical
  free-text Pass A the scaffolding risks nudging the model toward the clean-podcast attractor.
- **The one benefit (typed output + parse-retry) is already covered by `call_structured`** (forced tool →
  Pydantic) without surrendering the prompt envelope or the three guarantees.

## Scope (in)

- **`apps/mouthpiece-backend`** (uv app): Dagster asset defs loaded by `dagster/definitions.py`; OTel via
  `libs/py/observe` (`init_telemetry` in the code location); `MouthpieceConfig` + ElevenLabs key via
  `libs/py/config` (SOPS); hosts/voices from `astra_ontology_being`.
- **`session_digest`** asset (← linguist transcript): port `distill` — `call_structured`/`call_tool` with the
  `record_session_digest` tool schema → Pydantic `SessionDigest` (synopsis + ordered `Beat[]` + discarded).
- **`session_script`** asset (← digest + akasha grounding): the **two-pass** generation —
  **Pass A** `call_text(buildImprovSystemPrompt, buildScriptUserContent)` (free-text raw transcript) →
  **Pass B** `call_tool(buildDressingSystemPrompt, buildDressingUserContent, record_script)` (structured
  turns, no polishing). **Both system prompts ported byte-for-byte.** `sharpen`/`threads` optional modules.
- **Grounding** (`groundDigest` re-impl): resolve beat `wikiRefs` against the **akasha vellum corpus**
  (`apps/akasha-backend` `corpus.py` `load_corpus`), title/basename match, dedupe, char-budget (24k) — a
  **new code path**, not a port (faerrin matched `content/wiki`).
- **`session_audio_clips`** asset (← script): TTS providers behind one interface —
  **ElevenLabs v3 Text-to-Dialogue** (dialogue-chunked, ~2k char budget per call), **Edge** (per-turn),
  **mock** (offline); the v3 path applies the **pronunciation IPA wrap** + delivery-tag render.
- **`session_episode`** asset (← clips): **ffmpeg** concat + EBU R128 loudnorm → `episode.mp3` +
  `transcript.md`; "turns" mode (jittered faded gaps) vs "dialogue" mode (uniform gap, pre-paced);
  optional ambient bed; publish to the external host (F4).
- **`mega_digest`** path (← a date-range of `session_digest`s): `fuse` → one month-in-review `SessionDigest`
  on a synthetic id → reuses the script/clips/episode assets.
- **Tone golden A/B** (`lint.ts` port + harness): port `computeMetrics`/`scoreScript`/`THRESHOLDS` verbatim
  to Python; recalibrate thresholds against the committed faerrin reference outputs.
- **Telemetry**: traces+metrics+logs to SigNoz in the actual Dagster runtime ([[telemetry-built-in]]);
  LLM cost already lands on `astra.llm.cost_usd` via `libs/py/llm`.

## Scope (out)

- **Ingest stage** (`ingest/*`) — speaker resolution + transcript parse are **already done by linguist**;
  mouthpiece consumes linguist's `mouthpiece_context`/transcript, not `content/transcripts`.
- **Re-grounding against `content/wiki`** — replaced by the akasha corpus read.
- **dspy as an optimizer** — no crisp metric for creative gen (H1); dspy at most typed plumbing for distill.
- **Audio hosting infra** (the `static-audio` host) — external, out of scope (F4); mouthpiece publishes to it.
- **The live ElevenLabs v3 paid call as a CI gate** — CI/tests use the **mock/Edge** providers; the real v3
  call is a documented one-command follow-up (the one genuine unknown, paid/tier-gated).
- **mouthpiece-frontend** (the player UI) → `0012`; mouthpiece-backend only emits the artifacts.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| M1 | LLM seam | **`libs/py/llm` only** (standing principle #3) — `call_text` (Pass A), `call_tool` (Pass B), `call_structured` (distill). **No dspy in the script/distill path** (H1): typed I/O via Pydantic, not dspy signatures. The `stop_reason==max_tokens → raise` guard + prompt caching of the static per-host system prompts + cost→OTel are **already implemented** (Phase 1); no new client work. dspy stays reserved for the linguist judge (the only optimizer-bearing case). |
| M2 | Prompt fidelity | `buildImprovSystemPrompt`, `buildDressingSystemPrompt`, `buildScriptSystemPrompt` (one-shot, for A/B), `buildScriptUserContent`, the distill prompt, and the sharpen prompts are ported **verbatim** (Python f-strings over ontology-being persona text). Any wording change re-runs the A/B (H2). |
| M3 | Schemas | `record_session_digest` + `record_script` tool input-schemas ported as Pydantic models; the model must not echo `sessionId` (attached locally, as faerrin does). `Beat` enrichment fields optional → older digests degrade gracefully. |
| M4 | Hosts/voices source | **ontology-being** `PodcastPersona` — `name`, `persona`, `voice_id` for A=bram / B=maeve / C=pip. Verified loaded with voice IDs. mouthpiece carries no local host config (H5). |
| M5 | Grounding purity | `groundDigest` is **pure** over (digest, corpus-pages) — the akasha read is injected, so it unit-tests without akasha materialized. Re-validate proper-noun resolution against akasha titles (Risk 5). |
| M6 | TTS interface | a `TTSProvider` protocol (`synthesize` per-turn; optional `synthesize_dialogue` + `dialogue: bool`); ElevenLabs v3 (dialogue), Edge (per-turn), mock (offline). Pronunciation IPA + delivery-tag render apply **only** on the v3 path (slashes would be read aloud otherwise). |
| M7 | ffmpeg | pure Python arg-builders (concat list, loudnorm, silence, fade, probe, bed) with the subprocess injected — unit-tests without ffmpeg-on-PATH (the scribe `audio.py` pattern). ffmpeg/ffprobe are **runtime** deps (present locally + in the Dagster image). |
| M8 | Caching/ledger | a materialized asset partition = "done" (replaces caster's `loadOrGenerate*` `out/` cache). Dialogue clips re-synth wholesale per partition; the disk-cache `force`/`cached` seams collapse into Dagster materialization state. |
| M9 | Lint thresholds | **PROVISIONAL** as ported. **Recalibrate** by linting the **7 committed faerrin `out/*.script.json`** reference outputs (no LLM spend) before treating the `/10` mechanical subtotal as a release blocker. |
| M10 | Golden A/B corpus | the 6 per-session + 1 mega committed `digest.json`/`script.json` pairs in faerrin `caster/out/` are the fixtures: digest (input) + faerrin TS script (reference). astra runs `session_script` on the same digests; diff on the lint metrics + human spot-read. |
| M11 | Tests hermetic | py CI must not need a live ElevenLabs/Anthropic call or ffmpeg — distill/script use a recorded/stub `CompletionFn`; TTS uses mock; ffmpeg arg-builders unit-test pure; the lint port has a fixture-based parity test vs the TS metrics. |
| M12 | Truncation | a 30–40 min episode ≈ 32k tokens → `DEFAULT_SCRIPT_MAX_TOKENS = 32_000`; rely on M1's `max_tokens→raise` guard so a truncated script fails loud, never half-emitted. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | `apps/mouthpiece-backend` scaffolded; uv + py CI lanes green (ruff/format/ty/pytest) | run locally |
| B | `session_digest`: distill via `libs/py/llm` → Pydantic `SessionDigest` (parses the 7 `out/` digests) | unit test (recorded response) + fixture parse |
| C | `session_script`: two-pass (`call_text`→`call_tool`), **prompts byte-identical** to faerrin | prompt-equality test + a stubbed two-pass run |
| D | Grounding resolves beat `wikiRefs` against the **akasha** corpus (not `content/wiki`) | unit test (injected corpus) |
| E | **`lint.ts` ported**; metrics match the TS implementation on shared fixtures; thresholds recalibrated against `out/*.script.json` | parity test + a calibration note |
| F | **Tone golden A/B**: astra `session_script` on the shared digests hits the recalibrated thresholds; human spot-read confirms no "clean podcast" drift | A/B harness + human read of N |
| G | `session_audio_clips`: mock + Edge providers produce clips hermetically; v3 dialogue chunking + IPA wrap unit-tested | tests (no live v3) |
| H | `session_episode`: ffmpeg concat + loudnorm arg-builders unit-tested; `episode.mp3` + `transcript.md` shape correct | unit test (pure arg-builders) |
| I | `mega_digest`: date-range fuse → one synthetic digest → reuses script/clips/episode | unit test |
| J | All assets loaded by `dagster/definitions.py`; SigNoz traces+metrics+logs wired in the code location | import + telemetry check |
| K | **(deferred, paid)** live run: a real linguist session → two-pass script → **ElevenLabs v3** clips → `episode.mp3` | documented one-command follow-up |

## Risks

1. **Tone regression (#1).** The two-pass + prompts are load-bearing; port prompts **verbatim** (M2), gate
   with the lint A/B (F), treat any drift as a release blocker. The lint thresholds are provisional —
   recalibrate before gating (M9).
2. **dspy fighting the two-pass (H1) — resolved out.** Script + distill use raw `libs/py/llm`
   (`call_text`/`call_tool`/`call_structured`), so dspy's adapter never touches the tone-critical prompts;
   this also keeps the `max_tokens→raise` guard, prompt caching, and cost→OTel that `make_dspy_lm`'s bare
   `dspy.LM` would bypass.
3. **ElevenLabs v3 tier.** The Text-to-Dialogue path is paid/tiered; the credential is verified live (51-char
   `sk_…` via SOPS) but endpoint access is the one genuine unknown — Edge/mock are the hermetic fallbacks (K).
4. **Long-output truncation.** ~32k-token episodes → the `max_tokens→raise` guard (M1/M12) prevents a silent
   half-episode.
5. **Grounding shape change.** `groundDigest` now reads the akasha vellum corpus (different shape than
   `content/wiki`) → re-validate proper-noun grounding against akasha titles/paths (M5/D).
6. **Adversarial-completeness catches** (surfaced in the spec pass, mitigations above): (a) the **one-shot**
   `buildScriptSystemPrompt` must also port — the A/B's `twoPass:false` arm needs it; (b) **dialogue chunking
   ≠ per-turn** changes assembly mode ("dialogue" vs "turns") — both ffmpeg paths must port, not just one;
   (c) `Beat` enrichment fields are **optional** — don't make them required or older/mega digests break (M3);
   (d) pronunciation IPA applies **only** on v3 (M6) — applying it to Edge/mock would read slashes aloud;
   (e) **mega** runs on a *synthetic* session id — the bed-offset hash + filename schema must tolerate it.

## Hand-off to 0012 (mouthpiece-frontend)

mouthpiece-backend emits per session id: `episode.mp3` + `transcript.md` + sidecars (the id schema faerrin
`face` sorts on). `0012` (face successor, TanStack) consumes these artifacts and renders the player —
replacing face's build-time read of `caster/out/` with mouthpiece-backend's outputs. The live v3 run (K) is
executed when a real linguist session is available and the v3 tier is confirmed.
