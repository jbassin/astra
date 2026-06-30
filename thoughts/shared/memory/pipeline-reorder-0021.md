---
name: pipeline-reorder-0021
description: PROJECT 2026-06-30 — the 0021 pipeline-reorder work (scribe parallel-split + chronicle→mouthpiece context); scoped both, Change A specced, no code yet
metadata:
  type: project
---

PROJECT (planning stage, 2026-06-30): reorder the data pipeline to **craig → (transcribe ∥ merge
audio) → chronicle → mouthpiece**, with chronicle output feeding mouthpiece. Compared against the real
Dagster graph (sub-agent-verified, file:line) → **two independent changes**. **Scoped both; Change A
specced; NO code landed.**

**Why:** _Current_ flow has merge+transcribe **welded sequential** inside one scribe asset
(`session_outputs`→`process_session`, `session.py:75-76`), and chronicle + mouthpiece are
**independent parallel siblings** off linguist's corrected transcript (not sequential, no context
shared). Cross-app ordering is **sensor + file-handoff driven, NOT cross-app Dagster `deps`** — which
makes the reorder a sensor/asset change, not a graph rewrite. **Linguist correction STAYS** in the
chain (stakeholder-confirmed). Mouthpiece audio is its OWN ElevenLabs TTS, unrelated to scribe's
`audio.mp3` (which only the out-of-band `just akasha-seed` consumes — no Dagster downstream).

**Locked decisions (carry into specs):**
- **A1 = shared extract asset.** Split `session_outputs` → `session_tracks` (verify+extract+roster-
  filter, persist player tracks to `cfg.tmp_path/<date>/tracks/`) → `session_audio` ∥
  `session_transcript` (both `deps=session_tracks`). `tmp_path` is already in `ScribeConfig` +
  config.kdl but **unused** → no schema/config change. **Gotcha:** Dagster's default multiprocess
  executor runs each asset in a SEPARATE process, so the two tails can't share an in-memory `tracks`
  or a per-step `TemporaryDirectory` — extraction MUST persist to a stable on-disk path. craig_drop_
  sensor.target becomes the 4-asset selection (a RunRequest materializes only the targeted assets).
- **Cleanup = fan-in `session_cleanup` asset** (`deps=[session_audio, session_transcript]`,
  `rm -rf cfg.tmp_path/<date>/` only after BOTH tails succeed — the stakeholder's explicit ask;
  failed tail → tracks retained). **Caveat C8:** since cleanup deletes tracks, re-running ONE tail
  needs materializing from `session_tracks` (default executor won't auto-run upstream).
- **B1 = mouthpiece context = prior episodes + this session's arc/season placement** (NOT its own
  summary — the transcript is already in the digest, so its own `EpisodeSummary` is redundant; prior
  episodes are the additive "what came before").
- **B2 (injection site) = script stage** (`build_script_user_content`, mouthpiece `prompts.py:237`),
  threaded like the existing `threads_block`; digest stage rejected for B1 (would bleed prior context
  into a per-session summary; `mega_digest` bypasses distill anyway).
- **B3 = hard gate + carve-out.** Mouthpiece's `linguist_output_sensor` waits until
  `timeline/episodes/<date>.json` exists, EXCEPT chronicle-skipped shows (excluded/unmatched —
  reuse chronicle's `show_for_date`/`EXCLUDED_DATES`), which proceed ungated (else permanent stall).
  **MUST preserve the backlog-ADOPTION invariant** (the 2026-06-23 paid-replay incident): adopt
  partitions by **transcript** presence; gate **runs** by **episode** presence — separate axes.
- **B1⨉B3 reconciliation:** gating on THIS session's own episode file is a clean "chronicle caught up
  through session N" signal (chronicle processes in date order → N's file existing ⇒ 1..N-1 exist),
  guaranteeing the prior-episode set is complete.

**Verified seams (for the Change B spec):** chronicle output = `EpisodeEntry{date,show,summary:
EpisodeSummary}` at `apps/linguist/timeline/episodes/<date>.json` (`chronicle.py:43-89`); field is
**`key_beats`** not `beats`; **no read-by-date loader exists** (only `load_episode_entries()` loads
all) → add `load_episode_summary(date)` + a recent-prior selector. Mouthpiece reaches linguist's
filesystem via the package-path convention (`linguist_io._LINGUIST_ROOT`), not config — keep that
convention for the gate (lean), don't over-engineer a configured contract.

**faerrin prior art:** Change A = NONE (faerrin `wretch/process_zip` also coupled merge→transcribe
sequentially, zero concurrency) — net-new refinement, not a regression. Change B = PARTIAL — caster's
**running-threads** memory (jokes/grudges mined from past episodes, injected at the SCRIPT stage) is
the portable continuity-injection shape; the Show→Season→Episode chronicle itself is net-new.

**Change A spec = `thoughts/astra/specs/0021-pipeline-scribe-parallel-spec.md`** (4 slices: S1 helper
refactor / S2 four assets + rewire / S3 telemetry spans + cleanup hygiene / S4 deploy + verify
audio∥transcript overlap in SigNoz). Output paths FROZEN. `process_session` removed (no test uses it;
`merge_audio`/`build_transcript` already standalone injectable funcs). Scope doc =
`thoughts/shared/research/2026-06-30-pipeline-reorder-0021-thoughts.md`. Change B spec NOT yet written.

**▶ NEXT:** implement Change A (`octo:embrace`, start S1) OR write the Change B spec first.
Builds on [[chronicle-0019-gotchas]] + [[mouthpiece-glm-debate-switch]] + [[pipeline-live-run-gotchas]]
+ [[config-single-source]] + [[telemetry-built-in]].
