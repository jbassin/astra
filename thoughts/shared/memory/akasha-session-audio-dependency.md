---
name: akasha-session-audio-dependency
description: akasha transcript audio still served by faerrin's static-audio.iridi.cc (the one faerrin block NOT decommissioned); new sessions 404; scope written to bring it under akasha /audio
metadata:
  type: project
---

**akasha's transcript player does NOT get its audio from astra** — it still fetches the
combined Craig session recordings from **faerrin's `static-audio.iridi.cc`** (a deliberate
"external host F4" migration call, not an oversight). Surfaced 2026-06-24; scope written but
NOT built. Related: [[akasha-frontend-0011-gotchas]].

Chain: linguist `assets.py` `STATIC_AUDIO_BASE = "https://static-audio.iridi.cc"` →
`process_session(date, f"{STATIC_AUDIO_BASE}/{date}/audio.mp3", …)` → transcript JSON `audio`
field → akasha `transcriptBuild.ts` `<source src>`. astra's `sites.caddyfile` has **no**
static-audio block; it works only because the shared proxy
`/ruby/data/reverse-proxy/Caddyfile` still `import`s **faerrin's whole caddyfile**, whose
`static-audio.iridi.cc { import static_files wretch/data/saved }` serves it. So faerrin is
**not actually fully decommissioned** — this is a live cross-repo dependency.

Two real gaps (verified):
- Back-catalog plays (`static-audio.iridi.cc/2025-9-11/audio.mp3` → 200; 85 sessions, **31 GB**
  in `faerrin/pkg/wretch/data/saved`).
- **New sessions 404** — astra's scribe writes the combined mp3 to `apps/scribe/data/saved/
  <date>/audio.mp3` (198 MB), NOT faerrin's wretch, so anything the live pipeline adds has
  **broken transcript audio**. It's a bug fix as well as a decoupling.

Scope (locked: serve same-origin **under the akasha host**, mouthpiece `/audio` pattern —
`createSsrServer` static-mount + runtime `akasha-audio` volume + `just akasha-seed`, build-time
normalize the `<audio>` URL to `/audio/<date>.mp3`):
**`thoughts/shared/research/2026-06-24-akasha-session-audio-thoughts.md`**. Open decisions
before building: the **31 GB volume** (disk headroom; all 85 vs subset) and how to drop the
faerrin static-audio block cleanly (the parent proxy imports faerrin's WHOLE caddyfile —
removing the import also kills heart/caster/eerie/lark, a broader faerrin-edge teardown scoped
out).
