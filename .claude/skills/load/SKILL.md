---
name: load
description: Start-of-session orientation for the astra repo. Reads docs/now.md, the backlog, the target app's README and the CI status, then reports what is in flight and the next action. Invoke at the start of an astra work session (or after a context reset) before picking up work.
---

# /load — orient at session start

Read a small, fixed set of docs, check them against git and CI, then report. Budget: about 10,000
tokens of reading. `CLAUDE.md` and the memory index are already loaded; do not re-read them.

## 1. Read the current state

- `docs/now.md` — in flight, blocked, next action. Always.
- `docs/backlog.md` — skim the headings and the stakeholder gates; read the section for the area
  you are about to work in.
- If now.md names a live multi-session plan, read only its checklist section (for the 0037 paydown:
  section 0.1 of `thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`).

## 2. Read the target area

When the user or now.md names an app or area:

- that app's `README.md` (its Operations and Traps sections first);
- any memory file whose index line says "read when" for this kind of work;
- `docs/architecture.md` or `docs/runbook.md` only if the work touches deploy, data or recovery;
- `docs/adr/README.md` (the table only) before proposing anything that might reopen a decision.

Do not read `thoughts/archive/`; it is history. Open an archived file only to answer a specific
question about why something was done.

## 3. Check reality

```sh
git log --oneline -8
git status --short
gh run list --branch main --limit 3
```

Docs can lag the last commit; trust git. Note a red `main` run: fixing it comes before new work.

## 4. Report, then wait

In a few lines: what is in flight, the next action, what is blocked and on whom, the state of
`main` (clean, pushed, CI green or red), and the decisions or traps that constrain the next step.
Then ask whether to proceed, unless the prompt already said to continue.
