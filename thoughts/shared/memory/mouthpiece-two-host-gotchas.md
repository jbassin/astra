---
name: mouthpiece-two-host-gotchas
description: mouthpiece recap podcast consolidated 3→2 hosts (Pip rolled into Maeve) + calmer prompts; the optional-legacy-3rd-speaker back-compat + the live re-render/deploy gotchas
metadata:
  type: project
---

2026-06-24 the mouthpiece recap podcast went from **three hosts to two** (user product
call, post-migration): **A=Bram (Recapper), B=Maeve (the grounded foil)**; **Pip retired,
rolled into Maeve** (she keeps her Juniper voice and absorbs his needling — "precise foil
who also needles"). Script prompts rewritten for two voices + **far fewer interruptions**
(dropped the "one line in four mid-thought on an em-dash" rule + the imperfection budget;
"interruptions should be RARE"). Code `c2309df`, live snapshot `bad00bb`. Extends
[[pipeline-live-run-gotchas]] / [[mouthpiece-frontend-0012-gotchas]].

**THE load-bearing back-compat mechanism — per-episode hosts.** The 9 already-published
episodes stay three-host (Pip intact); only NEW episodes are two-host. To make that work:
- `SpeakerId` keeps `"C"` (Literal A/B/C) and `HostConfig.c` / `VoiceConfig.c` are now
  **optional** (`| None = None`) — so legacy 3-host data still parses, new 2-host data has c=None.
- `episodes_index.py` carries each episode's **OWN** host block: `SessionInput.hosts`,
  `_read_hosts(script)` (handles BOTH faerrin wire keys `A/B/C` AND astra dump keys `a/b/c`
  with a null c), and `build_index` uses `s.hosts or hosts`. `assets._episode_hosts()` is now
  just the **fallback** (A/B). Net effect verified in the published snapshot: 8 legacy episodes
  = `ABC` + Pip lines; only 2026-6-22 = `AB`, 0 Pip.
- `hosts.py HOST_SLUGS` = {A:bram, B:maeve}; sharpen/SPEAKERS/schema-enum all drop to two;
  `being.kdl` dropped the `pip` persona + rewrote `maeve` → regenerate `being.canonical.json`
  (the py↔ts parity gate).
- **Deleted the faerrin prompt-fidelity tests** (`test_prompt_fidelity.py`) — the prompts now
  deliberately diverge from caster. The "tavern-ness" linter (`lint.py`) thresholds were tuned
  for the messy 3-host style, so calmer scripts score lower disfluency — diagnostic only, NOT a
  gate (tests only assert in-range).

**Live re-render of ONE episode without re-running Stage 3 (the LLM script gen)** — to keep an
exact already-approved script: place `script.json` into `episodes/<date>/` then
`dagster asset materialize --select "session_audio_clips,session_episode" --partition <date>
-f definitions.py` (in the `dagster-code` container, WORKDIR `/opt/dagster/app`). Stages 4+5
read script.json from disk. Back up `<id>.episode.mp3` / `.transcript.md` / `manifest.json` /
`script.json` first (they're overwritten); the audio/transcript are **id-prefixed**
(`<id>.episode.mp3`), not bare `episode.mp3`.

**Two deploy traps that cost real time this session:**
1. **The dagster container runs code baked into its image, NOT the bind-mounted repo.** A
   `mouthpiece-backend` source change is invisible until you **rebuild**: `docker compose build
   dagster-code && up -d dagster-code`. Symptom before rebuild: the container's stale `Script`
   model still *required* `hosts.c`, rejecting the 2-host `script.json` (`hosts.c Input should be
   an object`).
2. **Recreating a container with plain `docker compose up -d <svc>` DROPS the SOPS-injected env**
   (the keys live in the host shell only during `just up`'s decrypt). Result: the ElevenLabs key
   doesn't resolve and `_provider()` **silently falls back to the MOCK TTS** — a ~27s render,
   `manifest.mode="turns"`, 222 per-turn clips, 60s placeholder durations, a silence-sized mp3.
   Fix: recreate via `just up`, OR replicate the injection (`export` upper-cased from
   `sops -d --output-type dotenv deploy/sops/secrets.enc.yaml`) before `docker compose up -d`.
   Verify with `load().mouthpiece.elevenlabs_api_key.resolve()` truthy (real path → `mode=dialogue`).

**Manifest `duration_ms` is a placeholder for dialogue clips** (~60000 ms/chunk), NOT the real
length — ffprobe the clip files for truth (the assembled mp3 length is correct; the metadata
field isn't). Cosmetic: the frontend uses the audio's `loadedmetadata`, and the committed
snapshot stores `durationMs=0` anyway.

Final live state: 2026-6-22 re-rendered as two-host **"The Sandwich Yoink Bonus"** (real
ElevenLabs v3, 26 min), published + `just up`'d so the whole stack (incl. dagster daemon) runs
two-host code → future auto-generated episodes are two-host. `linguist-commit.timer` re-enabled.
