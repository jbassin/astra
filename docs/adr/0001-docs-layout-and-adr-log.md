# 0001. Living docs in docs/, history in the archive, decisions as ADRs

- **Date:** 2026-10-22
- **Status:** Accepted
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table: change tiers and docs layout)

## Context

Project knowledge lived in a 100 KB always-loaded memory index, a 235 KB RESUME file and per-subsystem specs. The copies disagreed, and much of it was changelog that every session paid to read.

## Decision

Living docs go in `docs/` (architecture, development, runbook, now, backlog) and in each app's README. Binding decisions are ADRs in `docs/adr/`, one per decision; a later decision supersedes an ADR instead of editing it. History moves to `thoughts/archive/`, which nothing auto-loads and nobody edits. The memory index stays under a size budget that `just docs-check` enforces.

## Consequences

One home per fact. A doc describes the current state; history lives in git and the archive. Audits read the ADR log before re-raising a settled question.
