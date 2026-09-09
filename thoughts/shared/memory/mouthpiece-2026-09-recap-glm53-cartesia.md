---
name: mouthpiece-2026-09-recap-glm53-cartesia
description: mouthpiece 2026-09 rework — THIRD HOST Nell (the newcomer seat, `ea4d4c58`, deploy pending); Pass A debate→two-friends recap (Maeve de-contrarianed), mouthpiece-scoped GLM 5.3 pin, Cartesia Sonic-3 TTS tried + REJECTED on voice quality (ElevenLabs v3 stays live; Cartesia remains a wired alternate)
metadata:
  type: project
---

**⭐ 2026-09-08 THIRD HOST RE-INTRODUCED: Nell, the NEWCOMER seat (`ea4d4c58`) — DEPLOYED + 2026-9-7 RE-RENDERED LIVE as the first three-host episode "The Room Is a Person" (42.1 min, 298 turns/6,656 words — OVER the ~6k prompt cap; floor by words Bram 49%/Nell 28%/Maeve 24%, Nell 126 short turns, zero corrections aimed at her; auto-published `d9275660`).** ⭐ THE render failure + fix (`2044da27`): the model emitted a TAG-ONLY turn (`[stunned silence]`) → ElevenLabs Text-to-Dialogue 400 on the empty input, `raise_for_status` hid the body, AND the step RetryPolicy re-rendered+re-billed the 13 good chunks ×4 before failing → `speakable_turns()` skips no-speech turns (warning + `astra.mouthpiece.tts.skipped_turns`), `TtsClientError` carries 4xx status+body on both httpx seams, asset maps it to `dg.Failure(allow_retries=False)`. Also: Pass A on GLM 5.3 took 61 min this time (OpenRouter `finish_reason='error'` at min 52, content still complete); ⭐ the detached CLI `dagster asset materialize` run exported NOTHING to SigNoz (no astra.llm spans, no logs — diagnose via the log file + `/proc`), and a Monitor on the log file missed RUN_SUCCESS/RUN_FAILURE (poll the log, don't trust the watch). Backup of the two-host 9-7 episode sat in the session scratchpad only (gone). ▶ NEXT: stakeholder listen → Maeve floor-share nudge? length cap enforcement? Design (stakeholder-settled): a Pathfinder veteran new to THIS campaign — asks (never guesses), owns the how-close/how-costly game read, is NEVER written as wrong or corrected (Bram stays the only misrememberer), texture = EAGERNESS (over-asks, "we'll get there"). NOT Pip revived: the skeptic/needler role was deliberately scrubbed in the 2026-09 two-friends rework and must not come back through seat C. Wiring: `podcast-persona "nell"` in being.kdl (canonical JSON regenerated — the py↔ts parity test is the gate) → `hosts.HOST_SLUGS["C"]` → tool enum A/B/C → improv prompt requires three hosts (raises on `c=None`), dressing map sizes to the config (two-host legacy configs still dress); seat-C role labels are keyed by host NAME (Pip=Instigator, Nell=Newcomer) in assemble.py + the frontend, because seat C has held two different hosts; `HostConfig.c` stays optional for the 2026-06→09 two-host scripts. Voice `6u6JbqKdaQy89ENzLSju` (ElevenLabs library, ~258 Hz median f0 → written "she"): ⭐ the scoped pipeline key LACKS `voices_read` (voices/, shared-voices both 401) so a library voice's display name can't be resolved from here — validate a voice with a tiny paid `text-to-speech` probe instead (200 = usable); `cartesia-voice-id` left "" (Cartesia not live; `_voices` now fails loud on seat C too if it ever is). ElevenLabs Text-to-Dialogue has NO speaker cap and `eleven_v3` (GA 2026-03-14) is still the newest dialogue model — nothing to migrate. Gotcha: `vp run -r test --filter` does NOT exist (the flag passes through to vitest and fails every member) — run a member's `pnpm run test` in its dir. First three-host episode = the next pipeline session (or a re-render); watch the 4.5–5.5k-word LENGTH cap with three voices.

**⭐ GLM 5.3 REASONING SHARES `max_tokens` — the 16k client default truncates the clean filter (2026-9-7, fixed `b637d806`).** First real end-to-end digest on GLM 5.3: `session_digest` failed 4/4 (RetryPolicy exhausted) with "Tool-call output hit max_tokens (16000)" — reproduced on the host: a 98-window filter batch drew 16.8k+ reasoning tokens and ZERO tool output (the verdict payload is ~2k). Fix = `clean.DEFAULT_CLEAN_MAX_TOKENS = 64_000` threaded into `classify_windows`/`enrich_session` + `DEFAULT_SCRIPT_MAX_TOKENS` 32k→64k (stakeholder call: raise the budget, do NOT lower effort/disable reasoning — OpenRouter also rejects `reasoning.enabled=false` for this endpoint: "Reasoning is mandatory"). Note `llm.default-max-tokens` in config.kdl is consumed NOWHERE — the astra_llm `DEFAULT_MAX_TOKENS` constant (16k) is what applies unless a caller passes `max_tokens`. Oddity: at a 64k ceiling 3/3 host samples returned with 0 reasoning tokens in <1 min (provider routing by requested budget?). Recovery = `launchRunReexecution FROM_FAILURE` after `just up dagster-code` (digest persisted, script+audio re-ran); 9-7 episode "Firebombing the Patient" 34.3 min auto-published by the timer.

**⚠ 2026-09-04 late: Cartesia REJECTED after one listen ("I hate it") → `tts-provider "elevenlabs"`
again (`0e1588af`, py/ts defaults + tests flipped, dagster `just up`'d), 2026-8-24 audio
re-rendered ElevenLabs-only (`--select session_audio_clips,session_episode`, script kept).
Cartesia stays wired (provider, key in SOPS, voice ids on the personas) as a selectable
alternate — the prompt rework + GLM 5.3 pin are what survived.**

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
