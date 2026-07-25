---
name: verify-rules-against-corpus
description: FEEDBACK — never assert a PF2e rules claim from recall; check the codex corpus rules docs first (the emanation/aura card-3 incident)
metadata:
  type: feedback
---

Never base a stakeholder card (or any judgment) on a PF2e rules claim from recall.
The full remaster + legacy rules text is greppable at `apps/codex/data/corpus/`
(`rules/*.json`, e.g. `rules/emanation.json`) — check it first.

**Why:** during the 0030 flag-digest cards (2026-07-25) a card asserted "emanations
move with you by RAW" — backwards. Player Core p.428: an emanation "issues forth from
each side of your space", no movement language; movement is the **aura** trait's
behavior ("continually ebbs out from you"). The wrong premise inverted the card's
options (stakeholder caught it); the correct reading made the card unnecessary — a
plain R2 redundant-restatement deletion. The repo's own §13 R2 convention already
encoded the correct rule ("The emanation moves with you." is deletable *because aura
makes it implicit*).

**How to apply:** before writing a card or a sweep-rule that leans on a rules default
(area behavior, condition mechanics, degree-of-success reading), grep the corpus rules
doc and quote it. If a store sentence restates a verified default, it's R2-deletable;
if it contradicts the default, it's load-bearing explicit override text.
