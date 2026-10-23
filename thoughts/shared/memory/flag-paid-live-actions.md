---
name: flag-paid-live-actions
description: FEEDBACK — flag paid or published-content-replacing steps (TTS credits, episode or snapshot replacement) at the moment of execution, even when a plan sanctions them
metadata:
  type: feedback
---

Before any step that spends real money (ElevenLabs TTS, paid APIs beyond routine cheap LLM calls)
or replaces published content (episode audio, snapshot publish, edge cutover), state it in one
explicit line: what it costs and what it replaces. In an interactive session give Josh a beat to
object.

**Why:** during a 2026-07 acceptance run I re-rendered a live episode because the spec allowed it.
Josh: "wait, why are you rerendering the 6-29 audio?" A plan written earlier is not a decision made
now.

**How to apply:** routine cheap LLM calls and scratch writes need no flag. Routine live infra steps
are covered by [[live-infra-changes-authorized]].
