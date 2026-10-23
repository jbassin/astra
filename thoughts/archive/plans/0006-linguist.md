# Astra Sub-plan 0006 — linguist (transcript processing)

**Status:** Plan (pre-implementation). **Phase:** 3 (pipeline). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** D4 (transcripts rendered by akasha-frontend, not stored as vellum); F3 (historical enters here, canonical level); litellm+dspy (LLM); ontology-being = speakers/campaigns (meta).
**Depends-on:** `0005` scribe (input), Phase 1 (ontology-being, libs/py/llm, config, observe). **Blocks:** `0008` mouthpiece-backend (context), `0011` akasha-frontend (transcript data).

> Goal: port faerrin's `content/scripts` pipeline into astra's **linguist** — fix transcription errors
> and emit the formats downstream needs — as **Python Dagster assets**. linguist owns *processing*;
> it does **not** generate wiki pages or render transcripts (that's akasha-frontend, D4).

---

## 1. Current state (faerrin `content/scripts`)

TS pipeline (`bunx tsx scripts/run.ts`), four LLM-free stages + a separate LLM correction surfacer:

1. **ingest** (`pipeline/ingest.ts`) — per session: `RawLine[] {start,end,user,text}` →
   `FormattedLine[] {start: HH:MM:SS, second, text: replace(text), user: resolveSpeaker(user),
   duration}`. `replace` applies `defs.yaml` regex corrections; `resolveSpeaker` maps raw Discord ID →
   `{name,color}` (roster). Output `scripts/data/{date}.json` = `Transcript {date, audio, script}`.
2. **export** (`pipeline/export.ts`) — generates `wiki/Script/*.md` directive pages, auto-links
   `[[wikilinks]]` into transcript text (from the wiki corpus), matches session→campaign. **→ moves to
   akasha-frontend** (D4: it renders transcripts; it has the akasha corpus + link graph).
3. **script** (`pipeline/script.ts`) — emits `scripts/script/{arc}.{slug}.{date}.txt` (the LLM-context
   for caster/mouthpiece) + `shibboleth.json`.
4. **build-transcripts** (`build-transcripts.ts`) — `scripts/script/*.txt` → canonical line-numbered
   `transcripts/{…}.txt` (`{NNNNNN}\t{Character}: {text}`).

**Correction surfacer** (`surface/` + `lib/llm.ts`, the `review` command): Phase-1 phonetic filter
pre-flags candidate OOV spans against a canonical lexicon; **Phase-2 LLM judge** (`surface/judge.ts`)
windows the transcript and classifies each span `confirm|new|reject` (mapping confirms to a lexicon
canonical), **haiku judges → sonnet re-judges borderline confirms**, deterministic **guardrails** drop
unsafe results; confirmed corrections are appended to `defs.yaml` via an interactive **review UI**.

**Config that's actually META** (→ ontology-being): `campaigns.yaml` (player↔PC mappings + campaign
descriptions), `roster.ts` (Discord ID → name+color). `defs.yaml` (regex corrections) is linguist's own.

## 2. Target (astra linguist)

Python (uv) **Dagster assets**, per-session partitions. Reads scribe's raw `script.json`
(`[{start,end,text,user}]`, raw IDs); reads **speakers + campaigns from ontology-being**; emits the
**formatted transcript**, the **canonical line-numbered transcript**, and the **mouthpiece context**.
The LLM correction surfacer re-platforms to **litellm + dspy**. **No wiki-page generation, no
auto-linking, no transcript rendering** — those are akasha-frontend (D4).

## 3. Assets (the pipeline as a Dagster graph)

1. **`formatted_transcript`** (← scribe `script.json`): apply `defs.yaml` corrections, resolve Discord
   ID → `{name,color}` (ontology-being), format timestamps, compute duration → `Transcript {date, audio,
   script: FormattedLine[]}`. Tag the session's **campaign** (keyword-scoring match against
   ontology-being campaign/PC data — the matching *logic* stays in linguist).
2. **`mouthpiece_context`** (← formatted): the per-session LLM-context `.txt` (context header + script
   lines) + shibboleth, consumed by `0008`.
3. **`canonical_transcript`** (← formatted/context): the line-numbered `transcripts/{…}.txt`
   (`{NNNNNN}\t{Character}: {text}`). Consumed by mouthpiece + akasha-frontend.
4. **`correction_candidates`** (dspy): the phonetic filter + LLM judge → proposed corrections (§4);
   feeds the review loop that updates `defs.yaml`.

`audio` stays an external `static-audio` URL (F4); linguist just carries the link.

## 4. The correction surfacer → litellm + dspy

The judge (`judge.ts`) is a clean dspy target: a structured classify with a typed output and
deterministic guardrails.
- **Phonetic filter** (Phase 1): port the lexicon/OOV/phonetic-similarity libs to Python (jellyfish /
  rapidfuzz) → candidate spans. Pure, no LLM.
- **dspy judge** (Phase 2): a `Signature` (inputs: transcript window + canonical lexicon + flagged
  spans; output: `[{lineRef, span, verdict, suggestedCanonical, confidence, reason}]`) backed by
  litellm→Claude. Keep the **haiku→sonnet escalation** (a dspy module that re-runs borderline confirms
  on a stronger LM) and **port the guardrails verbatim** (they're deterministic safety, not LLM).
- **Optimizer (the dspy upside):** a gold set of past `defs.yaml` confirmations can tune the judge
  prompt (`BootstrapFewShot`/`MIPROv2`). → decision **G2** (dspy program vs a straight litellm port).
- The injectable `CompleteFn` seam → a dspy module boundary (tests pass a stub, as today).

## 5. Historical (F3: enter at the canonical/linguist level)

The 76 historical sessions' canonical outputs already exist (`content/scripts/data/*.json`,
`content/transcripts/*.txt`). **Import them as already-materialized linguist asset outputs** (pre-satisfy
the historical partitions) — do **not** re-run ingest/correction over them (their corrections are
long-settled; re-running risks churn). scribe + linguist process **new** sessions going forward.

## 6. What moves OUT of linguist (to akasha-frontend, D4)

- **Wiki `Script/` page generation** + the `:::transcript-line`/`::transcript-audio` directives.
- **Auto-linking** `[[wikilinks]]` into transcript text (needs the akasha corpus + link graph).
- Transcript **rendering** + the interactive player.
linguist emits **structured transcript data**; akasha-frontend turns it into pages (it owns the corpus).

## 7. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| G1 | Correction-review UX | web UI vs batch | **DECIDED: batch** — dspy emits suggestions to a reviewable file; apply via CLI/PR. No service; add a UI later only if volume warrants. |
| G2 | Judge: dspy vs litellm | dspy vs litellm | **DECIDED: dspy** — optimizable against the gold set of past confirmations; guardrails + escalation kept verbatim. |
| G3 | campaigns/roster home | ontology-being vs linguist config | **DECIDED: ontology-being** (both META); session→campaign matching logic stays in linguist. |
| G4 | `defs.yaml` format | YAML vs KDL | **DECIDED: keep YAML** — machine-appended regex list, not authored config. |

## 8. Work items

1. **Scaffold** `apps/linguist` (uv; Dagster assets; OTel; config). Pull speakers + campaigns from
   ontology-being; lift `defs.yaml`.
2. **`formatted_transcript` asset**: port the ingest transform (corrections + speaker-resolve + timestamp
   + duration) + campaign matching. Parity-test against a faerrin `scripts/data/{date}.json`.
3. **`mouthpiece_context` + `canonical_transcript` assets**: port `script.ts` + `build-transcripts.ts`;
   parity-test the line-numbered format against a faerrin `transcripts/*.txt`.
4. **Phonetic filter** (Python): port lexicon/normalize/phonetics (jellyfish/rapidfuzz). Unit-test against
   the faerrin lexicon tests.
5. **dspy judge** (G2): Signature + module + haiku→sonnet escalation + guardrails (verbatim) →
   `correction_candidates`. Stub seam for tests.
6. **Review loop** (G1): emit suggestions → reviewable file → apply to `defs.yaml`.
7. **Historical import** (F3): pre-satisfy historical partitions from `content/scripts/data` + `transcripts`.

## 9. Exit criteria

- [ ] A new session (one partition) runs scribe→linguist: `formatted_transcript` + `canonical_transcript`
      + `mouthpiece_context`, **parity-tested** byte-for-byte against faerrin given the same raw input.
- [ ] The dspy judge reproduces faerrin's confirm/new/reject behavior on a fixture set (guardrails
      identical); escalation fires on borderline confirms.
- [ ] Historical 76 sessions present as materialized outputs **without re-running** ingest/correction (F3).
- [ ] No wiki-page/transcript-rendering code in linguist (that's akasha-frontend); speakers + campaigns
      read from ontology-being.

## 10. Risks

1. **Parity** — the ingest transform + canonical-transcript format are byte-contracts downstream relies
   on; parity-test against real faerrin outputs before cutover.
2. **dspy behavior drift** (G2) — the judge's guardrails + escalation are load-bearing safety; port them
   deterministically, not as LLM behavior. Validate confirm/new/reject on a fixture set.
3. **Groq-vs-whisperx output shift** — new scribe (Groq) output may differ in casing/punctuation from the
   historical corpus the `defs.yaml` corrections were tuned to; the surfacer may need a re-tune pass on
   first new sessions (see scribe risk §11.4).
4. **Phonetic-lib parity** — Python jellyfish/rapidfuzz ≠ the TS phonetic impl exactly; the *filter* only
   pre-flags (the judge decides), so small differences are tolerable, but test recall on the lexicon set.

## 11. Hand-off

- **→ 0008 mouthpiece-backend:** consumes `mouthpiece_context` + `canonical_transcript`.
- **→ 0011 akasha-frontend:** consumes the structured transcript data; renders pages, auto-links against
  the akasha corpus, and runs the interactive player (all the `export`-step work that moved out, §6).
