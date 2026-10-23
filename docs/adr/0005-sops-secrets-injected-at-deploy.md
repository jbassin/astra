# 0005. Secrets are SOPS-encrypted in the repo and injected at deploy

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision E)

## Context

Services need API keys and tokens, and nothing plaintext may sit in git.

## Decision

Secret values live in `deploy/sops/secrets.enc.yaml` (age). `config.kdl` holds only `ref="sops:KEY"` pointers. Containers never decrypt: `just deploy` decrypts on the host and passes each key as an upper-cased environment variable, which the config libraries' env-override path resolves first.

## Consequences

No image holds `sops`, the age key or a secret. A plain `docker compose up` starts services without secrets; with fail-closed secrets ([0036](0036-secrets-fail-closed.md)) the affected services refuse to start. A service that gains a `ref=` needs its key added to its compose `environment:` block.
