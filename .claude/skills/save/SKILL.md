---
name: save
description: End-of-session checkpoint for the astra repo. Records the session's progress into the durable docs — RESUME.md current-state, the active spec's status, the subsystem memory (load-bearing gotchas) + the MEMORY.md index — then commits and pushes the docs. Invoke when wrapping up an astra work session, or whenever asked to "save", "checkpoint", or "update the docs".
---

# /astra:save — checkpoint the durable docs at session end

Persist what this session learned and landed so the next session (a cold `/astra:load`) picks up exactly
where this one left off. The durable docs are the handoff — keep them honest.

## 0. Establish ground truth first

- `git log --oneline -10` + `git status` — know exactly which slices/commits landed and whether the tree
  is clean and pushed. Write the docs against reality, not intentions.

## 1. Update `thoughts/shared/RESUME.md` — the **"Current state"** section

This is the only part that goes stale; it must be exact.
- Bump the `as of commit <hash>` reference to the latest commit.
- For the in-flight subsystem: list the slices **done + pushed** (with commit hashes), and the slices
  **remaining**, with a precise **"resume at slice N"** pointer describing the next action.
- Note any **spec-sanctioned deferrals** (e.g. a live run blocked on a SOPS secret).
- Update the **"Next"** section to match.

## 2. Update the active spec's status

- `thoughts/astra/specs/<NNNN>-<subsystem>-spec.md` — move the **Status** line to reflect reality
  (`Plan (pre-implementation)` → `IN PROGRESS — slices X of N built …` → `BUILT`), and check off
  acceptance-gate items that are genuinely met.

## 3. Write/update the subsystem memory (the load-bearing gotchas)

- One fact per file under `thoughts/shared/memory/` (harness format — frontmatter `name`/`description`/
  `metadata.type`, then body). For an in-flight subsystem this is usually a `<subsystem>-<NNNN>-gotchas.md`
  of type `project`: the non-obvious things a fresh session would re-derive painfully (porting seams,
  test-double strategy, dialect/ripple gotchas, locked decisions, ports, deferrals).
- **Check for an existing file first** and update it rather than duplicating. Link related memories with
  `[[name]]`.
- Add/refresh the **one-line pointer in `MEMORY.md`** (`- [Title](file.md) — hook`). Never put memory
  body in `MEMORY.md`; never write astra memory to faerrin or `~/.claude`.
- Don't record what the repo already encodes (code structure, git history, CLAUDE.md) — capture what was
  non-obvious.

## 4. (If the session changed conventions) update the guides

- If the dev process / CI commands / standing principles changed, reflect it in `CONTRIBUTING.md` /
  `CLAUDE.md`. Skip if nothing structural changed.

## 5. Commit + push the docs

- Stage `thoughts/` (+ any guide changes), commit with a **Conventional Commit** (`docs(<scope>): …`),
  and **push**. Docs-only ⇒ no CI lanes to reproduce; per `no-ci-monitoring`, confirm the push + don't
  watch the GHA run.
- End the commit message with the standard `Co-Authored-By` / `Claude-Session` trailers.

## 6. Report

State plainly what was recorded and the single-sentence handoff a fresh `/astra:load` will see.
