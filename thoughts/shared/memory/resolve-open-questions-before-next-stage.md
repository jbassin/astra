---
name: resolve-open-questions-before-next-stage
description: Never advance a dev stage (scope→spec→implement) with open questions; ask them one at a time as they arise while writing the doc
metadata:
  type: feedback
---

In astra's **Scope → Spec → Implement** process, **never move to the next stage while open questions
remain** in the current doc. A scope doc must have zero unresolved questions before speccing; a spec
must have zero before implementing.

**Why:** unresolved decisions that get carried into the next stage become late rework or wrong baked-in
assumptions. The user wants to make every genuinely-his call *before* it's locked, not discover it
mid-implementation.

**How to apply:** while authoring a scope or spec doc, whenever decision points arise that are genuinely
the user's to make, **stop and ask — batching up to 4 related decisions per `AskUserQuestion` call** (the
tool supports up to 4 questions; group related ones, don't drip them one at a time). Record each answer
in the doc (mark the open question RESOLVED). Only declare a doc ready for the next stage once it has no
open/unresolved questions. Questions checkable
against the repo are NOT user questions — verify those yourself first ([[verify-before-acting]]). This
extends [[no-silent-scope-cuts]] (don't quietly defer scope) to: don't quietly *advance* past an
unanswered question either. First applied while scoping heartwood (0020).
