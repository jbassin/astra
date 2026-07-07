---
name: mouthpiece-0024-gotchas
description: PROJECT 2026-07-07 — 0024 mouthpiece script rework BUILT+DEPLOYED+LIVE (distill/beats→clean+enrich, threads+mega deleted, Pass A reads the cleaned transcript); the load-bearing findings
metadata:
  type: project
---

**0024 mouthpiece script-generation rework — BUILT + DEPLOYED + LIVE 2026-07-07** (S1 `7eec3d4` →
S5 `66799a5` + S6 deploy; spec `thoughts/astra/specs/0024-mouthpiece-script-rework-spec.md`, scope
doc `…/research/2026-07-07-mouthpiece-script-rework-0024-thoughts.md`). Stage 2 is now
**clean+enrich** (`clean.py`: heartwood-style 20-turn windowed keep/drop → compact inclusive
line-id `kept_ranges` + `dropped` audit trail + `KEPT_LINES_FLOOR=150` loud-fail; one enrich call →
synopsis + flat wiki_refs); Pass A debates the **full cleaned transcript** + a deterministic
`being.kdl` roster block + the narrative-mechanics rule (no recited rolls/DCs/HP). threads, mega,
distill/beats, and the one-shot arm are DELETED. `digest.json` filename + top-level `synopsis` is
THE downstream contract — episodes_index/migrate/frontend needed zero edits.

**Load-bearing findings:**
- **Window granularity means scattered ASR noise SURVIVES the filter.** 2026-7-6 (~576 bare "you"
  lines interleaved with real content) kept 5,660/5,821 — almost no 20-turn window is
  noise-dominated, so keep-when-in-doubt keeps mixed windows. `asr_noise` catches **contiguous
  runs** only (it nailed both block-runs). The sanity floor therefore trips only on run-dominated
  transcripts; scattered-noise sessions flow through and Pass A ignores the residue fine. Don't
  "fix" this without a new decision — it's the accepted failure direction (over-keep).
- **Filter boundary quality is startlingly good on real data:** 2026-6-29 dropped exactly lines
  1–1220 (the pre-game hour), ending at the GM's literal "recap time" call.
- **Timing/cost:** digest 133s (filter batches + enrich), script 270s (Pass A + chunked Pass B),
  zero LLM retries — every attempt far under `REQUEST_TIMEOUT_S=300`, so the pre-authorized raise
  was NOT needed. ~50k-token Pass A input is a non-event on GLM-5.2.
- **Hosts now say player names** ("Josh was clear that…") — the roster block exposes
  `played by <Player>`, and Pass A uses it naturally, table-adjacent-podcast style. New behavior
  vs the beats era; accepted, flag if unwanted.
- **Roster rendering traps** (adversarial-pass finds, verified real): every GM role in being.kdl
  has NO desc and Arctos has NO class — `- Gamemaster, played by Josh` (no colon) and
  `- Arctos (played by Jorge): …` (no class parenthetical); descs are full sentences → join with
  a space, not "; ".
- **S3/S4 relocation pattern worked:** new models defined in `clean.py` while old
  `models.SessionDigest` still lived (S3 additive-green), relocated into models.py at the S4
  atomic cutover. `date_sort_key`/`date_in_range` moved into episodes_index.py BEFORE mega.py
  died (its only importer).
- **Stage-3 drift guard:** session_script re-parses the canonical transcript and asserts
  line-count == `digest.stats.lines` before applying ranges (FROM_FAILURE across a linguist
  regen would otherwise apply stale ranges silently).
- Container `sh` has no `time` builtin — bracket materialize commands with `date +%s`.
- Acceptance rerender precedent continues: 2026-6-29 re-rendered + REPLACED live (third time —
  "The Canary in the Undercroft", 31 min, mode=dialogue). 2026-7-6's digest.json is now
  new-schema too (digest-only rerun; its published episode/audio untouched, synopsis regenerated).
- Snapshot diff on publish was 112+/402− — the index inlines the transcript, so a re-rendered
  episode REWRITES its whole entry; expected, not a regression.

Builds on [[pipeline-reorder-0021]] + [[mouthpiece-glm-debate-switch]] + [[heartwood-0020-gotchas]]
(filter architecture source) + [[flag-paid-live-actions]] (feedback born this session).
