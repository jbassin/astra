---
name: ashen-pact-mouthpiece-grounding
description: Ashen Pact wiki entries + how to force akasha pages into a mouthpiece episode's grounding (the 2026-7-27 re-render recipe)
metadata:
  type: project
---

PROJECT 2026-07-29/30 — six Ashen Pact deity entries shipped to akasha + the 2026-7-27
episode re-rendered with forced wiki grounding. All pushed (`dbce94e` entries ·
`b00b0ee`/`87ccc33` index add/revert · `fa97e9f` snapshot) and live.

**Content state:**
- `Divinity/Ashen Pact/{Regent,Esoterica,War,Giant,Herald,Pyre}.vellum` — verbatim
  stakeholder descriptions, prose-only (no `@deity` block; mechanics unwritten).
- **The index page is deliberately split:** NOT on the akasha site (stakeholder call),
  but baked into the **current dagster-code image**, so mouthpiece grounding matches the
  "Ashen Pact" ref → **the next `just up` silently drops it** from future renders (only
  the six entity names ground after that). Recover the text from `b00b0ee`. Making it
  permanently mouthpiece-only needs a render-only exclusion mechanism (unbuilt — ask first).
- ⚠ Registry side effect: the generic defs entries **War / Giant / Herald / Pyre /
  Regent / Esoterica** merged with the new pages (seed fills null fields), so heartwood
  `resolve()` now links ordinary words like "war"/"giant" to deity pages — a false-link
  source to watch in review cards.
- akasha URL scheme: **spaces → dashes, case preserved** (`/Divinity/Ashen-Pact/Regent`);
  a `%20` URL 404s.

**⭐ THE force-grounding recipe (re-render an episode with wiki pages enrich missed):**
1. `session_script` reads the **persisted** `episodes/<date>/digest.json` (bind-mounted
   same-path) — it does NOT re-run enrich, and `assert_no_drift` checks **line count
   only** — so editing `wiki_refs` on the host sticks.
2. **Prepend** the forced refs: grounding is first-seen order under a 24k-char budget
   (`GROUNDING_BUDGET`, prompts.py), so front position guarantees inclusion. Refs match
   page **title or basename** case-insensitively; folder-index pages match their parent
   folder name ("Ashen Pact" → `…/Ashen Pact/index`). Unmatched refs drop silently.
3. **Dry-run before spending:** `uv run python` with
   `ground_digest(digest, pages_from_corpus(load_corpus()))` on the host prints exactly
   what grounds and the budget math — do this BEFORE the GLM/ElevenLabs spend.
4. The corpus is **image-baked** into dagster-code — a content change needs a rebuild
   WITH SOPS env. Targeted single-service form (when blanket `just up` would deploy
   something unwanted — here the index onto the akasha site): replicate the `up` recipe's
   sops dotenv loop (`sops -d --output-type dotenv deploy/sops/secrets.enc.yaml`, export
   `${k^^}`), then `docker compose up -d --build dagster-code dagster-daemon
   dagster-webserver`.
5. In-container materialize runs from **`/opt/dagster/app`** (`-f definitions.py`) — NOT
   `/repo` (no definitions.py there; the grpc server's own cwd is the model). Script:
   `--select session_script`; audio: `--select session_audio_clips,session_episode`.
   Script ≈ 12 min GLM; audio = real ElevenLabs when `manifest.json` says
   `mode: "dialogue"` (mock fallback = `mode: turns`); 60000 ms clip `duration_ms` are
   normal placeholders (player reads real durations).
6. **`just mouthpiece-publish` commits AND pushes the snapshot itself** (the
   `chore(mouthpiece): auto-publish episode catalog snapshot` commit is the recipe, not
   the timer) — then `just mouthpiece-seed` + rebuild mouthpiece-frontend (snapshot baked
   at build). Stop `linguist-commit.timer` across the whole window (auto-publish race).

Result: "The Quiz, the Maid, and the Ashen Pact" (2026-7-27, 24.3 min) — the hosts
recite all six visual descriptions, which exist ONLY in the wiki pages ("I have to type
up the descriptions" — the GM never spoke them in-session). The edited `digest.json`
(7 forced refs prepended) lives in gitignored pipeline data — a future FROM_SCRATCH
`session_digest` re-run would regenerate it without the forced refs.

Builds on [[mouthpiece-0024-gotchas]] + [[pipeline-reorder-0021]] +
[[heartwood-0020-gotchas]] (the corpus/registry seams) + [[flag-paid-live-actions]].
