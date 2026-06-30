---
name: pipeline-reorder-0021
description: PROJECT 2026-06-30 — the 0021 pipeline-reorder work; Change A (scribe parallel-split) BUILT + DEPLOYED + LIVE-VERIFIED; Change B (chronicle→mouthpiece context) scoped, spec not yet written
metadata:
  type: project
---

PROJECT (2026-06-30): reorder the data pipeline to **craig → (transcribe ∥ merge audio) → chronicle →
mouthpiece**, with chronicle output feeding mouthpiece. Compared against the real Dagster graph
(sub-agent-verified, file:line) → **two independent changes**. **Change A = BUILT + DEPLOYED +
LIVE-VERIFIED. Change B = scoped + locked decisions; spec NOT yet written.**

## ⭐ CHANGE A (parallelize scribe) — BUILT + DEPLOYED + LIVE-VERIFIED (commit `6dc4a63`)
Split scribe's sequential `session_outputs` → four assets: `session_tracks` (root: verify+extract+
roster-filter → persist tracks to `cfg.tmp_path/<date>/tracks/`) → `session_audio` ∥
`session_transcript` (both `deps=session_tracks`) → `session_cleanup` (fan-in `deps=[audio,transcript]`,
rm-rf). New pure `extract_session_tracks` (atomic `.partial`→`os.replace`); `process_session` removed.
Spans `scribe.{extract,merge,transcribe,cleanup}`; `astra.scribe.sessions` counter +1 on transcript only.
Output paths `saved/<date>/{audio.mp3,script.json}` FROZEN → linguist sensor + akasha-seed untouched; no
schema/config.kdl change (`tmp_path` was already configured-but-unused). 4 files, 19 scribe tests green.
Deployed via `just up` (rebuilds the image-baked dagster code); live-verified by a synthetic run.

**⚠️ COMMIT-MESSAGE MISHAP (the load-bearing gotcha of this session):** the **linguist-commit `--user`
systemd timer** (`systemctl --user`, fires ~15 min — a HOST timer, distinct from the Dagster
`scribe_output_sensor`) does `git add -A && git commit && git push`. It **raced my `git commit`**: it
swept my staged scribe files into ITS commit `6dc4a63 "chore(linguist): auto-commit…"` **and pushed it**
before I could `--amend`. My amended sibling (correct message) then couldn't push (behind origin). The
tree hash was identical → I `reset --hard origin/main` and **accepted the mislabeled commit** rather than
force-push (NEVER force-push pushed history — same rule as [[heartwood-0020-gotchas]]). **So Change A's
code is correct + live, but its commit is mislabeled as a linguist auto-commit.** **Mitigation for any
manual git/deploy work: `systemctl --user stop linguist-commit.timer` first, `start` after** (I did this
for the S4 deploy). The timer is a `--user` unit (`~/.config/systemd/user/linguist-commit.{service,timer}`)
→ stop/start needs no root.

**LIVE-VERIFY RECIPE (cheap synthetic smoke, fully torn down):** drop a synthetic Craig zip in
`apps/scribe/incoming/` → the running `craig_drop_sensor` (30s) auto-registers the partition + launches a
multiprocess run. Build the fixture IN the dagster-code container (`zip` is NOT installed there → use
python `zipfile`; ffmpeg IS there): two ~6s `sine` `.aac` named `<idx>-<real-alias>.aac` (real player
aliases from being, e.g. `miked6187`/`nnaiman`) + one bot track (`3-craigbot.aac`) to prove the roster
filter (3 tracks → 2 kept). Name the zip so `naming.session_date` parses a throwaway date, e.g.
`craig_SMOKETEST_2099-1-1_00-00-00.aac.zip`. **Proving the overlap in SigNoz:** each asset runs in its
OWN multiprocess step → SEPARATE `traceID`s (no single nested parent trace); confirm parallelism by
comparing span **timestamps** — `scribe.transcribe` started (55.4196s) BEFORE `scribe.merge` ended
(55.4399s) ⇒ concurrent. `service.name=astra.pipeline`. Verified: 4 spans, tracks=2, audio.mp3+script.json
at frozen paths host-owned, `tmp/<date>` gone, counter once, B1–B5 all hold. C8 confirmed (re-run a tail
by materializing `session_tracks`, since cleanup deletes the tracks).

**SMOKE TRIPS DOWNSTREAM → clean up everything:** the new `script.json` makes linguist's **Dagster**
`scribe_output_sensor` fire → a linguist run for the fake partition (it fails on the garbage tone
transcript). Teardown = rm the fixture zip + `saved/<date>` + `apps/linguist/data/<date>.json`, then
`inst.delete_dynamic_partition("scribe_sessions"|"linguist_sessions", date)` + `inst.delete_run(id)` for
both runs (via `dagster-daemon python`). **Also noted:** the `2026-6-27` incoming zip is a degenerate
recording (`info.txt`+`raw.dat`, NO `.aac`) → would fail `session_audio` on zero tracks if reprocessed.

## CHANGE B (chronicle → mouthpiece context + ordering gate) — SPECCED (`0021-pipeline-chronicle-context-spec.md`)
Spec written 2026-06-30; seams re-verified against live code (file:line). **Stakeholder decisions
(2026-06-30):** N = **3 most-recent prior episodes**, **same show only** (`EpisodeEntry.show`), **+
best-effort season/arc** from `seasons.json` (omitted when the hourly aggregate hasn't placed the date —
never gated on); inject at the **script stage**; **keep the package-path convention** (import
`astra_linguist.chronicle` directly — no new config field). **THE load-bearing gate design (the subtle
part):** the gate moves **partition-registration to `ready` sessions only** in the sensor's normal
branch (NOT all `found`) — if a gate-closed session were adopted as a partition, `new_sessions` would
never surface it again so it could never run after its episode lands. Leaving it un-partitioned keeps it
"found"/re-checked each eval → it partitions+runs in the SAME eval it becomes ready (discovery==partition
==run preserved for ready sessions). **First-eval `cursor is None` adoption still adopts the WHOLE
transcript backlog with no runs** (the 2026-06-23 paid-replay guard). Carve-out = `show_for_date(date) is
None` (excluded/unmatched) runs ungated. New linguist selectors `load_episode_summary`/
`recent_prior_entries`/`season_for` (chronicle.py); new mouthpiece `continuity.py` (mirror `threads.py`)
+ `continuity_block: str = ""` threaded through `build_episode_script`→`generate_script`→
`build_script_user_content` (byte-identical prompt when `""`); own `CONTINUITY_BUDGET` separate from
`GROUNDING_BUDGET=24_000`. Chronicle's `session_episode_summary` is `deps=session_transcripts` → episode
N lands in the SAME linguist run as N's transcript, so the gate usually only absorbs an in-run write-order
race (~30s worst case). Forward-only. 4 slices (S1 linguist selectors / S2 continuity block + script
plumbing + asset wiring / S3 gated sensor + carve-out / S4 deploy + re-render verify). **▶ implement.**

**▶ NEXT for 0021: implement Change B** (`octo:embrace` against the spec, start S1). The planning facts
for both changes follow.

---

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

**Change A spec = `thoughts/astra/specs/0021-pipeline-scribe-parallel-spec.md` — BUILT (all 4 slices,
`6dc4a63`).** **Change B spec = `thoughts/astra/specs/0021-pipeline-chronicle-context-spec.md` — WRITTEN
(ready to implement).** Scope doc = `thoughts/shared/research/2026-06-30-pipeline-reorder-0021-thoughts.md`.

**▶ NEXT:** implement Change B (`octo:embrace` against the spec, start S1 = linguist selectors).
Builds on [[chronicle-0019-gotchas]] + [[mouthpiece-glm-debate-switch]] + [[pipeline-live-run-gotchas]]
+ [[config-single-source]] + [[telemetry-built-in]] + [[heartwood-0020-gotchas]] (the never-force-push rule).
