---
name: mouthpiece-2026-09-recap-glm53-cartesia
description: mouthpiece 2026-09 rework — Pass A debate→two-friends recap (Maeve de-contrarianed), mouthpiece-scoped GLM 5.3 pin, Cartesia Sonic-3 per-turn TTS replacing ElevenLabs; what's wired vs what still needs the user (SOPS key + voice ids) before the next `just up`
metadata:
  type: project
---

**2026-09-04 — three stakeholder-directed mouthpiece changes, BUILT + CI-green locally,
NOT yet deployed** (the audio stage needs two inputs only the user can supply).

1. **Pass A is a two-friends RECAP, not a DEBATE** (`prompts.py build_improv_system_prompt`).
   The debate prompt ("they do NOT agree", "Pushback is the rhythm") had over-tuned Maeve into
   a contrarian — propose/object/repeat. New craft: BUILD on each other ("yes, and"), TRADE
   THEORIES (grounded, framed as guesses), LIVE IN THE WORLD; disagreement is SEASONING (a
   couple a night), corrections are a fond hand-off then she ADDS. Maeve's `being.kdl` persona
   rewritten to match ("the friend who remembers", not "the fact-checker"; wit aimed at the
   world, never at Bram). Pass B tag vocabulary made provider-neutral (no "ElevenLabs v3" in
   the prompt; direction tag at START of turn = one emotion per turn). CLEAN/ENRICH prompts
   say "recap podcast". Forward-only — published episodes keep their scripts.
2. **GLM 5.3 via a mouthpiece-OWN pin**: `mouthpiece { model "openrouter/z-ai/glm-5.3" }`
   (py `MouthpieceConfig.model` + TS mirror; `assets._llm_model()` reads it, falls back to
   `llm.default-model` if empty). Deliberately NOT the global default: linguist's compiled dspy
   judge (`judge.compiled.json`) + heartwood were tuned on 5.2 and stay there. Covers ALL
   mouthpiece LLM calls (clean/enrich + Pass A + Pass B). Pricing row added
   ($1.15/$3.50/1M, cache-read $0.10). Model id verified on openrouter.ai (1.3M ctx).
3. **Cartesia Sonic-3 TTS** (`tts/cartesia.py`, `mouthpiece { tts-provider "cartesia" }`,
   `cartesia-api-key ref="sops:cartesia_api_key"`, compose anchor `CARTESIA_API_KEY`).
   ⭐ Cartesia has NO multi-speaker/dialogue endpoint → `dialogue=False`, one `/tts/bytes`
   POST per turn, manifest mode "turns" (assemble.py's jittered gaps + fades path, which
   ElevenLabs never used live). Tag translation: `[short pause]`/`[long pause]` →
   `<break time="300ms|800ms"/>` (consecutive breaks collapsed — Cartesia says they
   hallucinate), first direction tag or legacy `emotion` → `generation_config.emotion` if in
   the 58-value enum (aliases: annoyed→frustrated, thoughtful→contemplative, deadpan→neutral…),
   every other bracket STRIPPED (Cartesia would read it aloud). Header `Cartesia-Version:
   2026-08-14` pinned. mp3 44.1k/128k so assemble.py is unchanged. Voice ids live on the
   persona: `podcast-persona … cartesia-voice-id ""` (py+ts ontology + canonical JSON regen —
   the field is optional in KDL, defaults ""). ⭐ `_provider()`/`_voices()` FAIL LOUD on a
   missing key or empty voice id (the `${KEY:-}` compose default injects an EMPTY env var,
   which `SecretRef.resolve()` returns as "" — treat empty as missing); no silent
   cross-provider fallback (the old mock-fallback trap).

**▶ BEFORE the next `just up` (else `session_audio_clips` fails loud on every new session):**
1. `sops deploy/sops/secrets.enc.yaml` → add `cartesia_api_key: sk_car_…`.
2. `just mouthpiece-cartesia-voices [query]` → pick a masculine (Bram) + feminine (Maeve) voice,
   paste ids into `being.kdl` `cartesia-voice-id`, then regen the canonical JSON:
   `uv run python -c "from astra_ontology import canonical_json; from astra_ontology_being import CANONICAL_JSON_PATH, load; CANONICAL_JSON_PATH.write_text(canonical_json(load()), encoding='utf-8')"`
   (py+ts parity tests gate it).
3. `just up dagster-code dagster-daemon dagster-webserver` (image-baked code; SOPS env).
4. Re-render one recent session to hear it: swap nothing, `dagster asset materialize
   --select session_script,session_audio_clips,session_episode --partition <date>` in the
   dagster-code container (`sh -c`, `/opt/venv/bin/dagster`), then `just mouthpiece-publish`
   (paid: GLM + Cartesia; flag at the moment). Compare against the last ElevenLabs episode.

Untested live (paid): the Cartesia call itself — request shape is unit-tested against the
docs (`test_cartesia.py`); `voice: {"mode":"id","id":…}` form + `language:"en"`. If Cartesia
rejects `mode`, a bare voice-id string is also accepted per the bytes docs.

Builds on [[mouthpiece-0024-gotchas]] + [[mouthpiece-glm-debate-switch]] +
[[mouthpiece-two-host-gotchas]] + [[deploy-sops-injection]] + [[flag-paid-live-actions]].
