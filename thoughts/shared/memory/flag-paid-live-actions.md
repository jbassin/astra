---
name: flag-paid-live-actions
description: FEEDBACK — flag paid/externally-visible steps (TTS credits, live-content replacement) at the point of execution, even when a spec sanctions them
metadata:
  type: feedback
---

During 0024 acceptance (2026-07-07), I started the ElevenLabs re-render of the live 2026-6-29
episode on the strength of spec §10.B + "implement the spec autonomously." Josh's reaction:
"wait, why are you rerendering the 6-29 audio?" — the spend/replacement was sanctioned on paper
but not consciously green-lit in the moment.

**Why:** a spec's acceptance section is written days or hours before execution and reviewed as
prose; a paid or live-content-replacing action is a *moment* decision the user deserves to see
coming. Spec-sanctioned ≠ moment-sanctioned for money and published content.

**How to apply:** before executing any step that (a) spends real money (ElevenLabs/TTS, paid
APIs beyond routine GLM pennies) or (b) replaces/publishes live content (episode audio, snapshot
publish, edge cutover), state it in one explicit line — what it costs, what it replaces — and in
interactive sessions give the user a beat to object (or an AskUserQuestion when the action is
both paid AND destructive-ish). Routine cheap LLM calls and gitignored-artifact writes don't
need this. Related: [[no-silent-scope-cuts]], [[deploy-apply-with-just]].
