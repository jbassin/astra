# 0019. assay keeps the scorer, store and book; the workshop is archived

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-24)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

assay grew a scoring model, a canonical homebrew store, a book exporter and a large review workshop (fleet briefs, review UI, round scripts).

## Decision

Keep the scorer, the homebrew store and the book export. Archive the workshop, including the review UI source.

**Amended 2026-11-01:** assay also builds player handouts (`just handout`), because they share
the book's style, fonts and tectonic build. Handout sources stay outside the repo.

## Consequences

The assay track in Phase 2 splits the product and moves books out of codex.
