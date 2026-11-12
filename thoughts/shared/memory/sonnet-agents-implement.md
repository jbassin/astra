---
name: sonnet-agents-implement
description: implementation agents run on Sonnet (`model: "sonnet"`); the main session plans, reviews and merges
metadata:
  type: feedback
---

When a slice goes to an agent to implement, start that agent with `model: "sonnet"`. The main
session keeps the planning, the review of each diff, the pull requests and the live steps.

**Why:** Josh, 2026-11-12, first line of his feedback on the character builder: "you should use
sonnet agents for implementation". He gave no reason. He said it about the builder work; applying
it to every implementation agent in astra is my reading.

**How to apply:** pass `model: "sonnet"` on each implementing Agent call (CLAUDE.md, "How work
gets done", step 4). Write the brief for a reader with no context: the goal, the design already
decided, the files it owns and the ones it must leave alone, how to verify, and the hard rules.
Read-only search and independent review agents are not covered by what he said.
