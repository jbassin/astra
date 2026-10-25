# astra-llm — the one LLM client

Every LLM and speech-to-text call in astra goes through `astra_llm`; no app calls a provider
SDK directly. litellm is the transport and dspy the program layer. The client owns the
truncation guard, prompt caching, forced-tool output, the one cost meter and the one retry
policy. scribe (transcription), linguist, mouthpiece, heartwood and the mouthpiece tools use
it; Dagster assets get a client from `LlmResource` in `libs/py/pipeline-resources`.

## Public surface

- `LiteLLMClient(completion_fn=None, *, caller=..., retry=DEFAULT_RETRY_POLICY)`:
  - `call_tool(ToolCallRequest)` forces one tool and returns its arguments as a dict;
  - `call_structured(Model, ...)` parses the forced tool's arguments into a Pydantic model;
  - `call_text(TextRequest)` returns free text;
  - `snapshot()` totals the client's billed attempts (its `Ledger`).
  Give every client a `caller` (`mouthpiece.session_script`, `heartwood`); it labels every
  metric point. Build one client per run: its retry budget lives as long as the client.
- `ensure_openrouter_env()` resolves `llm.openrouter-api-key` through `astra_config` and puts it
  in `OPENROUTER_API_KEY`, the variable litellm reads. Call it before any `openrouter/...` call.
- `transcribe(path, model=GROQ_WHISPER)` returns Whisper `Segment`s (verbose JSON, segments
  only).
- `make_dspy_lm(model, lm_class=...)` returns a `dspy.LM`. A bare `dspy.LM` skips the meter;
  pass a `MeteringMixin` subclass (`astra_llm.rlm.MeteredLM`) with a `caller`.
- `astra_llm.rlm` (import it explicitly; it loads dspy's RLM): `MeteringMixin`, `MeteredLM`,
  `HardenedRLM`, `LmMeter`, `instrument_tool`, and the Deno sandbox helpers
  (`make_interpreter`, `deno_available`, `prepare_sandbox_env`).
- `pricing.PRICING_USD_PER_1M`, the static price table; `cost_usd(model, tokens)`.

## Behavior

- **Truncation guard.** A reply cut off at `max_tokens` raises `LlmError`; it is not retried.
- **Retries** (`retry.py`). litellm retries transport errors (429, 5xx, timeouts)
  `transport_retries` times inside one attempt. The client retries billed content failures (no
  tool call, bad JSON, a reply the output model rejects) up to `attempts` per call and
  `run_retries` per client, then raises `LlmError(retryable=False)`. Never add your own retry
  loop. An asset with a Dagster `RetryPolicy` wraps its LLM work in
  `astra_pipeline_resources.llm_failures_final()`, so Dagster reruns a step only for transport
  failures.
- **Meter** (`meter.py`). Every billed attempt from both the client and the dspy path records
  `astra.llm.attempts`, `astra.llm.tokens`, `astra.llm.cost_usd` and (client only)
  `astra.llm.request_duration_ms`, by `model`, `provider` and `caller`. Each attempt is an
  `astra.llm.call` span.

## Config

`llm.default-model` and `llm.openrouter-api-key` (`sops:openrouter_api_key`). Callers pass
their own model pins (`scribe.model`, `mouthpiece.model`, `heartwood.model`,
`mouthpiece-producer.model`); this library reads config only in `ensure_openrouter_env()`.

## Testing

```sh
uv run pytest libs/py/llm
```

Tests inject `completion_fn` (or a recorded response from `tests/fixtures/responses.json`); no
test touches the network or needs a key.

## Traps

- **`DEFAULT_MODEL` is a code constant** (`client.py`), used only when a caller passes no
  model. Keep it equal to `llm.default-model` in `config.kdl`.
- **A model with no price row is unpriced, not free.** The client records no cost and sets
  the span's `cost_known` to false. Add a row to `PRICING_USD_PER_1M` for every model you
  start using. `cost_usd()` itself returns 0.0 for an unknown model, so don't call it directly
  to decide whether a model is priced.
- **Metric instruments are fetched per call**, never at import: an instrument made before
  `init_telemetry` stays a no-op.
- **The RLM sandbox needs Deno** at `~/.deno/bin` and a warm Pyodide cache. Run
  `just mouthpiece-sandbox-warm` or `just heartwood-sandbox-warm` once on a new host.
