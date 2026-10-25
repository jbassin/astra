# astra-smoke-substrate — an end-to-end check of the Python libraries

`astra-smoke-substrate` exercises the shared Python libraries together: it loads `config.kdl`
(`astra_ontology_config`), resolves the OpenRouter key from SOPS, checks that `being.kdl`
still matches the committed `being.canonical.json`, and makes one structured LLM call on
`llm.default-model`, all inside one `substrate-smoke` span (service `astra.smoke-substrate`).
Nothing imports it, and no timer or deploy runs it.

- **Offline test** (in `just py-test`): `uv run pytest apps/_smoke/py`. It runs `run()` with a
  stubbed completion and sets `OPENROUTER_API_KEY`, so it needs no SOPS key or network.
- **Live run**: `uv run astra-smoke-substrate` from a checkout. It needs the real
  `openrouter_api_key` and makes one small paid OpenRouter call.

The test asserts the real file contents: the model id `openrouter/z-ai/glm-5.2` and five
players in `being.kdl`. Changing `llm.default-model` or the roster breaks it; update the test
in the same change.
