---
name: resolve-open-questions-before-next-stage
description: settle Josh's real decisions before building on them; batch short ones in the question tool, ask in plain text when they need context
metadata:
  type: feedback
---

Don't start building on top of an open product, cost or stakeholder decision. Ask as soon as it
arises, and record the answer in the plan.

**Why:** a decision carried forward unresolved becomes rework or a wrong assumption baked in.
Josh wants to make his calls before they are locked.

**How to apply:** batch related short choices into one question-tool call (up to four). When a
choice needs context, ask in plain text, because the question tool hides the text written before
it ([ADR 0013](../../../docs/adr/0013-how-claude-asks-questions.md)). Questions the repo can answer
are not questions: check them yourself ([[verify-before-acting]]).

**The bar is high** (Josh, 2026-10-23): if you have a strong recommendation that doesn't walk back
something already agreed with him, do it and say what you decided. Ask only for real product,
cost, stakeholder or visual calls, or a reversal of an earlier agreement. During long autonomous
runs, park such a call in `docs/backlog.md` ("Paydown decisions (Josh)") and keep working on
everything it doesn't block.
