# 0003. All akasha content is vellum

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision C)

## Context

Wiki content mixed several markdown dialects with special-case parsers.

## Decision

Every akasha page is written in vellum, astra's own document format (`libs/{py,ts}/vellum-lang`), rendered by gothic.

## Consequences

One parser and one renderer for all content. New constructs are added to vellum-lang in both languages, not as per-site markdown extensions.
