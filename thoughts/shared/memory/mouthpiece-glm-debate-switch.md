---
name: mouthpiece-glm-debate-switch
description: mouthpiece moved off Anthropic to GLM 5.2 (OpenRouter) + recap→debate format — the model/key/prompt seams, the A/B that justified it, and the sops-masked CI gotcha
metadata:
  type: project
---

PROJECT 2026-06-26 (COMPLETE + PUSHED + CI-GREEN + DEPLOYED LIVE, `87d10dc`…`3d8b768`): the recap podcast
moved off Anthropic onto **GLM 5.2** (`openrouter/z-ai/glm-5.2`, open-weight MoE via OpenRouter) for ALL its
LLM calls (digest + script + mega), AND changed format from the calmer two-host recap to a **two-co-host
DEBATE**.

**Why:** Anthropic stopped offering Fable 5 (US-gov restriction); GLM 5.2 is cheaper than Haiku
(~$0.95/$3.00 per 1M vs Opus $5/$25) while benchmarking near Opus 4.8, MIT-licensed, no US-vendor limits.
Stakeholders also wanted a debate format. A local A/B (regenerated the 2026-6-22 episode) showed GLM's plain
recap banter TRAILS Opus on the deadpan-foil dynamic, but in a DEBATE frame GLM is strong — its tendency to
argue (the "weakness" in recap) is the point. Stakeholders approved the GLM-debate output; cost closed the
case without an Opus-debate comparison.

**How to apply / the load-bearing seams:**
- **Model is config-single-source.** `llm.default-model` in config.kdl drives mouthpiece (assets pass
  `_llm_model()` = `cfg.llm.default_model`). `_litellm_model` passes any `provider/id` (has `/`) straight
  through. Changed config.kdl + BOTH schemas (Pydantic `LlmConfig`, Zod `Llm`) + `astra_llm.DEFAULT_MODEL`
  (the "keep in sync" fallback). **(UPDATE 2026-06-26: linguist judges also moved to GLM 5.2** —
  surface-model-judge/escalate flipped AND `judge.compiled.json` recompiled on GLM, since the artifact is
  model-specific; see [[linguist-gate-j-dspy-judge]]. The compiled judge was the reason NOT to flip blindly.)
  **scribe stays Groq Whisper** (ASR, not a chat model).
- **litellm reads provider keys from ENV only** (client.py passes no api_key). So the load-bearing deploy
  wiring is: secret in SOPS → `just up` exports it UPPER_CASED → the service's compose `environment:` passes
  it in. Added `openrouter_api_key` to `deploy/sops/secrets.enc.yaml` (`SOPS_AGE_KEY_FILE=deploy/sops/age.key
  sops set …`) + `OPENROUTER_API_KEY` to the `*dagster-env` anchor. The config.kdl `ref=` is documentary; the
  compose anchor is what's load-bearing. [[deploy-sops-injection]]
- **Debate format = ONE prompt.** Two-pass: Pass A (`build_improv_system_prompt`) sets the voice/dynamic;
  Pass B (`build_dressing_system_prompt`) is a faithful typesetter FORBIDDEN to improve, so it preserves
  whatever Pass A produces. Rewrote Pass A to a two-position debate (pushback is the rhythm,
  concede-then-counter, interruptions welcome) + relaxed Pass B's "overlap tags are rare" rule. The one-shot
  `build_script_system_prompt` is NOT in the production path (the asset hardcodes `two_pass=True`) — left as
  the old foil framing on purpose. **Forward-only:** the 9 published episodes keep their scripts (per-episode
  hosts, [[mouthpiece-two-host-gotchas]]).
- **Pricing telemetry.** `astra_llm.pricing.cost_usd` returns 0.0 for unknown models (graceful, never
  throws) → added a GLM row (OpenRouter ~$0.95/$3.00) so SigNoz cost isn't silently zero. cost_usd receives
  the raw `openrouter/z-ai/glm-5.2` string.

**THE CI gotcha (cost a red push):** `apps/_smoke-substrate`'s `test_smoke_runs_offline` calls `run()` →
`ensure_anthropic_env()` → resolves the Anthropic key, which **shells out to `sops` when the env override is
absent**. CI has no `sops` binary → `FileNotFoundError`. Local `uv run pytest` PASSED because sops IS
installed locally — it silently resolved via sops instead of failing. **To reproduce the substrate-smoke CI
faithfully, mask `sops` off PATH** (`PATH=/shim:/usr/bin:/bin uv run pytest …`, /shim has no sops). The test
must set `ANTHROPIC_API_KEY` (what ensure_anthropic_env reads) to stay offline — NOT `OPENROUTER_API_KEY`
(the bug that red'd it). Reinforces [[no-ci-monitoring]]: reproduce locally, but know which tests have a
host-tool dep CI lacks.

**Deploy:** `just up` (rebuilds the dagster IMAGE — prompt+config are baked, [[mouthpiece-two-host-gotchas]]
— + injects the key from SOPS; must be `just up`, not plain `docker compose up`, or the SOPS env drops). GLM
debate applies to the NEXT episode the pipeline generates. **Not yet proven in-cluster** (optional follow-up:
materialize `session_digest`+`session_script` for a test partition — the local A/B proved the model, this
would prove the deployed wiring). The harnesses + the approved debate transcript live in this session's
scratchpad only. Builds on [[mouthpiece-two-host-gotchas]].
