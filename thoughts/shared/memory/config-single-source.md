---
name: config-single-source
description: ALL config lives in ontology/ontology-config/config.kdl and is read via astra_config (py) / @astra/config (ts); hardcoded or duplicated config is a bug
metadata:
  type: feedback
---

Every config value lives in `ontology/ontology-config/config.kdl` and is read through
`astra_config` (`libs/py/config`) or `@astra/config` (`libs/ts/config`). That includes tuning
constants: model ids, thresholds, chunk sizes, ports, paths. Each language's loader validates only
the namespaces its apps read; Pydantic's `WholeConfig` holds every namespace and one CI test
validates the whole file against it. A namespace TS reads is mirrored field for field in both
schemas.

Only the config libraries resolve config and secrets. Their env override (the upper-cased SOPS key
wins over the file) is the sanctioned mechanism. Any other `os.environ`/`process.env` read of a
config value, or a hardcoded `sops:` ref, is wrong. A resolved secret may then be handed to a
transport (for example set in the environment so litellm can read it).

**Why:** one source of truth, no drift between code defaults and deployed config, and Python and
TypeScript parity.

**How to apply:** when you touch or notice a config value, make sure it flows from `config.kdl`
through the config library to the code; if not, move it there: always in Pydantic (`Config` if
Python reads it, else `WholeConfig`), and in Zod too if TS reads it.
Details: [`docs/development.md`](../../../docs/development.md).
