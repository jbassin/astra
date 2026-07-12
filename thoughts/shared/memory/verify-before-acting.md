---
name: verify-before-acting
description: before acting, check what already exists — prior art in the repo, the skill/command docs, the repo's conventions — don't reinvent or assume
metadata:
  type: feedback
---

Before writing code, running a skill, or choosing a workflow, **investigate what
already exists** instead of acting on a default or an assumption. Three concrete
failures in one session traced to skipping this:

- **Reinvented existing logic.** Wrote a bespoke folder-index page-name helper when
  the predecessor codebase already had one (`folderIndexName`). (Historical — that
  migration is complete and the faerrin repo deleted; the surviving lesson is: for
  any derivation/transform/algorithm, look for existing prior art — the nearest
  already-built astra subsystem or lib — before writing new logic.)
- **Ran a skill without reading it.** Invoked `octo:embrace` and proposed the wrong
  execution (implement directly / external providers) because I hadn't read that its
  **team mode dispatches to Claude subagents** ([[no-silent-scope-cuts]] is the sibling
  lesson). Read a command/skill's own docs before running it.
- **Ignored the repo's VC cadence.** Defaulted to "commit only when asked" despite the
  git log (per-slice commits) and [[no-ci-monitoring]] showing commit-as-you-go +
  push-on-chunk (now codified in CLAUDE.md "Development process").

**Why:** astra has strong existing precedent (the per-subsystem patterns in
scribe/linguist/akasha/strider, settled conventions). Acting before checking produces
duplicated/divergent logic, wrong workflows, and broken process — and erodes trust
faster than slow work does.

**How to apply:** before implementing, (1) check for an existing astra implementation
and mirror the nearest already-built subsystem's structure; (2) read the relevant
skill/command instructions before invoking; (3) when a convention is checkable in the
repo (VC cadence, config single-source, telemetry wiring), check it rather than
assume. Cite what you found. Default to "verify," not "guess." Related:
[[telemetry-built-in]], [[config-single-source]].
