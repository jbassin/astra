---
name: lighter-process-no-octo
description: Don't use the octo plugin skills, and keep process proportionate; Josh wants a lighter way of working than the scope/spec/adversarial ritual.
metadata:
  type: feedback
---

Do not invoke `octo:*` skills (`octo:spec`, `octo:embrace` and the rest), even where `CLAUDE.md` still
names them. Keep planning and documentation proportionate to the change.

**Why:** In the 0037 review (2026-10-22) Josh wrote: "I think agents have effectively grown out of
this, I kinda wanna rethink this whole setup. I especially don't like octo anymore." On change tiers:
"maybe we just don't need all this pomp."

**How to apply:** Follow the "How work gets done" section of `CLAUDE.md` (written and approved
2026-10-22): plain planning in the conversation, one short plan-plus-checklist document only for
multi-session work, slices with an orchestrator and worktree agents, CI as the gate, and an
independent review only for risky changes. Don't create scope, spec and research docs, or decision
IDs, by default. Some older memory entries and `CONTRIBUTING.md` still describe the old gates; the
`CLAUDE.md` section wins.
