# 0006 linguist — pre-implementation thoughts

**Date:** 2026-06-19. **Author:** Claude. **Status:** analysis → awaiting fork confirmation before NLSpec.
**Plan:** [`thoughts/astra/plans/0006-linguist.md`](../../astra/plans/0006-linguist.md). **Depends-on:**
`0005` scribe (input), Phase 1 (ontology-being, `libs/py/{llm,config,observe}`). **Blocks:** `0008`
mouthpiece-backend, `0011` akasha-frontend. The **largest** subsystem so far (~2.8k LOC of faerrin
`content/scripts` + a 781-line `defs.yaml`).

## What 0006 is

Port faerrin's `content/scripts` into astra **linguist** — fix transcription errors + emit the formats
downstream needs — as **Python Dagster assets**, per-session partitions. It owns *processing*; it does
**NOT** generate wiki pages, auto-link, or render transcripts (that's akasha-frontend, D4).

## Two halves

**A. The deterministic pipeline (parity-critical, fully testable):**
1. `formatted_transcript` (← scribe `script.json`): the ingest transform — `replace(text)` (`defs.yaml`
   regex corrections), `resolveSpeaker(user)` → `{name,color}`, `start`→`HH:MM:SS`, `second`, `duration`
   → `Transcript {date, audio, script: FormattedLine[]}`. + tag the session's **campaign**.
2. `mouthpiece_context` (← formatted): match campaign → `{context header}\n---\n{billing}\n---\nScript:\n`
   + `> {billedName}: {text}  ` lines; + `shibboleth.json` (from campaigns). Consumed by 0008.
3. `canonical_transcript` (← context): drop the header (up to the first `> ` line), strip `> `, emit
   `{NNNNNN}\t{text}` (6-digit zero-padded; blank-numbered empty lines). Consumed by 0008 + 0011.

**B. The LLM correction surfacer:**
4. `correction_candidates`: a **phonetic filter** (Phase 1, pure) pre-flags OOV spans; a **dspy judge**
   (Phase 2) classifies each `confirm|new|reject` with a suggested canonical; **haiku→sonnet escalation**
   on borderline confirms; **deterministic guardrails** drop unsafe results → a reviewable suggestions
   file that appends to `defs.yaml` (G1 batch).

## Source map (faerrin `pkg/content/scripts`)

| faerrin | astra |
|---|---|
| `lib/types.ts` (RawLine/Speaker/FormattedLine/Transcript) | Pydantic models |
| `pipeline/ingest.ts` transform | `formatted_transcript` (parity vs `data/2024-10-15.json`) |
| `lib/corrections.ts` (defs.yaml → named-group alternation regex) | port to Python `re` (parity-critical) |
| `lib/roster.ts` (alias→name, name→`--text{Name}`, guest) | **from ontology-being** `Player.aliases/name` (G3) |
| `lib/campaigns.ts` (matchCampaign/makeBilling/makeContext/shibboleth, 175 LOC) | port the **logic**; campaign DATA from ontology-being |
| `pipeline/script.ts` | `mouthpiece_context` |
| `build-transcripts.ts` | `canonical_transcript` (parity vs `transcripts/*.txt`) |
| `lib/phonetics.ts` (ensemble) + `lexicon.ts` + `normalize.ts` | phonetic filter (rapidfuzz + double-metaphone + dice) |
| `surface/judge.ts` + `lib/llm.ts` | dspy Signature + module + guardrails (verbatim) |

**Key contracts grounded:** the ingest transform + the `data/{date}.json` shape (see the small
`2024-10-15.json` fixture: `user.color` is a CSS-var name `--textJosh`, NOT rgb — gothic owns the value);
the canonical `NNNNNN\t…` format; `resolveSpeaker` (alias→name→`--text{Name}`/`--textGuest`). ontology-being
already has campaigns (7) + roles (`{player, character, character_class, descriptions}`) — G3 satisfied.

## Decided already (plan §7): G1 batch review · G2 dspy judge (optimizable) · G3 campaigns/roster ←
ontology-being (matching logic in linguist) · G4 `defs.yaml` stays YAML.

## Forks — DECIDED (2026-06-19, with Josh)

- **H1 → deterministic pipeline + surfacer machinery now; DEFER the live dspy judge + optimizer.** Built
  in **slices** (pipeline → surfacer → historical).
- **H2 → commit ALL ~75 MB** of the historical corpus into astra now (76 `data/*.json` + 42
  `transcripts/*.txt`), under `apps/linguist/{data,transcripts}/`; pre-satisfy those partitions. Exclude
  the data/transcript dirs from biome (large generated/canonical artifacts, like the akasha snapshot).
- **H3 → rapidfuzz + double-metaphone + hand-Dice** at the faerrin weights (0.3/0.3/0.3/0.1).

## Genuine forks to confirm (these change the work)

### H1 — Scope this session (the subsystem is big + the surfacer needs an LLM)
The deterministic pipeline (A1–A3) is fully buildable + **byte-parity testable** against faerrin fixtures
now. The surfacer's **phonetic filter + guardrails** are pure/deterministic (testable), but the **dspy
judge's live behavior** needs litellm→Claude + a gold set for the optimizer — not reproducible in CI.
- **(a) Deterministic pipeline + surfacer machinery now; DEFER the live judge + optimizer.** Build A1–A3
  fully (parity-tested), the phonetic filter (pure), the dspy Signature + guardrails (verbatim) with a
  **stubbed LM** (the `CompleteFn` seam → a dspy boundary), and the review-file emit. Defer live judge
  runs + `BootstrapFewShot`/`MIPROv2` tuning to a one-command follow-up (like scribe's live run).
- **(b) Also run the live judge now** — you OK Claude spend + I exercise the judge on a fixture window.
**Lean (a).** Given the subsystem's size I'll also build it in **slices** (deterministic pipeline first,
then the surfacer) — confirm that's the right cut.

### H2 — Historical import (F3): the corpus is ~75 MB
F3 says the 76 historical sessions enter at the canonical/linguist level, pre-satisfied (not re-run). The
historical outputs are **large**: `data/*.json` = 76 files, **65 MB**; `transcripts/*.txt` = 42 files,
**9.4 MB**. Committing all of it grows the astra repo by ~75 MB.
- **(a) Build the pre-satisfy *mechanism* + import a small sample now; DEFER the 75 MB bulk** to a dedicated
  import at/near cutover (or keep it external). The mechanism (mark historical partitions materialized
  from existing canonical outputs) + a fixture proves it; the bulk move is a data op, not code.
- **(b) Commit only the 9.4 MB `transcripts/*.txt`** (the line-numbered canonical) now; defer the 65 MB
  `data/*.json` (regenerable structured form).
- **(c) Commit all ~75 MB now.**
**Lean (a)** — keep the repo lean; the bulk historical move is a cutover data task, separable from the
linguist code. Confirm, since it sets repo size + what "done" means for F3 here.

### H3 — Phonetic lib (I'll decide unless you object)
faerrin's ensemble = Damerau 0.3 / Jaro-Winkler 0.3 / double-metaphone-code edit 0.3 / Dice 0.1. Python:
**rapidfuzz** (Damerau, Jaro-Winkler) + **`metaphone`/doublemetaphone** + a hand bigram-Dice, same weights.
The filter only **pre-flags** (the judge decides), so small phonetic-lib differences are tolerable (Risk 4);
test recall on the lexicon set. Not a fork — noting the dep choice.

## Proposed work breakdown (post-confirm) — built in slices
**Slice 1 (deterministic pipeline):** scaffold `apps/linguist`; models; corrections (defs.yaml port,
parity); resolveSpeaker (ontology-being); the ingest transform → `formatted_transcript` (parity vs
`2024-10-15.json`); campaign match/billing/context → `mouthpiece_context` + shibboleth; canonical →
`canonical_transcript` (parity vs a `transcripts/*.txt`); Dagster assets + partition; lift `defs.yaml`.
**Slice 2 (surfacer):** phonetic filter (ensemble, pure) + lexicon/normalize; the dspy judge Signature +
module + haiku→sonnet escalation + guardrails (verbatim) with a stub seam; the review-file emit →
`correction_candidates`. Defer the live judge + optimizer (H1a).
**Slice 3 (F3):** the pre-satisfy mechanism + sample (per H2).

## CI / deps notes
- New uv member `apps/linguist` → py lane auto-covered. New deps: `rapidfuzz`, a double-metaphone lib,
  `dspy` (already a transitive of `libs/py/llm`? — `make_dspy_lm` imports it lazily; add `dspy` to linguist).
- Tests hermetic: parity tests use committed faerrin fixtures; the judge uses a stub `CompleteFn` (no LLM).
- `defs.yaml` (781 lines) lifts into `apps/linguist/` as linguist's own data (G4 YAML).
