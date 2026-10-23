---
name: save
description: End-of-session checkpoint for the astra repo. Updates docs/now.md, the backlog, the relevant app README or docs and memory (edit in place; archive what became history), then commits and pushes. Invoke when wrapping up an astra session, or when asked to "save", "checkpoint" or "update the docs".
---

# /save — checkpoint at session end

Write the docs against what actually landed, so the next `/load` starts cold and correct. Every doc
describes the current state: edit in place, never append a dated log.

## 1. Establish ground truth

```sh
git log --oneline -10
git status --short
```

Know which commits landed and whether the tree is clean and pushed.

## 2. Update `docs/now.md` (at most 2 KB)

Rewrite it: the date, what is in flight, the next action, what is blocked and on whom. Drop
anything finished.

## 3. Update `docs/backlog.md`

- Delete the line of every item finished this session.
- Add every new open item, one line: owner (Josh or agent), why, pointer.
- A new stakeholder gate gets a checklist and the date it opened, under "Stakeholder gates".
- If a multi-session plan has a checklist (for example section 0.1 of the paydown doc), tick it there.

## 4. Record what was learned where it belongs

- A trap or operation for one app goes in that app's `README.md` (`## Operations`, `## Traps`).
- A repo-wide fact goes in `docs/` (development, architecture, runbook).
- A binding decision gets a new ADR in `docs/adr/` (next number, a row in its README); a decision
  that replaces an older one marks the old ADR `Superseded by NNNN`.
- A rule about how to work, owned by no app, goes in a memory file under `thoughts/shared/memory/`
  (frontmatter `name`, `description`, `metadata.type`), with one index line in `MEMORY.md` that says
  "read when ...". Never write astra memory to `~/.claude`.
- A doc that became history moves to `thoughts/archive/` with `git mv` in the same commit, and its
  index line goes.
- Don't record what the code or git log already says.

## 5. Check and commit

```sh
just docs-check   # memory index budget and doc links
```

Commit with a Conventional Commit (`docs(<scope>): ...`, body lines at most 100 characters) and the
session's trailers, then push. If the commit also touches code, run `just ci` first. Confirm the
push and check the CI run once; don't poll.

## 6. Report

Say what was recorded and give the one-sentence handoff the next `/load` will see in `docs/now.md`.
