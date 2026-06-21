---
name: deploy-sops-injection
description: How SOPS secrets reach containers at deploy — just up decrypts on the host + injects env; the in-container decrypt path is intentionally dead
metadata:
  type: project
---

**Containers never decrypt SOPS themselves.** The slim runtime images have **no `sops` binary, no
`deploy/sops` (secrets file + age key)** — by design. Secrets reach a container via the **env-override
path**: `@astra/config` (both ts `resolveSopsRef` and py `resolve_sops_ref`) checks
`process.env[KEY.upper()]` **first**, before any SOPS file decrypt. So the deploy injects decrypted
values as env vars.

**`just up` is the injection point** (roadmap Decision E, finally built 2026-06-21 — commit `20195ec`):
the recipe is a bash shebang that `sops -d --output-type dotenv` the secrets file on the host (age key at
`deploy/sops/age.key`, host-only), exports each key **UPPER_CASED** (`weal_discord_key` → `WEAL_DISCORD_KEY`),
then `docker compose up`. Each service's compose **`environment:`** block passes through only the keys it
needs (`${KEY:-}`), scoping each container to its own subset. No plaintext file on disk; no secret in any image.

**Why this was load-bearing:** before it, NO containerized service could resolve a secret at runtime, so
*every* secret-dependent deployment was silently broken — **weal-bot crash-looped** on `client.login("")`
(its `@astra/observe` logs go to OTLP not stdout, so `docker logs` showed nothing — use `rtk proxy docker
logs` to bypass the log-summary filter, and remember the real error may only be in SigNoz). orator ran
bot-disabled (503), and Dagster pipeline LLM/Groq calls would fail on materialization. The token *was* set
in SOPS; the container just couldn't decrypt it.

**Wired so far** (add a service's keys to its `environment:` when it gains a `ref="sops:KEY"`): weal-bot
(`WEAL_DISCORD_KEY`, `WEAL_TOKEN`), weal-overlay (`WEAL_TOKEN`), orator-backend (`ORATOR_DISCORD_KEY`,
`ORATOR_DISCORD_CLIENT_ID/SECRET`, `ORATOR_SESSION_SECRET`), and the **`x-dagster-env` anchor**
(`ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY` — inherited by code server + daemon + run
workers). `dice_feed_url` is intentionally NOT provisioned (lands at cutover) → resolves empty, feature off.

**Status change:** weal's `weal_discord_key` is a **real token** — so weal-bot now runs **live** (healthy,
Discord login succeeds, speak server on 10203). This **resolves the "live Discord run deferred on SOPS
secrets"** caveat in `[[weal-0009-gotchas]]` for the secret-injection reason. orator gets the same injection;
its bot goes live iff `orator_discord_key` is real (was noted as a placeholder — verify before claiming).
Running `docker compose up` directly (not via `just up`) leaves the env empty → services degrade (weal-bot
would crash) — `just up` is the supported path. See `[[deploy-apply-with-just]]`, `[[config-single-source]]`.
