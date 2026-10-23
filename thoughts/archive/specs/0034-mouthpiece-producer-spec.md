# 0034 — mouthpiece producer: an RLM that briefs the recap script (spec)

**Status:** BUILT (2026-10-12) — S1–S3 + the experiment run done; ship decision pending — adversarial review folded (2 blockers + 5 majors + 7 minors,
evidence spot-checked, all folded — see §9).
**Scope doc:** `thoughts/shared/research/2026-10-12-mouthpiece-producer-0034-thoughts.md` (D1–D5 stakeholder-resolved).
**Template:** heartwood 0033's RLM machinery (`apps/heartwood-backend/src/astra_heartwood/agent/`) and
mouthpiece's existing two-pass script stage (`script.py`, `prompts.py`, `assets.session_script`).

## 1. Product

One command produces a comparison for one session: `just mouthpiece-experiment 2026-10-5`. A read-only
`dspy.RLM` "producer" reads the session's cleaned transcript and looks things up in the akasha wiki, the
chronicle, earlier same-show transcripts and earlier episode scripts. It returns a structured **brief**. The
brief replaces the fixed wiki excerpts and the continuity block in the Pass A prompt, and the unchanged
two-pass script runs twice: once on GLM 5.3, once on DeepSeek V4.1 Flash. Output lands in a scratch
directory with a metric table against the live script. The stakeholder reads the scripts and decides
whether to ship.

Non-goals: TTS of experiment scripts; any write under `apps/mouthpiece-backend/episodes/`; Dagster wiring
(D4, after the experiment); the RLM editor pass (D5); changes to Pass B or the Pass A system prompt.

## 2. Decisions

Scope decisions D1–D5 carry over verbatim. Build decisions:

- **D34-1 — Lift the RLM core into `astra_llm`.** New `libs/py/llm/src/astra_llm/rlm.py` (NOT imported
  from the package `__init__`, so `import astra_llm` stays light) takes: `LmMeter`, `RunParent`,
  `MeteringMixin`, `MeteredLM`, the hardened RLM base (`HardenedRLM`: parse-error absorption, trajectory
  mirroring, `hit_cap`, budget note), the sandbox helpers (`prepare_sandbox_env`, `deno_available`,
  `make_interpreter`, `sandbox_version`), a scope-keyed `@cache llm_instruments(scope)` creating only the
  `llm.tokens` and `llm.cost_usd` counters, and a scope-parameterized `instrument_tool(fn, parent, scope)`.
  - **Hooks, not module lookups.** `MeteringMixin.forward` calls `self._tracer()` / `self._instruments()`
    and uses `self.span_name` / `self.attr_prefix`; `HardenedRLM` takes `budget_note: Callable[[int, int],
    str]`. heartwood keeps thin subclasses in `astra_heartwood.agent.rlm` (`MeteredLM`, `HeartwoodRLM`)
    whose hooks call heartwood's **own** module-level `tracer()` / `instruments()`, so the existing test
    monkeypatches (`test_heartwood_rlm.py:77-91`, `test_heartwood_run.py:123-132`) keep working.
  - heartwood keeps importable names: `budget_note`, `HeartwoodRLM`, `MeteredLM` (rlm.py) and
    `make_interpreter`, `deno_available`, `prepare_sandbox_env` (run.py — re-exported; the
    `heartwood-sandbox-warm` recipe at `justfile:591` imports `astra_heartwood.agent.run.make_interpreter`).
    heartwood-only instruments (`runs`, `pages`, `tool_calls`) stay in its `telemetry.py`.
  - `astra_llm` already depends on dspy, litellm and astra-observe — no new deps. Rationale: standing
    principle 3 and no `mouthpiece → heartwood-backend` dependency.
- **D34-2 — Package layout.** New sub-package `astra_mouthpiece.producer/`: `tools.py` (§3), `brief.py`
  (`ProducerBrief` schema + markdown renderer, §4.2), `instructions.py` (the signature, §4.1), `run.py`
  (LM construction, invocation, artifacts), `experiment.py` (the comparison, §5), `cli.py`. Script:
  `astra-mouthpiece-producer = "astra_mouthpiece.producer.cli:main"` with subcommands `brief <date>` and
  `experiment <date>`. New test files are named `test_mouthpiece_producer_*.py` (the pytest basename
  collision class, 0020/0033).

- **D34-3 — Config.** New top-level `mouthpiece-producer { }` block in `config.kdl` (the loaders do nest
  child blocks, but a sibling top-level block matches the `mouthpiece-frontend` precedent and keeps
  `MouthpieceConfig` untouched), mirrored in `astra_config.models.MouthpieceProducerConfig` **and** the TS
  Zod schema (top-level `extra=forbid` both sides — the menhir mirror lesson):
  `model "openrouter/deepseek/deepseek-v4.1-flash"`, `sub-model` (same), `max-iterations 30`,
  `max-llm-calls 60`, `max-tokens 64000`, `max-output-chars 10000`,
  `experiment-models "openrouter/z-ai/glm-5.3" "openrouter/deepseek/deepseek-v4.1-flash"`,
  `experiment-max-tokens 128000 64000` (per arm, same order). A one-argument KDL node loads as a scalar
  (`kdl.py:69-74`, `kdl.ts` `leafValue`), so both list fields get a string→list coercion (Pydantic
  `field_validator(mode="before")`, Zod `z.preprocess`) and a test with one value. The script arms read
  `experiment-models`; production keeps reading `mouthpiece.model`.
- **D34-4 — Read-only by construction.** The producer gets no write tool. Tools read the live trees
  (`apps/akasha-backend/content/`, `apps/linguist/transcripts/`, `apps/linguist/timeline/`,
  `apps/mouthpiece-backend/episodes/*/script.json`) directly — no staging copy. The sandbox is dspy's
  default `PythonInterpreter` with no file or network grants (0033 D33-3).

- **D34-5 — Time and show boundary.** Transcript, chronicle and prior-script tools serve only sessions of
  the **same show** (`show_for_date(target).slug`) dated **strictly before** the target, plus the target's
  own cleaned transcript (passed as an input). `EXCLUDED_DATES` honoured. Dates order with
  `chronicle.date_key` (never string sort).
  - **Episode dirs are not uniformly `episodes/<date>/`.** Seven legacy dirs are
    `000.through-a-song-darkly.<date>` (no `session_id`, uppercase `A/B/C` host keys, Pip as C) and one is a
    recap (`…2026-6-8-recap-of-2026-5-7`, on which `date_key` raises). Script tools enumerate via
    `episodes_index.parse_id` / `is_recap` / `_episode_id` (`episodes_index.py:72-88, 325`; make the
    helpers public if needed), skip recaps, take the show from the id slug, and match host keys
    case-insensitively when rendering speaker names.
  - The wiki is current-state and cannot be time-sliced. The run records `wiki_head` (short SHA of the
    last commit touching `apps/akasha-backend/content/`) **at start and at end**, plus a dirty flag
    (`git status --porcelain` on that tree), because the tools read the live tree and a heartwood publish
    could land mid-run. For 2026-10-5 the head is `bad677b5` (that session's own heartwood commit).
- **D34-6 — Inputs are immutable.** dspy re-injects input variables before every code block (0033
  gotcha), so inputs are only immutable values: `target_date`, `show`, `synopsis`, `roster` (the existing
  `build_roster_block` text), and `transcript` (the cleaned transcript rendered `"<line_id>\t<speaker>:
  <text>"`, so the brief can cite line ids).

- **D34-7 — Brief → Pass A seam.** `prompts.build_script_user_content` gains `brief_block: str = ""`.
  When non-empty it **replaces** the continuity section and the WIKI EXCERPTS section; synopsis, roster
  and transcript stay in their current order. When empty the output is **byte-identical** to today (gate
  B). `generate_script` / `build_episode_script` gain a matching pass-through. Pass A still receives the
  transcript with line ids stripped, so the rendered brief anchors moments by a short quote, not line ids.

- **D34-8 — Run outcome.** Same three states as 0033 D33-9: `ok`, `incomplete` (hit the iteration cap and
  the extract fallback produced a valid brief), `failed` (exception, or the extract fallback did not
  validate). An `incomplete` brief is usable; the experiment proceeds and records the status. A `failed`
  producer run stops the experiment before any script call (no script spend without a brief).
- **D34-9 — Telemetry.** Host CLI exports to `telemetry.host-otlp-endpoint` (0033 precedent). Spans:
  `mouthpiece.producer.run` (attrs `date`, `show`, `model`, `sub_model`, `iterations`, `parse_errors`,
  `status`, `cost_usd`, `wiki_head`), `mouthpiece.producer.llm.call` (via `MeteredLM(scope=...)`),
  `mouthpiece.producer.tool` per tool call (the lifted `instrument_tool`), and `mouthpiece.experiment.arm`
  per script arm (attrs `model`, `turns`, `words`, `cost_usd`). Metrics
  `astra.mouthpiece.producer.llm.{tokens,cost_usd}` via `llm_instruments("astra.mouthpiece.producer")`
  (a `@cache` function — the Python pattern; Python OTel's proxy meter makes it safe either way).
  `shutdown()` in `main()`'s `finally` (short-lived-process rule).

- **D34-10 — Script-arm cost and limits.** `LiteLLMClient` prices from a static table (`pricing.py:20-38`)
  that has no DeepSeek row, so the DeepSeek arm would silently cost `0.0`. Add a
  `openrouter/deepseek/deepseek-v4.1-flash` row ($0.30 in / $1.20 out per 1M, per the 0033 scope) and
  have the experiment use a `MeteredClient(LiteLLMClient)` that overrides `_price` to accumulate per-arm
  cost (and records OpenRouter's `response_cost` when present). Per-arm `max_tokens` comes from
  `experiment-max-tokens`. Before the paid run, a free OpenRouter `/models` lookup confirms DeepSeek's
  completion cap and tool-calling support (Pass B is a forced tool call DeepSeek has never made here).

- **D34-11 — Shared cleaned-turns helper.** Extract `cleaned_turns_for(key) -> list[tuple[int, str, str]]`
  out of `assets.session_script` (re-parse canonical transcript → `assert_no_drift` →
  `drop_hallucinations` → `apply_kept_ranges`) into a Dagster-free module (`astra_mouthpiece.session` or a
  new `inputs.py`) that reads the digest **without** `_session_dir`'s `mkdir`. `session_script` calls it,
  so the experiment and production cannot drift; the experiment never imports `assets.py`.

- **D34-12 — Dependency.** Add `astra-ontology-entity` to `apps/mouthpiece-backend/pyproject.toml` (with
  its `uv.sources` entry), the `[project.scripts]` entry, and refresh `uv.lock`. The dagster image already
  copies `ontology/` (`dagster/Dockerfile:45`).

## 3. Tools

All host-side; errors raise `ValueError`; returns are JSON types, never `None`. Docstrings are the agent's
whole contract.

| Tool | Returns |
|---|---|
| `list_pages()` | every wiki page key |
| `read_page(path)` | page text |
| `search_wiki(pattern, regex=False)` | `[{path, line, text}]`, ≤ 200 |
| `backlinks(path)` | page keys linking to `path` |
| `resolve_name(name)` | `{canonical, kind, page, candidates}` from the entity registry |
| `list_episodes()` | prior same-show episodes `[{date, title, synopsis}]`, oldest first (chronicle) |
| `read_episode(date)` | full chronicle entry: synopsis, beats, cliffhanger, season title |
| `search_transcripts(pattern, regex=False)` | `[{date, line, speaker, text}]` over prior same-show transcripts, ≤ 200 |
| `read_transcript(date)` | one prior same-show transcript |
| `search_scripts(pattern, regex=False)` | `[{date, title, speaker, text}]` over prior episode `script.json` turns, ≤ 200 |
| `read_script(date)` | one prior episode's script as `Name: text` lines |

Wiki tools reuse akasha's corpus loader and link resolver (`astra_akasha_backend.corpus`,
`.crossref`); transcript tools reuse `astra_linguist` paths and parsing. Where heartwood's `tools.py`
already implements the logic (search matcher, backlink index, `resolve_name`), move the shared helper into
a place both import (`astra_akasha_backend` for wiki helpers, `astra_ontology_entity` already serves
`resolve`) rather than copying it.

## 4. The agent

### 4.1 Signature and instructions

`ProduceBrief(dspy.Signature)` — inputs per D34-6; one output **`brief: ProducerBrief`** (typed). dspy
validates a submitted dict with `TypeAdapter(...).validate_python` (dspy 3.2.1 `adapters/utils.py:175-176`);
on failure `_process_final_output` (`predict/rlm.py:439-472`) returns a `[Type Error] …` that is appended to
the REPL history (`rlm.py:504-507`), so the agent retries inside the loop for free. No custom retry. (A
`str` output would `str()` a submitted dict into a Python repr, `utils.py:150-151` — rejected.) The
instructions tell the agent to `SUBMIT(brief={...})` with a dict matching the schema.

The docstring instructs, in plain terms:

- You are the producer of a podcast where three hosts recap last night's session. You do not write
  dialogue. You prepare notes the writer will use alongside the full transcript.
- Find the 5–10 moments most worth talking about: emotional peaks, reveals, close calls, funny table
  moments that are in-world, decisions with consequences. For each, say why it matters and how it felt.
- For every proper noun the moments depend on, look it up (`resolve_name`, `search_wiki`, `read_page`) and
  write a 1–3 sentence lore note citing the page. Only what the wiki says; never invent lore. Note when a
  name has no page.
- Look back: search earlier episodes, transcripts and scripts for real callbacks (a promise, a recurring
  NPC, an unresolved mystery, a running joke the hosts already made). Cite the date. Do not invent history.
- List open threads the hosts can speculate about, grounded in what happened.
- Write the questions the newcomer host (game veteran, new to this campaign) would ask.
- Out of scope for notes: rules mechanics, dice, out-of-character talk (the transcript is already cleaned).
- Budget: stop looking things up when the notes are complete; aim to SUBMIT well before the cap.

Budget note (D34-1 parameter): `"[Budget] Step N of M used. Finish your notes and call SUBMIT(brief=...)
within the next K steps."`

### 4.2 `ProducerBrief` schema (`brief.py`)

```python
class Moment(BaseModel):
    title: str
    line_ids: list[int]          # cleaned-transcript line ids (inspection only)
    anchor: str                  # ≤ 20-word quote or paraphrase locating it in the transcript
    why_it_matters: str
    feel: str                    # the emotional read

class LoreNote(BaseModel):
    name: str
    note: str
    page: str | None             # wiki page key; None = no page found

class Callback(BaseModel):
    date: str                    # prior session date
    note: str

class ProducerBrief(BaseModel):
    moments: list[Moment] = Field(min_length=1, max_length=12)
    lore: list[LoreNote]
    callbacks: list[Callback]
    open_threads: list[str]
    newcomer_questions: list[str]
```

Post-run citation check on top of Pydantic: `line_ids` must exist in the cleaned transcript (bad ids
removed; a moment left with none keeps its anchor); `page` must be a real wiki page key (else set to
`None`); callback `date` must be a permitted prior date (else the callback is dropped). Every change is a
recorded warning in `warnings.json` with the drop rate, so a hallucinated citation never reaches Pass A.

`render_brief(brief) -> str` produces the Pass A block. It goes in the **continuity slot** (after the
synopsis, before the roster and transcript, `prompts.py:62-82`) so the hosts read it before walking the
transcript; the wiki slot after the transcript is omitted. The block is headed `PRODUCER NOTES (for grounding and
callbacks; do not read these out; do not reveal undiscovered plot):`, sections in schema order,
line ids omitted.

## 5. Experiment

`astra-mouthpiece-producer experiment <date> [--arm=all|<model-id>] [--reuse-brief=<run-dir>]`, wrapped
by `just mouthpiece-experiment <date> [...]`. The recipe always runs the idempotent sandbox warm-up first
(the heartwood warm recipe's body, importing `astra_llm.rlm.make_interpreter`), and the CLI fails fast if
`deno_available()` is false. The CLI calls `ensure_openrouter_env()` unconditionally at start (the
`--reuse-brief` path never builds a dspy LM, which is where heartwood calls it).

1. Load the digest and cleaned turns via `cleaned_turns_for` (D34-11), the roster and hosts. Read-only.
2. Run the producer (or load `brief.json` from `--reuse-brief`). Write `brief.json`, `brief.md`,
   `trajectory.json`, `warnings.json`.
3. For each model in `experiment-models` (or the one `--arm`): `generate_script(..., brief_block=...,
   model=<arm>, max_tokens=<arm cap>)` with no grounding and no continuity, through the `MeteredClient`
   (D34-10) → `script.<slug>.json`. One arm failing is recorded and does not abort the other.
4. Baseline = the live `episodes/<date>/script.json` (copied in as `script.baseline.json`).
5. Write `report.md`: per script — turns, words, per-host word share, `lint.score_script` criteria —
   side by side; plus producer status, iterations, cost per stage, wiki head.

Output root: `/ruby/data/experiments/astra/artifacts/mouthpiece-experiments/<date>/<run-id>/` (gitignored).
The CLI prints `RUN_DIR=<path>`. It never writes under `episodes/`, never calls TTS, never commits.
Spend is flagged at the point of execution ([[flag-paid-live-actions]]): estimated ≈ $2–3 for both arms.

## 6. Slices

- **S1 — Lift the RLM core (D34-1).** `astra_llm.rlm` + heartwood re-pointed through hook subclasses.
  New `astra_llm` tests cover the lifted pieces with a non-heartwood scope. Gate A.
- **S2 — Producer (D34-2..D34-12, §3, §4).** Capture the gate-B golden from the **pre-change** prompt
  first, in this slice. Config block (py + TS + tests), dependency, `cleaned_turns_for`, pricing row,
  tools, brief schema + citation check + renderer, signature, run, `brief` subcommand, prompt seam. Unit
  tests with a `DummyLM` and a fake interpreter (0033 pattern); tool tests on fixture trees. Re-run
  heartwood's suite (helper moves touch it again). Gates A (re-run), B, C.
- **S3 — Experiment (§5) + the real run.** `experiment` subcommand, justfile recipe, report. Then the paid
  run on 2026-10-5 (flagged), results to the stakeholder. Gates D, E.

Each slice: CI lanes reproduced locally, one Conventional Commit, pushed at the end of S3.

## 7. Acceptance gates

- **A — heartwood unchanged.** heartwood's full test suite green after S1 and after S2; the only test edits
  allowed are import paths and monkeypatch targets. Span name `heartwood.llm.call`, attribute names,
  metric names and the budget-note text asserted by the existing tests stay as they are.
- **B — prompt byte-identity.** `build_script_user_content(..., brief_block="")` equals the pre-change
  output for a fixture (golden test).
- **C — read-only + boundary.** A tool test hashes the whole fixture tree before and after exercising
  every tool and patches `Path.write_text`/`open(..., "w")` to raise. Transcript/episode/script tools
  reject the target date, later dates, other shows, recap dirs and `EXCLUDED_DATES`; legacy
  `000.<slug>.<date>` script dirs are found and rendered with correct host names.
- **D — real producer run.** On 2026-10-5: status `ok` (or `incomplete` with a valid brief); citation drop
  rate ≤ 20% (else report it as a finding, not a pass); ≥ 1 callback and ≥ 5 lore notes with pages; cost
  recorded per stage (producer, each arm, non-zero for DeepSeek); `mouthpiece.producer.run` span visible in
  SigNoz.
- **E — comparison delivered.** Both arm scripts + baseline + `report.md` in the run dir; the stakeholder
  has the path and a short summary. No file under `episodes/` changed (`git status` clean there).

## 7a. What happens after

The stakeholder reads the three scripts. If the brief wins, a follow-up decides D4 (Deno in dagster-code
vs a host step) and the production model, then wires the producer into `session_script`. If not, the
experiment code stays as a tool or is removed — a stakeholder call.

## 9. Adversarial review record (2026-10-12)

One reviewer, verified against the repo; all folded.

- **Blocker — gate A as written could not pass:** heartwood's tests monkeypatch module-level
  `tracer`/`instruments` in `astra_heartwood.agent.rlm`; a straight lift breaks them, and the mixin also
  needs `LmMeter`/`RunParent`/`log`. → D34-1 hook subclasses, scope-keyed instruments, re-exported names,
  gate A reworded.
- **Blocker — `brief: str` + post-run retry:** a `str` output `str()`s a submitted dict; no loop exists
  after `forward` for a retry. → typed `brief: ProducerBrief`, dspy's in-loop `[Type Error]` retry.
- **Major — episode dirs not uniformly date-keyed** (legacy `000.<slug>.<date>`, recap dir, mixed host-key
  case). → D34-5 enumerate via `episodes_index`.
- **Major — DeepSeek arm cost silently $0** (no pricing row; client returns no cost). → D34-10.
- **Major — `--reuse-brief` skips `ensure_openrouter_env()`.** → §5.
- **Major — DeepSeek output cap / forced tool call unverified.** → per-arm `max_tokens`, `/models` check.
- **Major — missing `astra-ontology-entity` dependency.** → D34-12.
- **Minors folded:** D34-3 rationale corrected + scalar→list coercion; brief placement pinned; shared
  `cleaned_turns_for` (D34-11); gate C mechanism + gate D pass bar; wiki head start/end + dirty flag; metric
  name `cost_usd`; sandbox warm always + fail-fast.

## 10. Build record (2026-10-12)

Commits: S1 `d76feccf` (lift RLM core → `astra_llm.rlm`), S2 `b278dc02` (producer + prompt seam),
S3 `a2a298d0` (experiment runner + recipes), `f340693d` (DeepSeek price → current listing).

Gates: **A** heartwood suite green after S1 and S2 with zero test edits · **B** golden byte-identity test
· **C** read-only (tree hash + write-mode guards) and boundary tests; real-Deno scripted run proves a
typed `SUBMIT(brief={...})` incl. an in-loop `[Type Error]` retry · **D** below · **E** run dir delivered,
nothing under `episodes/` touched.

Pre-run check (free OpenRouter `/models`): DeepSeek V4.1 Flash max completion 393,216, `tools` +
`tool_choice` supported; listing price $0.15/$0.60 (row corrected). GLM 5.3 listing is $0.079/$4.80 vs
the table's $1.15/$3.50 — pre-existing drift, left for a separate fix.

**Experiment, 2026-10-5** (`artifacts/mouthpiece-experiments/2026-10-5/20261012T175346Z/`):

- Producer: `ok`, 28/30 iterations, 0 parse errors, 607 s, **$0.196**; 12 moments, 22 lore notes (19 with
  pages), 9 callbacks reaching back to 2026-5-21, 0/144 citations repaired. Wiki head `bad677b5` clean at
  start and end.
- Scripts: GLM 5.3 + brief — 5,181 words, lint 8/10, **$0.22**; DeepSeek + brief — 5,861 words but 464
  short turns, clean-line ratio 0.78 (lint 5/10), **$0.04**; live baseline lint 7/10.
- Brief lore names said: baseline 13/22, GLM 18/22, DeepSeek 17/22.
- ⚠ Finding: the brief erodes the newcomer seat — Nell's turns with a question drop from 31/52 (baseline)
  to 16/50 (GLM); she recites brief lore ("I did my homework"). Fix candidate: tell Pass A the newcomer
  has NOT read the producer notes (heading/prompt wording) — a stakeholder decision.
- Reading: DeepSeek's dialogue is choppy sitcom rhythm; GLM + brief reads closest to the live show with
  better grounding and real long-range callbacks.

**Follow-up, 2026-10-12 (stakeholder: GLM writes the scripts).** `4d5c4e30` adds a newcomer seat guard to the
rendered brief and makes the default experiment one GLM arm. Re-run with the same brief
(`…/2026-10-5/20261012T182801Z/`): Nell's question turns 25/64 (39%) vs 16/50 (32%) without the guard and
31/52 (60%) live; no "homework" recitation; Maeve/Bram now answer her from the notes. Lint 9/10, 19/22 lore
names, 5,188 words, $0.40 (table price).
