---
name: chronicle-0019-gotchas
description: building the akasha "chronicle" campaign timeline (0019) — GLM-5.2 Show→Season→Episode, the load-bearing gotchas
metadata:
  type: project
---

PROJECT 2026-06-27 **COMPLETE + LIVE**: built **chronicle**, an akasha section
(`akasha.iridi.cc/chronicle`) presenting an **automatically structured Show → Season →
Episode campaign timeline** — GLM-5.2 summarizes each session transcript into a Rich
`EpisodeSummary` and groups each show's episodes into seasons. Scope→spec→implement gates
in `thoughts/shared/research/2026-06-27-akasha-chronicle-0019-thoughts.md` +
`thoughts/astra/specs/0019-chronicle-spec.md`. 7 CI-green slices.

**Architecture (3 layers):**
- **linguist** (`apps/linguist/src/astra_linguist/chronicle.py` models + `chronicle_llm.py`
  GLM logic + assets in `assets.py`): `session_episode_summary` (per-session, sensor-fired,
  `deps=session_transcripts`) writes `timeline/episodes/<date>.json`; `campaign_timeline`
  (aggregate, hourly schedule + skip-when-unchanged via `inputs_hash`) writes
  `timeline/seasons.json`. GLM via `astra_llm.LiteLLMClient.call_structured` on
  `llm.default-model` (GLM-5.2) — **NOT the dspy judge** (that's a lexicon-correction
  classifier; wrong task — see [[linguist-gate-j-dspy-judge]]). Cost auto-traced.
- **akasha-frontend**: `build-content.ts` reads `linguist/timeline/{seasons.json,episodes/}`
  → `src/generated/chronicle.ts`; routes `/chronicle` (shows index, landing) + `/chronicle/$show`;
  `Chronicle.tsx` gothic component; nav link in `PageLayout`. Episodes link to existing
  `Script/<campaign>/<date>` transcript pages (date→href map from `transcripts.docs`).

**THE load-bearing gotchas:**
- **Show = the transcript filename prefix.** Transcripts are `<NNN>.<slug>.<date>.txt`
  (`000.through-a-song-darkly.…`); the slug between prefix and date IS the campaign slug
  (1:1 with `being.kdl` campaigns). `show_for_date` parses it. The 7 shows = the **44
  campaign-matched** sessions; the other 34 `data/*.json` are an OLDER pre-`through-a-song-darkly`
  campaign that matches no current campaign (`match_campaign`→None) — **deliberately excluded**.
- **Season grouping must output BOUNDARIES, not episode lists.** First attempt had GLM echo
  every episode date per season → the 33-episode main show **truncated mid-JSON**
  (`JSONDecodeError: Unterminated string`) and the client doesn't retry parse failures.
  Fix: GLM returns compact `SeasonBoundary{title,arc_summary,start_date}`; `_seasons_from_plan`
  derives a total/ordered/contiguous partition (forces a season at index 0, drops
  invalid/duplicate starts). `group_show_seasons` also retries malformed generations.
- **Non-zero-padded dates** (`2025-8-11`): string sort is WRONG (`10-20` < `8-11`); use
  `date_key` (int tuple) everywhere episodes are ordered.
- **Backfill ran on the HOST** (not the dagster container) — host has SOPS+age so
  `ensure_openrouter_env` resolves; host-owned files are fine (root can overwrite later).
  `apps/linguist/scripts/backfill_chronicle.py` is resumable (skips existing episode files),
  5 workers, ~6 min, ~$2–3 GLM (traced to SigNoz). Re-run only redoes season grouping.
- **Two CI-gate traps when committing generated JSON:**
  1. biome formats JSON too → add `!**/linguist/timeline/**` to `biome.json` includes
     (mirrors the existing `linguist/data/**` exclusion); the linguist-commit timer also
     commits with `--no-verify`.
  2. The **pre-commit gate is repo-wide** (biome over the working tree, not just staged) —
     unformatted *uncommitted* TS in another slice blocks an unrelated commit. Keep the tree
     biome-clean.
- **`src/generated/` is gitignored** (built in-container) but **`routeTree.gen.ts` is COMMITTED**
  — adding routes requires regenerating it via a vite build (`bun run build`; no standalone
  `tsr` binary) and committing it, or CI typecheck fails on the new routes.
- **Deploy = extend the linguist-commit timer** (`justfile` `linguist-commit`): the `git add`
  + the redeploy-trigger grep must include `apps/linguist/timeline` or new chronicle data
  never commits/redeploys akasha ([[pipeline-live-run-gotchas]]). akasha rebuilds content at
  build time → `just up` akasha-frontend; no Caddy/edge change (in-app route, same host).

**Post-launch review follow-ups (same day):**
- **Mislabeled session exclusion:** 2025-8-11 ("The Blue Remains") is a *different
  campaign with the same players* that `match_campaign` false-matched to TSD (the word
  "Argyle" appears 96× — the substring heuristic can't tell). Fix = `EXCLUDED_DATES`
  frozenset in `chronicle.py` (`show_for_date`→None), the episode asset skips
  unmatched/excluded dates, and `build_chronicle` drops episodes whose show isn't a real
  show. The GM curates this set by hand. *(Note: the dagster-code image bakes linguist
  code, so the exclusion only reaches the live pipeline on a `docker compose build
  dagster-code` — fine here since 2025-8-11's partition won't re-materialize.)*
- **The linguist-commit timer auto-commits mid-dev:** while I was editing, the systemd
  timer fired and committed+pushed my regenerated `timeline/` data (deletion + new
  seasons.json) + auto-redeployed akasha with the NEW data but OLD frontend code. So
  after a frontend change you MUST commit the code and redeploy yourself; don't assume
  the timer's redeploy used your latest code. (Working great — it's the S7 wiring — just
  be aware it races you.)
- **Nested episode pages:** show page = compact cards (title + synopsis blurb) →
  `/chronicle/$show/$episode` detail page (beats/entities/cliffhanger/transcript link).
  Routes are a directory: `routes/chronicle/$show/{index,$episode}.tsx`.
- **Graph opt-out:** `PageLayout` gained `graph?: boolean`; chronicle passes `false` and
  the body collapses to two columns via `#quartz-body.no-right`.
- **Explorer nesting:** inject a synthetic subtree into `EXPLORER_TREE` (build-content
  `chronicleTree`); `TreeNode` gained an optional pre-resolved `href` (Explorer uses
  `node.href ?? resolveRelative`) so absolute `/chronicle/...` links coexist with wiki
  nodes. Episode tree slugs nest under their season (`…/s<N>/<date>`) and the episode
  route's loader `slug` matches, so `computeOpen`'s prefix-match auto-opens the current
  episode's folders and highlights the leaf active.

Builds on [[akasha-frontend-0011-gotchas]] + [[config-single-source]] + [[telemetry-built-in]].
