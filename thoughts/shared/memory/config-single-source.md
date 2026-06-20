---
name: config-single-source
description: ALL config must live in ontology/ontology-config and be read via astra_config (py + ts); hardcoded/duplicated config anywhere else is a bug to fix
metadata:
  type: feedback
---

**ALL** configuration in the astra repo must live in `ontology/ontology-config` (the `config.kdl`
single source of truth) and be read through the `astra_config` libraries — `libs/py/config`
(Python, Pydantic `Config`/`LlmConfig`/`LinguistConfig`/…) **and** `libs/ts/config` (TypeScript, the
Zod mirror). The two schema mirrors must stay in lock-step (same field set; `models.py` says so).

Any config value that is **hardcoded in app/lib code, duplicated, or read from anywhere other than
`astra_config`** is *wrong* and must be fixed — moved into `config.kdl` + both schema mirrors and read
via `load_config()`. This includes not just secrets and endpoints but **tuning constants** (model ids,
thresholds, chunk sizes, phonetic floors, ports, paths). Example fixed in gate J (0006-linguist): the
surfacer's `surface/config.py` module constants (`JUDGE_MODEL`, `ESCALATE_*`, `JUDGE_CHUNK_SIZE`,
phonetic floors, …) were hardcoded; they belong in `LinguistConfig` and `config.kdl`. The credential
bridge `astra_llm.ensure_anthropic_env()` must resolve through `cfg.llm.anthropic_api_key` (a
`SecretRef` from config.kdl), **not** a hardcoded `sops:` ref string.

**Config resolution lives ONLY in `astra_config`** (clarified 2026-06-19). The env-var override that
`astra_config.secrets.resolve_sops_ref` does (an env var named after the ref key, upper-cased, wins over
the SOPS file) is the **sanctioned** mechanism and is correct — *not* a bug. What is wrong is any
**other** lib/app reimplementing config/secret resolution — e.g. its own `os.environ.get(...)` read for
a config value, or a hardcoded `sops:` ref string. Other code must call `astra_config`
(`load_config()` → `cfg.<ns>.<field>` / `.resolve()`) and let it handle override→SOPS. A resolved
secret may then be *handed* to a transport (set in `os.environ` purely so litellm can read it, or passed
as `api_key=` to `dspy.LM`), but it is never *sourced* by re-reading env in the consuming lib.

**Why:** one source of truth, no drift between code defaults and deployed config, py/ts parity, and
KDL+SOPS at the edges (standing principle #2). Hardcoded config silently diverges and breaks the single
pane. **How to apply:** when you touch (or notice) any config value, confirm it flows from `config.kdl`
→ `astra_config` → code; if not, move it there and mirror it in both schemas. Relates to
[[astra-migration-research]].
</content>
