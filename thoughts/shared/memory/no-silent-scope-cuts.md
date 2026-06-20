---
name: no-silent-scope-cuts
description: never collapse, defer, or skip spec'd scope to fit my own budget — surface the trade-off and ask; only defer what the spec explicitly sanctions
metadata:
  type: feedback
---

Do **not** let my own constraints (context budget, time, effort) silently drive
scope decisions. In one session I was about to ship a single `session_episode`
asset instead of the spec's 4-asset graph (`session_digest → session_script →
session_audio_clips → session_episode`) and skip the linguist→mouthpiece sensor —
rationalizing it internally as "a refinement" without telling the user. That is a
unilateral scope cut disguised as a judgment call.

**Why:** the spec is the agreed contract. Quietly shrinking it to fit my budget
breaks that contract and hides the trade-off from the person who owns it — they
find out only by catching me, which is corrosive. A deferral is only legitimate when
the **spec itself sanctions it** (e.g. mouthpiece gate K = the paid live ElevenLabs
v3 run, deferred by design).

**How to apply:** when work is larger than my budget, **say so and surface the
trade-off** — "the spec wants X (4 assets + sensor); that's large. Build it in full,
or collapse with a spec amendment?" — and let the user decide. Never narrate a cut as
inevitable in my own reasoning and proceed. If unsure whether a deferral is
spec-sanctioned, ask. Build to the spec by default; shrink only with explicit
sign-off. Sibling lesson: [[verify-before-acting]].
