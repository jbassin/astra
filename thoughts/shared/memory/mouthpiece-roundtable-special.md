---
name: mouthpiece-roundtable-special
description: mouthpiece prediction-roundtable special (2026-10-21) — campaign-wide mystery dossier → ~45-min theory episode; stakeholder choices + gotchas
metadata:
  type: project
---

PROJECT 2026-10-21: a one-off **prediction roundtable** special for through-a-song-darkly, LIVE on
mouthpiece as `000.through-a-song-darkly.2026-10-19-recap-of-2025-8-28` (45.1 min). Code `39c8ab67` +
`56627e43`: `astra_mouthpiece/roundtable/` — `just mouthpiece-roundtable {dossier|script|render} [run-dir]`.
Dossier = HardenedRLM over the producer's `ProducerTools` (cutoff = day after the latest session) →
14 mysteries / 85 clues / 42 theories, $0.19, 13 min; script = roundtable Pass A + unchanged Pass B
(`script.dress_transcript`), 7,736 words, $0.38 (GLM 5.3); render = host-run ElevenLabs + assemble +
`.last-rendered` → the linguist-commit path unit auto-publishes.

**Stakeholder choices (the GM, who knows the answers):** focus on BIG-story + close-to-the-party
mysteries; NO evidence gate ("predictions need speculation") — theories start from a real breadcrumb, then
leap, owned as guesses; only events stay un-inventable; NO review of dossier or script (spoils it for the
GM — report stats only, never content); ~45 min; players don't read the site, so correct guesses are fine.
Ungated quote accuracy was still 77/85 verbatim at the cited line/page.

**Why:** the GM wants to hear which breadcrumbs the hosts pick up.
**How to apply:** for a repeat, re-run the three steps; never paste dossier/script content to the GM.

Gotchas:
- Special-episode id must use the recap form `<latest>-recap-of-<first>`: `date_sort_key` zeroes a
  non-digit day, and `is_recap` makes every session-scoped reader (producer tools, chronicle) skip it.
- `SessionDigest` REQUIRES `stats` — a special writes a plain `{session_id, synopsis}` digest (the shape
  the recap capstones use; the catalog reads only those keys).
- `render` is classified a production deploy: needs the user's explicit "deploy it" in the moment.
- heartwood was NOT in Dagster then: 10-12/10-19 were run by hand for this ($0.47 + $0.32). Since
  2026-10-22 it runs per session automatically ([[heartwood-dagster-0036]]).
