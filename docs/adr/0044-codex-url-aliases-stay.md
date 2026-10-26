# 0044. codex keeps its old URL forms permanently

- **Date:** 2026-10-26
- **Status:** Accepted; supersedes [0026](0026-codex-url-alias-removal-date.md)
- **Source:** Josh, 2026-10-26, when asked for 0026's removal date

## Context

codex's browse URLs still decode two old forms: `legacy=1`/`legacy=true` (renamed `superseded`)
and a trailing `!` on range filters (the deleted has-value gate). 0026 set out to give them a
removal date.

## Decision

Keep both forms permanently. codex keeps its legacy (superseded) content forever, and the old
links to it keep working.

## Consequences

`urlState.ts` and the route files that read `legacy=` keep their alias handling and its tests.
There is no alias-removal slice.
