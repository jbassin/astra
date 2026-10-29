---
name: check-script-before-audio
description: when testing script-generation changes, generate the script alone, read and check it, and get Josh's yes before any audio render
metadata:
  type: feedback
---

When a change touches mouthpiece's script generation (prompts, corrections, models, the brief,
any script input), never render audio in the same run. Generate the script (and brief) into a
scratch folder first, check it for the thing the change was meant to fix, show Josh the result,
and render audio only after his yes, from that exact checked script.

**Why:** on 2026-10-28 I re-rendered 2026-10-19 straight through the live pipeline after
adding spelling corrections, without reading the script first. The reused producer brief still
named Osyluth as two characters, so a full ElevenLabs render (~38,700 characters) went out with
the same error. Josh: "IF WE'RE TESTING CHANGES IN THE SCRIPT GENERATION, THEN YOU CHECK THE
SCRIPT AFTER GENERATING IT."

**How to apply:** before generating, list every input the script reads (transcript, brief,
chronicle, roster, wiki) and check each for the problem; regenerate the brief when its inputs
changed (`session_brief`). After generating, grep the brief and script for the old problem and
rerun any scan used to find it. Audio is the expensive step: it waits for the checked script
and an explicit go. See [[flag-paid-live-actions]] and [[verify-before-acting]].
