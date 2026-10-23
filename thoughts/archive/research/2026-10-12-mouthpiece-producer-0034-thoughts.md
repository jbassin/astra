# mouthpiece producer (0034) — scope

Date: 2026-10-12 · Stage: **Scope** (next: spec via `octo:spec` → `thoughts/astra/specs/0034-mouthpiece-producer-spec.md`)

## Summary

Add an **RLM "producer"** step ahead of mouthpiece's script stage. The producer is a read-only `dspy.RLM`
agent (DeepSeek V4.1 Flash, like heartwood 0033). It reads the session's cleaned transcript, looks things up
in the akasha wiki, the chronicle, earlier transcripts and earlier episode scripts, and writes a structured
**brief**: what is worth talking about, the lore behind it, callbacks to earlier episodes, open theories, and
what the newcomer host would ask.

The brief **replaces** two fixed blocks in the Pass A prompt: the wiki excerpts (`grounding.py`, ≤ 24k chars
matched from `digest.wiki_refs`) and the continuity block (`continuity.py`, the last 6 episodes in full).
Pass A still walks the cleaned transcript in order and stays one long creative call. Pass B is unchanged.

First deliverable is an **experiment, not a production change**: a host CLI that runs the producer and the
two-pass script on one session (2026-10-5), writes everything to a scratch directory, and never touches the
live episode, TTS, or publishing. Shipping is a separate decision made on the result.

Why: grounding today is *pushed* (names the digest happened to list, matched by title) instead of *pulled*
(whatever the session actually needs). The manual force-grounding recipe (Ashen Pact, 2026-07-30) exists
because of this. Continuity is a flat 6-episode dump with no way to reach an older callback. heartwood's
agent showed that DeepSeek Flash can navigate transcript + wiki cheaply ($0.31/session with writes).

## Decisions (stakeholder, 2026-10-12)

| # | Decision | Choice |
|---|---|---|
| D1 | Shape | **Producer RLM + unchanged single-call Pass A.** The RLM never writes dialogue (stitched sub-call output risks the "clean podcast" style the two-pass design exists to avoid). |
| D2 | What the brief replaces | **Wiki excerpts + continuity block.** Synopsis, roster and the cleaned transcript stay in the Pass A prompt. |
| D3 | Experiment arms | **Both:** brief → GLM 5.3 two-pass, and brief → DeepSeek V4.1 Flash two-pass. Baseline = the live 2026-10-5 `script.json` (free). This separates "does the brief help" from "is DeepSeek good at dialogue". |
| D4 | Runtime placement | **Decide after the experiment.** Build the experiment as a host CLI. Choosing between Deno in the dagster-code image and a host step that writes a brief file is a sanctioned deferral to after the comparison. |
| D5 | RLM editor pass (lint-driven revision before TTS) | **Dropped.** Not in scope. |

## Verified facts (checked against the repo, 2026-10-12)

**Script stage today.** `assets.session_script` (`apps/mouthpiece-backend/src/astra_mouthpiece/assets.py:214`)
re-parses the canonical transcript, drops hallucination lines, applies `digest.kept_ranges` → cleaned turns,
loads the akasha corpus → `pages_from_corpus`, builds continuity (`recent_prior_entries(limit=6)` +
`season_for`) and the roster, then calls `build_episode_script` → `script.generate_script`. Pass A =
`call_text` with `build_improv_system_prompt`; Pass B = `call_tool` per ≤ 2,200-word segment;
`DEFAULT_SCRIPT_MAX_TOKENS = 128_000`. Model = config `mouthpiece.model` = `openrouter/z-ai/glm-5.3`.

**Prompt seam.** `prompts.build_script_user_content(digest, cleaned_turns, roster_block, grounding,
continuity_block)` renders: header + synopsis → continuity → roster → transcript → WIKI EXCERPTS. The brief
slots in as one block replacing continuity + wiki. The Pass A system prompt targets 4,500–5,500 words, hard
cap ~6,000.

**2026-10-5 is a good test session.** On disk: `apps/mouthpiece-backend/episodes/2026-10-5/` has
`digest.json` (synopsis + 46 `wiki_refs`), `script.json` ("How to Hold a Person", 136 turns, 6,145 words —
just over the cap), the mp3 and transcript.md. heartwood already ran 2026-10-5 (`bad677b5`), so the wiki
reflects that session and nothing later (no future leakage for this date).

**heartwood's RLM machinery is reusable.** `apps/heartwood-backend/src/astra_heartwood/agent/`:
`rlm.py` (`MeteredLM` — cost from the litellm response; `HeartwoodRLM` — absorbs `AdapterParseError`,
budget note near the cap, trajectory on failure), `run.py` (Deno/`PythonInterpreter` setup with
`DENO_NO_PACKAGE_JSON` + resolved `DENO_DIR`), `telemetry.py`. Read-only tools already exist in
`tools.py`: `list_pages`, `read_page`, `search_wiki`, `backlinks`, `list_sessions`, `read_transcript`,
`search_transcripts`, `resolve_name`. They are bound to a staging `Workspace` and a write `Validator`, which
the producer does not need. Span names are hard-coded `heartwood.*`.

**Other sources the producer can read.** Chronicle: `astra_linguist.chronicle.load_episode_entries`,
`load_episode_summary`, `recent_prior_entries`, `season_for` (`apps/linguist/timeline/`). Earlier scripts:
24 session dirs under `apps/mouthpiece-backend/episodes/*/script.json`, useful for not repeating bits and
for real callbacks to what the hosts said before.

**Infrastructure.** dagster-code image has no Deno or node (`dagster/Dockerfile`), which is why D4 defers.
Deno is on the host (`~/.deno/bin/deno`; `just heartwood-sandbox-warm`). `/artifacts/` is gitignored, so it
is a safe scratch root for experiment output.

## Proposed shape (for the spec to settle)

1. **Lift the RLM core into `libs/py/llm`** (`astra_llm.rlm`): `MeteringMixin`/`MeteredLM`, the hardened
   RLM subclass, and the sandbox setup, with the span/metric prefix as a parameter. heartwood then imports
   it (behaviour and telemetry names unchanged). This follows standing principle 3 (all LLM calls through
   `libs/py/llm`) and avoids mouthpiece depending on heartwood-backend.
2. **Read-only producer tools** in `astra_mouthpiece.producer.tools`: wiki read/search/backlinks over the
   live corpus (no staging copy), transcript list/read/search limited to the same show's sessions dated
   ≤ target (heartwood D6 rule), chronicle episode lookup, prior-script read/search, `resolve_name`.
   Shared helpers move with step 1 or are re-imported from akasha/linguist, not copied.
3. **Brief schema** (`ProducerBrief`, Pydantic): moments worth discussing (each with transcript line refs
   and why it matters), lore notes (each citing a wiki page), callbacks (citing an episode/date), open
   threads to speculate on, newcomer questions. Rendered to a markdown block for Pass A; persisted as
   `brief.json` for inspection.
4. **Prompt change**: `build_script_user_content` takes an optional `brief_block`; when given, it replaces
   the continuity and wiki sections. Without it, the prompt stays byte-identical (forward-only precedent
   from 0021).
5. **Experiment CLI**: `just mouthpiece-experiment <date> [--arm=glm|deepseek|both] [--reuse-brief]`.
   Writes to `/artifacts/mouthpiece-experiments/<date>/<run>/{brief.json, trajectory.json,
   script.<arm>.json, lint.<arm>.txt, cost.json}`. Runs one producer pass shared by both arms. Prints a
   side-by-side `lint.py` metric table against the live baseline. No TTS, no writes under `episodes/`, no
   commit.
6. **Telemetry**: host OTLP endpoint (`telemetry.host-otlp-endpoint`, heartwood precedent); spans
   `mouthpiece.producer.*` with cost/tokens/iterations; existing `mouthpiece.*` script spans.

## Costs and risks

- **Cost**: producer ≈ $0.10–0.40 (read-only; heartwood with writes was $0.31). GLM two-pass ≈ $1–1.5,
  DeepSeek two-pass well under that. Whole experiment **≈ $2–3**. Paid, but nothing live; flagged at run time.
- **Brief quality is the thing under test.** A brief that over-summarizes could flatten Pass A into a
  checklist recap. Mitigation: the brief is framed as producer notes, and the transcript stays in the prompt.
- **Wiki is current-state, not time-sliced.** Fine for the newest session. Re-rendering an old session would
  leak later lore. Out of scope for the experiment; the spec should note it for any re-render use.
- **Run time**: heartwood took ~21 min. A read-only producer should be shorter, but it adds minutes to a
  pipeline step that already runs long.

## Not in scope

- The RLM editor/revision pass (D5).
- Production wiring (Dagster asset, sensor, publish) — waits on D4 and the experiment result.
- Any TTS render of the experiment scripts.
- Changing Pass B or the Pass A system prompt.

## Open questions

None. D4 is a sanctioned deferral, decided after the experiment.
