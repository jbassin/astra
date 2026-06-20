---
name: verify-before-acting
description: before acting, check what already exists — faerrin's impl, the skill/command docs, the repo's conventions — don't reinvent or assume
metadata:
  type: feedback
---

Before writing code, running a skill, or choosing a workflow, **investigate what
already exists** instead of acting on a default or an assumption. Three concrete
failures in one session traced to skipping this:

- **Reinvented faerrin logic.** Wrote a bespoke folder-index page-name helper when
  faerrin already had `folderIndexName` (`pkg/content/scripts/lib/folder-index.ts`).
  astra is a **port of faerrin** — for any derivation/transform/algorithm, grep
  faerrin first and port the existing function verbatim (parity is the whole point).
- **Ran a skill without reading it.** Invoked `octo:embrace` and proposed the wrong
  execution (implement directly / external providers) because I hadn't read that its
  **team mode dispatches to Claude subagents** ([[no-silent-scope-cuts]] is the sibling
  lesson). Read a command/skill's own docs before running it.
- **Ignored the repo's VC cadence.** Defaulted to "commit only when asked" despite the
  git log (per-slice commits) and [[no-ci-monitoring]] showing commit-as-you-go +
  push-on-chunk (now codified in CLAUDE.md "Development process").

**Why:** astra is a re-architecture with strong existing precedent (faerrin's code,
the per-subsystem patterns in scribe/linguist/akasha, settled conventions). Acting
before checking produces duplicated/divergent logic, wrong workflows, and broken
process — and erodes trust faster than slow work does.

**How to apply:** before implementing, (1) grep faerrin for an existing
implementation and port it; (2) mirror the nearest already-built astra subsystem's
structure; (3) read the relevant skill/command instructions before invoking; (4) when
a convention is checkable in the repo (VC cadence, config single-source, telemetry
wiring), check it rather than assume. Cite what you found. Default to "verify," not
"guess." Related: [[telemetry-built-in]], [[config-single-source]].
