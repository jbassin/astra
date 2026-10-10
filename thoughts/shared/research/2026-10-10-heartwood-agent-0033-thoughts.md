# heartwood agent (0033) — scope

Date: 2026-10-10 · Stage: **Scope** (next: spec via `octo:spec` → `thoughts/astra/specs/0033-heartwood-agent-spec.md`)

## Summary

Replace heartwood's rigid pipeline (filter → extract facts → resolve → refine → facts-only cards →
human-written bodies → apply) with **one agent per session**: a `dspy.RLM` that reads a target session's
transcript, browses the akasha wiki and earlier transcripts through host-side tools, and edits/creates
wiki pages. Its changes are validated and **auto-published** to akasha. No human review step.

Why: every prior heartwood version disappointed on quality because a fixed stage graph can't reason
across the transcript and the wiki together (see 0020 history in
`thoughts/shared/memory/heartwood-0020-gotchas.md`). An agent that can look things up as it goes is the
stakeholder's bet for fixing that.

## Decisions (stakeholder, 2026-10-10)

| # | Decision | Choice |
|---|---|---|
| D1 | Publish gate | **Auto-publish.** No review surface. Git history is the undo. |
| D2 | Edit scope on existing pages | **Free edits** — the agent may restructure or rewrite any page, including hand-written prose. |
| D3 | Old pipeline | **Retire** extract/filter/refine/proposer/facts and the review surface (see §Retirement). |
| D4 | Trigger | **Manual CLI first** (`uv run astra-heartwood-agent <date>`); Dagster wiring later. |
| D5 | Which sessions | **Chronological backfill** of every faerrin-world session, publishing each, then new sessions going forward. |
| D6 | Background transcripts | **Faerrin world only, dated ≤ the target session.** No future leakage, no other worlds. |
| D7 | Model | **`openrouter/moonshotai/kimi-k3`** for both the main RLM loop and `llm_query` sub-calls. |
| D8 | Guard rails | **Validate every write** (vellum parse in the write tool, error returned to the agent) + **alias lookup tool** (entity registry). Nothing else. Not chosen: a no-delete/no-move rail, abort-on-final-check. |
| D9 | Agent freedom | **Free rein.** Create, edit, move and delete are all first-class tools. The point of the rework is unconstrained updates, so the spec adds no rails beyond D8. |

These reverse two 0020 decisions on purpose: the facts-only rework (human writes every body) and the
preserve-and-append rule (never let the model rewrite human prose). The stakeholder made this call
knowingly. Don't reinstate either without a new decision.

## Verified facts (checked against the repo, 2026-10-10)

**DSPy RLM is available.** `dspy==3.2.1` (already locked) ships `dspy.RLM(signature, max_iterations=20,
max_llm_calls=50, tools=[...], sub_lm=..., interpreter=...)`. The default interpreter is
`PythonInterpreter`: Deno + Pyodide in WASM. Deno is installed at `~/.deno/bin/deno`. Model code runs
inside the sandbox. **User tools are host-side Python callables** the sandbox calls through a bridge, so
the wiki and transcripts don't need to be mounted. They're exposed as tools. Built-ins: `llm_query`,
`llm_query_batched`, `SUBMIT`, `print`. The class is marked `@experimental`.

**Wiki corpus.** 129 `.vellum` pages, 828 KB, under `apps/akasha-backend/content/` (folders Bestiary,
Divinity, Geography, Org, Phenomena, Rules + `Timeline.vellum`, `index.vellum`). Format = YAML frontmatter
(`date`, `tags`) + vellum body (markdown + VSS brace constructs). The whole wiki fits comfortably in
context. Kimi K3 has a 1M-token window.

**Transcripts.** 57 raw `.txt` in `apps/linguist/transcripts/` (`<NNN>.<campaign-slug>.<date>.txt`, about 200 KB
each) + 111 corrected `apps/linguist/data/<date>.json`. `astra_heartwood.sessions.ingestible_dates()` keeps
**53 faerrin-world sessions**: through-a-song-darkly 45, a-hunt-of-metal-and-vine 3, fae-and-forest 3,
the-first-spark 1, interred-in-iomenei 1. ⚠ It **string-sorts** dates (returns `2025-10-20` first). The
backfill must order with an int-tuple `date_key` (chronicle precedent). The real first session is 2025-8-28.

**Publish path exists.** `just heartwood-apply <date>` already does: write pages → `validate-corpus.ts`
(node, `--dir`) → `uv run akasha-snapshot` → path-scoped commit + fetch/rebase + push → `docker compose
up -d --build akasha-frontend`. The new flow reuses everything after "write pages". The manifest/review.kdl
reading in `apply.py` goes away.

**Model.** `moonshotai/kimi-k3` is on OpenRouter: 1,048,576-token context, $0.50/M input, $13.50/M output,
supports `reasoning`/`reasoning_effort`/`max_tokens`. Routed through litellm as `openrouter/moonshotai/kimi-k3`.
`OPENROUTER_API_KEY` is already in SOPS and resolved by `astra_llm.ensure_openrouter_env()`.

**Alias registry.** `ontology/ontology-entity/entity.kdl` (311 entities) via `astra_ontology.resolve()`. Only
heartwood used it; it survives the retirement as the backing store for the agent's `resolve_name` tool.

## Proposed shape (for the spec to settle)

New module in `apps/heartwood-backend` (keep the package; replace its internals):

- **Staging copy.** Each run copies `content/` to a scratch dir. Tools read and write the copy. Publishing =
  sync the copy back into `content/`, then the existing validate → snapshot → commit → redeploy tail.
- **Tools** (host-side, passed to `dspy.RLM(tools=...)`):
  - wiki: `list_pages()`, `read_page(path)`, `search_wiki(pattern)`, `write_page(path, text)` (creates or
    overwrites; runs the vellum validator on that file and returns errors instead of writing),
    `move_page(src, dst)`, `delete_page(path)` (first-class per D9).
  - transcripts: `list_sessions()` (D6-filtered), `read_transcript(date)`, `search_transcripts(pattern)`.
    The target transcript is also passed as an input variable.
  - `resolve_name(name)` → canonical name, kind and page, from the entity registry.
- **Signature** (sketch): `target_date, transcript, wiki_index -> changelog`. The changelog becomes the
  commit body and a run summary.
- **CLI:** `astra-heartwood-agent <date> [--dry-run]` (dry run = stage only, print a diff, publish nothing) and
  `astra-heartwood-agent backfill [--from <date>]` (chronological, one commit per session, resumable).
- **Telemetry:** one span per run, a child span per RLM iteration and per tool call; counters for pages
  created/edited/moved/deleted, validation rejections, tokens and cost. Must call `init_telemetry` in the CLI
  (short-lived process → `shutdown()` in `finally`, per the telemetry-coverage memory).
- **Config:** a new `heartwood { model "openrouter/moonshotai/kimi-k3" … }` block in config.kdl + both
  schema mirrors (config-single-source). RLM limits (`max-iterations`, `max-llm-calls`) live there too.

## Risks to carry into the spec

1. **Backfill vs. a wiki that's already current (D5).** The wiki reflects the present. Replaying a 2025
   session against it can regress current facts to old ones (someone "alive" who has since died). D6 stops
   *transcript* leakage but not this. Mitigation for the spec: the instructions say the wiki may be ahead
   of the session, and the agent only adds what's missing and doesn't overwrite later-dated state with
   earlier facts. This is a prompt control only. Watch the first backfill diffs closely.
2. **Free edits to hand-written prose (D2).** 0020 measured voice flattening when a model rewrote pages
   (3/12 lost POV, 9/12 shrank). Nothing structural prevents it now. Per-session commits make each run
   individually revertible.
3. **Moves and deletes can orphan crossrefs (D9).** The vellum validator checks syntax only, so a moved or
   deleted page can leave dangling links. This is not a rail. Proposal: `move_page`/`delete_page` return
   the list of pages that link to the target, so the agent can fix them in the same run, and the run
   summary lists any crossrefs still broken.
4. **Cost.** Rough guess before measurement: about $2–5 per session (output-heavy: $13.50/M plus reasoning
   tokens) → roughly $100–250 for the 53-session backfill. The first dry run must measure the real figure
   before the backfill starts. Kimi reasoning tokens probably share `max_tokens` the way GLM's did (memory:
   GLM truncation at 16k), so set generous ceilings.
5. **`dspy.RLM` is experimental.** Pin behavior with a stub-LM unit test for the tool bridge. Interface
   drift on a dspy bump is likely.
6. **Concurrency with the linguist-commit timer.** The publish commits race the auto-commit timer (bitten
   ×4 before). The backfill loop should stop the timer for its duration, or use the existing
   path-scoped commit + rebase and accept that.

## Retirement (D3)

Delete: `extract.py`, `filter.py`, `refine.py`, `resolve_facts.py`, `prompts.py`, `review.py`, `proposer/`,
`facts/`, `proposals/`, the Dagster heartwood assets + their `definitions.py` entries, the
`astra-heartwood-{extract,propose}` scripts, the review-specific parts of `apply.py`.

Also retire the review site, because D1 leaves it with no job: `apps/heartwood-frontend`, the `heartwood`
compose service, its `sites.caddyfile` stanza (`heartwood.iridi.cc`), its config block + schema mirrors,
the Dockerfile manifest ripple, and its uv/pnpm workspace entries. ⚠ This is a live-site removal. Flag it
at execution time.

## Open questions

None blocking the spec. The spec settles the exact tool signatures, the instructions text, and the
iteration and call limits.
