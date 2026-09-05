---
name: mouthpiece-2026-09-recap-glm53-cartesia
description: mouthpiece 2026-09 rework — Pass A debate→two-friends recap (Maeve de-contrarianed), mouthpiece-scoped GLM 5.3 pin, Cartesia Sonic-3 per-turn TTS replacing ElevenLabs; what's wired vs what still needs the user (SOPS key + voice ids) before the next `just up`
metadata:
  type: project
---

**2026-09-04 — three stakeholder-directed mouthpiece changes, BUILT + DEPLOYED + LIVE**
(`0d5c6a1e` code, `21eeebc6` key + voices; dagster services `just up`'d; first Cartesia/GLM-5.3
episode = 2026-8-24 "One Foot Over the Line", 129 turns / 31.1 min, auto-published + live on
mouthpiece.iridi.cc). Voices: Bram → Cartesia "Austin", Maeve → "Gemma".

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

**First live result (2026-8-24 re-render, 40 min wall: script ~25 min GLM 5.3 + 129 Cartesia
POSTs + ffmpeg):** 4/129 turns open with an objection (Maeve 2), 40 open build-on ("yes/okay
so/exactly/and…"), Maeve completes-and-extends ("Three buckets." → he runs with it) — the
contrarian loop is gone. Tags GLM emitted: amused/chuckles/deadpan/excited/happy/laughing/
overlapping/serious/short pause/sighs/thoughtful/whisper/wistful → Cartesia got emotion for the
direction ones, `<break/>` for the pause, the rest stripped. Cartesia accepted
`voice:{mode:id,id}` + `language:en` (smoke + full render). ⭐ Ops gotchas: the Bash tool caps
at 10 min → run the materialize DETACHED (`docker exec -d … > episodes/.rerender-<date>.log`,
delete the log after) and tail the log; a client-killed `docker exec` leaves the in-container
run ALIVE (two renders raced until I killed the orphan) — the image has NO pkill/pgrep, list
via `/proc/*/cmdline` + plain `kill`. `.last-rendered` → the path unit auto-published within
seconds of RUN_SUCCESS (two `chore(mouthpiece)` commits: path unit + 15-min timer). Re-render
recipe: `dagster asset materialize -f definitions.py --select 'session_script,session_audio_clips,session_episode' --partition <date>`
from `/opt/dagster/app`. To re-render with the ElevenLabs voices instead, flip
`tts-provider "elevenlabs"` (its key/ids are still wired). ⚠ the Cartesia key transited chat
2026-09-04 — rotate when convenient (`sops set` + `just up dagster-*`). 2026-9-3 was NOT
re-rendered (a one-shot, stakeholder call); its ElevenLabs episode stays live.

Builds on [[mouthpiece-0024-gotchas]] + [[mouthpiece-glm-debate-switch]] +
[[mouthpiece-two-host-gotchas]] + [[deploy-sops-injection]] + [[flag-paid-live-actions]].
