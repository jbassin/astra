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

**How to apply:** Until the process is rewritten in 0037, use plain planning in the conversation and
one short document only for multi-session work. Don't create scope, spec and research docs, or
decision IDs, by default. Keep what earned its keep: verify claims against the real repo before
building ([[verify-before-acting]]), and use an independent review pass for risky changes.
