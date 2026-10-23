---
name: lighter-process-no-octo
description: Don't use the octo plugin skills, and keep process proportionate; follow CLAUDE.md "How work gets done".
metadata:
  type: feedback
---

Do not invoke `octo:*` skills. Keep planning and documentation proportionate to the change.

**Why:** In the 0037 review (2026-10-22) Josh wrote: "I think agents have effectively grown out of
this, I kinda wanna rethink this whole setup. I especially don't like octo anymore." On change
tiers: "maybe we just don't need all this pomp." ([ADR 0011](../../../docs/adr/0011-process-without-tiers.md))

**How to apply:** follow the "How work gets done" section of `CLAUDE.md`: plan in the conversation,
one plan-plus-checklist document only for multi-session work, slices with an orchestrator and
worktree agents, CI as the gate, an independent review only for risky changes. No scope, spec or
research documents and no decision IDs by default. Archived docs that describe the old gates are
history.
