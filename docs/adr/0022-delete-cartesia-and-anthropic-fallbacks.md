# 0022. Delete the Cartesia and Anthropic fallbacks

- **Date:** 2026-10-22
- **Status:** Accepted (done 2026-10-23)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0, decision table)

## Context

mouthpiece keeps Cartesia as an alternate TTS provider, and the LLM library keeps an Anthropic path, though ElevenLabs and OpenRouter models are the ones in use.

## Decision

Delete both fallbacks across every layer (code, config, secrets, tests).

## Consequences

One TTS provider and one LLM route to maintain.
