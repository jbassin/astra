# NLSpec 0006 — linguist (transcript processing)

**Status:** **implemented + verified** (gates A–K; **J live-compiled 2026-06-20**). Built in 3 slices,
all green (py ruff/format/ty/**20 linguist tests**; biome). The deterministic pipeline reproduces faerrin
**byte-for-byte** — both the `formatted_transcript` (vs `data/2024-10-15.json`) AND a full real-session
`data.json → match → context → canonical` round-trip vs the committed 234 KB `transcripts/*.txt`. The
surfacer (phonetic ensemble + Mode-1 filter + judge guardrails/escalation) is stub-tested; the 76
historical sessions are committed + pre-satisfied. Live dspy judge + optimizer (J) deferred. **Phase:** 3
(pipeline). **Source plan:**
[`../plans/0006-linguist.md`](../plans/0006-linguist.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-19-linguist-0006-thoughts.md`](../../shared/research/2026-06-19-linguist-0006-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (python-pro, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** `0005` scribe (input), Phase 1 (ontology-being, `libs/py/{llm,config,observe}`). **Blocks:**
`0008` mouthpiece-backend, `0011` akasha-frontend. The largest subsystem (faerrin `content/scripts`).

## Goal

Port faerrin's `content/scripts` into astra **linguist** — fix transcription errors + emit downstream
formats — as **Python Dagster assets** (per-session partitions). linguist owns *processing*; it does
**NOT** generate wiki pages, auto-link, or render transcripts (akasha-frontend, D4).

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| D4 | Transcript rendering | akasha-frontend renders; linguist emits **structured data** only. |
| F3 | Historical entry | enter at the **canonical/linguist** level, **pre-satisfied** (not re-run). |
| G1 | Review UX | **batch** — dspy emits a reviewable suggestions file; apply via CLI/PR. |
| G2 | Judge | **dspy** (optimizable; guardrails + escalation kept verbatim). |
| G3 | campaigns/roster | **ontology-being** (META); the session→campaign matching *logic* stays in linguist. |
| G4 | `defs.yaml` | **stays YAML** (machine-appended regex list). |
| H1 | Session scope | **deterministic pipeline + surfacer machinery now; live dspy judge + optimizer deferred**; built in slices. |
| H2 | Historical | **commit all ~75 MB** under `apps/linguist/{data,transcripts}/`; pre-satisfy those partitions. |
| H3 | Phonetic lib | **rapidfuzz + double-metaphone + hand-Dice** at faerrin's 0.3/0.3/0.3/0.1 weights. |

## Scope (in)

- **`apps/linguist`** (uv app): Dagster per-session partitioned assets; OTel; config; speakers + campaigns
  from ontology-being; lifts `defs.yaml` (G4).
- **`formatted_transcript`** (← scribe `script.json`): the ingest transform — `replace(text)` (`defs.yaml`
  corrections), `resolveSpeaker(user)` → `{name, color=--text{Name}/--textGuest}`, `start`→`HH:MM:SS`,
  `second`, `duration=round(end-start,3)` → `Transcript {date, audio, script: FormattedLine[]}`; tag the
  session's campaign (keyword-score against ontology-being campaign/role descriptions).
- **`mouthpiece_context`** (← formatted): `{context}\n---\n{billing}\n---\nScript:\n` + `> {billedName}:
  {text}  ` lines per session, + `shibboleth.json` (from campaigns). For 0008.
- **`canonical_transcript`** (← context): drop the header (to the first `> ` line), strip `> `, emit
  `{NNNNNN}\t{text}` (6-digit zero-padded counter; empty lines → blank-numbered). For 0008 + 0011.
- **`correction_candidates`** (surfacer): the **phonetic filter** (ensemble, pure) pre-flags OOV spans →
  the **dspy judge** (Signature: transcript window + lexicon + flagged spans → `[{lineRef, span, verdict
  ∈ confirm|new|reject, suggestedCanonical?, confidence, reason}]`) + **haiku→sonnet escalation** on
  borderline confirms + **deterministic guardrails** (verbatim) → a reviewable suggestions file (G1).
- **Historical (F3/H2)**: commit the 76 `data/*.json` + 42 `transcripts/*.txt` under `apps/linguist/`;
  a mechanism to pre-satisfy those partitions (mark materialized from the committed outputs, no re-run).
- **`audio`**: stays an external `static-audio` URL (F4) — linguist just carries the link.

## Scope (out)

- **Wiki `Script/` page generation**, the `:::transcript-line`/`::transcript-audio` directives,
  **auto-linking** `[[wikilinks]]`, transcript **rendering** + the interactive player → **akasha-frontend** (D4).
- **The live dspy judge runs + optimizer** (`BootstrapFewShot`/`MIPROv2`) → **deferred** (H1); CI/tests use
  a **stubbed `CompleteFn`** (no LLM/network).
- **Re-running ingest/correction over history** (F3) — historical outputs imported verbatim.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| P1 | Output contracts | `Transcript`/`FormattedLine` Pydantic models byte-match faerrin's `data/{date}.json` (`user.color` is the CSS-var **name** `--text{Name}`, not rgb — gothic owns the value). Parity-tested. |
| P2 | Corrections | port `loadCorrections` → a named-group alternation regex over `defs.yaml` (`\b{val}\b`, case-insensitive, first-group-wins → key, `.trim()`); parity-test the replacer on real lines. |
| P3 | Speaker resolve | from ontology-being `Player.aliases`→`Player.name`; color `--text{Name}` for known, `--textGuest` for unknown (G3). |
| P4 | Campaign match | port `campaigns.ts` logic (keyword-scored match + billing + context + shibboleth) reading ontology-being campaigns/roles; the *data* is ontology-being, the *logic* is linguist. |
| P5 | Canonical format | port `build-transcripts.ts` verbatim (header drop, `> ` strip, `NNNNNN\t…`, blank-numbered empties); parity-test against a `transcripts/*.txt`. |
| P6 | Phonetic filter | the 4-signal ensemble (H3) over a pre-folded lexicon; **pure** (no LLM); recall-tested on the lexicon set. |
| P7 | dspy judge | a dspy `Signature` + module behind the `CompleteFn` seam; **guardrails + haiku→sonnet escalation ported verbatim** (deterministic safety, not LLM behavior); stub seam for tests. |
| P8 | Historical import | committed under `apps/linguist/{data,transcripts}/`; **excluded from biome** (large canonical artifacts); the pre-satisfy mechanism reads them. ruff/ty/pytest ignore non-`.py`. |
| P9 | Slices | **1** deterministic pipeline (parity) → **2** surfacer (filter + stubbed judge) → **3** historical import. Each a committed, green increment. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | `apps/linguist` scaffolded; uv + py CI lanes green (ruff/format/ty/pytest) | run locally |
| B | `formatted_transcript` **byte-parity** with faerrin `data/{date}.json` given the same raw `script.json` | parity test |
| C | `defs.yaml` correction replacer matches faerrin's output on real lines | parity test |
| D | `resolveSpeaker` resolves aliases → name/color from ontology-being; guests fall back | unit test |
| E | `canonical_transcript` **byte-parity** with a faerrin `transcripts/*.txt` from the same context input | parity test |
| F | `mouthpiece_context` + shibboleth reproduce faerrin's format; campaign match tags the right campaign | parity/unit test |
| G | phonetic filter ensemble flags known OOV mistranscriptions on the lexicon set (recall) | unit test |
| H | dspy judge: Signature + guardrails + escalation; **confirm/new/reject + guardrails reproduce faerrin** on a fixture set with a stubbed LM | unit test |
| I | Historical 76 sessions present as committed canonical outputs + pre-satisfied partitions (no re-run) | files + mechanism test |
| J | **implemented (2026-06-20)** live dspy judge + MIPROv2 optimizer; committed `judge.compiled.json`; held-out confirm P=0.915, restraint 0.946; metric 58.3→69.4 (see [`0006-linguist-gate-J-spec.md`](./0006-linguist-gate-J-spec.md)) | live compile + eval |
| K | No wiki-page/render code in linguist; speakers + campaigns from ontology-being | review |

## Risks

1. **Parity** — the ingest transform + canonical format are byte-contracts downstream relies on; parity-test against real faerrin outputs (B/C/E/F).
2. **dspy behavior drift** (G2) — guardrails + escalation are load-bearing *deterministic* safety; port them as code, not LLM behavior; validate confirm/new/reject on a fixture set (H).
3. **Groq-vs-whisperx output shift** — new scribe (Groq) output may differ in casing/punctuation from the corpus `defs.yaml` was tuned to; a re-tune pass on first new sessions (the deferred live judge, J).
4. **Phonetic-lib parity** — Python rapidfuzz/double-metaphone ≠ the TS impl exactly; the filter only **pre-flags** (the judge decides), so small differences are tolerable; test recall (G).
5. **Repo size** — +75 MB historical corpus; excluded from biome (P8); accept the growth (H2).

## Hand-off

- **→ 0008 mouthpiece-backend:** consumes `mouthpiece_context` + `canonical_transcript`.
- **→ 0011 akasha-frontend:** consumes the structured transcript data; renders `Script/` pages, auto-links
  against the akasha corpus, runs the interactive player (the `export`-step work that moved out, D4).
- **Deferred (J):** the live dspy judge + optimizer tuning, run when first new (Groq) sessions arrive.
