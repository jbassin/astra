---
name: load
description: Start-of-session orientation for the astra repo. Reads the durable docs — RESUME.md, the memory index + feedback memories, the active spec/scope, and the conventions — then reports the current state and the next action. Invoke at the beginning of an astra work session (or after a context reset) before picking up work.
---

# /astra:load — orient at session start

Read astra's durable docs in order, then report where things stand and what's next.
**Read, don't skim** — these are the single source of truth for in-flight work. Do this before
touching code.

## 1. Read the living handoff (the spine)

- **`thoughts/shared/RESUME.md`** — start here. The **"Current state"** section is the only part that
  goes stale; it names which subsystem is in flight, which slices are done/pushed, and the exact "resume
  at slice N" pointer. The **"Next"** section names the next action.

## 2. Read the conventions + roadmap

- **`CONTRIBUTING.md`** — the practical guide: dev process (Scope → Spec → Implement), the exact CI
  commands, working-style rules, the gotchas catalog.
- **`CLAUDE.md`** (root) — authoritative conventions (plain git + conventional commits, two toolchains,
  telemetry-from-day-one, KDL+SOPS, the standing principles).
- **`thoughts/astra/plans/0000-astra-migration-roadmap.md`** — phases + the A–I decisions ledger.

## 3. Load memory (background context, already auto-imported — re-read the relevant ones)

- **`thoughts/shared/memory/MEMORY.md`** — the one-line index. Open the memory files relevant to the
  in-flight subsystem (e.g. its `*-gotchas.md`) **and** the feedback memories — especially
  `verify-before-acting`, `no-silent-scope-cuts`, `no-ci-monitoring`, `deploy-apply-with-just`,
  `telemetry-built-in`, `config-single-source`.
- Memories reflect what was true when written — if one names a file/flag/function, verify it still
  exists before relying on it.

## 4. Read the active subsystem's paper trail

For the subsystem RESUME says is in flight, open:
- its **spec** — `thoughts/astra/specs/<NNNN>-<subsystem>-spec.md` (the locked decisions, scope in/out,
  acceptance gate, the slice list);
- its **scope/research** — `thoughts/shared/research/<date>-<subsystem>-<NNNN>-thoughts.md`.

## 5. Confirm the real state against git

- `git log --oneline -8` and `git status` — confirm which slices actually landed and whether the tree is
  clean / pushed (RESUME can lag the last commit).

## 6. Report back (don't start coding yet)

Summarize in a few lines: **what subsystem is in flight, which slice is next, the locked decisions that
constrain it, and any spec-sanctioned deferrals.** Then ask whether to proceed (unless the invoking
prompt already said to continue).

> The hard rules (from the feedback memories): **reuse what exists, don't reinvent** (mirror the
> nearest already-built astra subsystem); **verify before acting**; **build the spec's scope in full** —
> surface trade-offs, never silently defer; **commit each CI-green slice + push on chunk completion**
> after reproducing CI locally (don't watch the GHA run).
