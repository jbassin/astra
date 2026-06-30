---
name: astra-alerting-setup
description: Stack-wide alerting (Discord) — IN PROGRESS. Baseline had ZERO SigNoz alerts/channels; webhook provisioned in SOPS; SigNoz channel + alert rules + host OnFailure handlers + liveness watchdog still to build. Has the resume plan.
metadata:
  type: project
---

PROJECT 2026-06-29 — **IN PROGRESS (half-built).** Triggered by the craig-sync FUSE-wedge incident
([[pipeline-live-run-gotchas]]): the pipeline silently stalled for ~6h and **nothing alerted** because
the stack had **zero alerting wired**. Goal: route stack breakage to a **Discord** ops channel.

## Baseline (verified 2026-06-29 via signoz MCP)
`signoz_list_alert_rules` → `[]` and `signoz_list_notification_channels` → `[]`. SigNoz collects
traces/metrics/logs but **nothing fires** — you find breakage by looking. Greenfield.

## Design — three failure classes, each its own mechanism
- **Class A (in-band, emits telemetry):** service throws / error-rate / failed Dagster asset / LLM error
  after retries → already in SigNoz → add **SigNoz alert rules** (e.g. `severity_text IN ('ERROR','FATAL')`
  count>0 over 5m grouped by `service.name`) → Discord channel.
- **Class B (silent absence / deadman):** pipeline produces nothing, no error. **Do NOT alert on "no
  episode for N days"** — sessions are irregular, it'd cry wolf. Instead a host **liveness watchdog**
  (infra health: Drive mount responsive + craig-sync.timer active & armed) — fires only on real breakage,
  second angle on the wedge.
- **Class C (out-of-band host failures, ZERO telemetry):** the craig-sync wedge — a host systemd oneshot,
  SigNoz blind. Cover with **`OnFailure=` on the host timer units** → direct Discord curl. Only works
  because the [[pipeline-live-run-gotchas]] watchdog now makes the unit **fail** (not hang); a hung unit
  never triggers `OnFailure`. **Host handlers curl Discord directly (not via SigNoz)** so a paging path
  survives even if SigNoz/the collector is down.

## DONE so far
1. **Discord webhook created** (by Josh, in a Discord ops channel) + **live-verified** — a test `curl`
   POST returned **HTTP 204**; Josh confirmed it landed ("it worked").
2. **Webhook stored in SOPS** as key **`alert_discord_webhook_url`** in `deploy/sops/secrets.enc.yaml`
   (encrypted, round-trip verified; follows the `dice_feed_url` webhook-secret precedent). Decrypt on host:
   `SOPS_AGE_KEY_FILE=deploy/sops/age.key sops -d --extract '["alert_discord_webhook_url"]' deploy/sops/secrets.enc.yaml`.
   **NOTE: the URL transited the chat transcript → Josh may want to rotate it** (delete+recreate in
   Discord, re-`sops set`) once the build is confirmed.

## ▶ RESUME — remaining build (nothing below is started)
Discord webhooks are **Slack-compatible** → append **`/slack`** to the URL for SigNoz's slack channel type,
or POST Slack/Discord-native JSON directly for host curls (`{"username":..,"content":..}`, content ≤2000 chars).

1. **SigNoz Discord notification channel** — `signoz_create_notification_channel` type=`slack`,
   `slack_api_url=<webhook>/slack`, name e.g. `discord-ops`. Auto-sends a test. SigNoz uses its **bundled
   alertmanager** (`SIGNOZ_ALERTMANAGER_PROVIDER=signoz`) → channels/rules live in SigNoz's API/DB, **not a
   static alertmanager.yml** → manage via the `signoz_*` MCP tools, nothing to commit to git.
2. **SigNoz alert rule(s)** (Class A) → discord-ops. **MUST read the MCP resources first**:
   `signoz://alert/instructions` + `signoz://alert/examples` (via ReadMcpResourceTool) — the payload schema
   is fiddly (v2alpha1 threshold vs v1 anomaly). Start with one error-log alert across services.
3. **Host `OnFailure=` handler** — a shared script `deploy/systemd/alert-notify.sh` (decrypts the webhook
   from SOPS; subcommands `failure <unit>` / `watchdog` / `test`; `set -uo pipefail` NO `-e` so alerting
   never self-fails; truncate journal logs <~1500 chars). A templated unit `astra-alert@.service`
   (`ExecStart=…/alert-notify.sh failure %i`). Add **`OnFailure=astra-alert@%n.service`** to BOTH
   `deploy/systemd/craig-sync.service` and `linguist-commit.service` (neither has it today).
4. **Class B watchdog** — `astra-watchdog.{service,timer}` (`OnCalendar=*:0/15`) → `alert-notify.sh
   watchdog`: bounded mount probe (reuse the `kill -0`-poll/never-`wait` pattern — `timeout` is useless on
   D-state) + check each timer is `is-active` AND has a real `NextElapseUSecRealtime` (the `Trigger: n/a`
   wedge symptom). Add **transition debounce** (state file per check; alert on ok→bad and bad→ok only) so a
   15-min timer doesn't spam. Inherent limit: a watchdog that is itself a user timer can't detect its own
   death / a dead user-systemd session — note it (truly external deadman would need off-host).
5. **Install** — new `just` recipe (mirror `craig-timer-install` `justfile:134-142`): copy the new unit
   files → `~/.config/systemd/user/`, `daemon-reload`, `enable --now astra-watchdog.timer`, and **re-copy
   the two edited `.service` files** (install recipes copy units verbatim). `alert-notify.sh` stays in the
   repo (units ExecStart its absolute path) — no copy needed.
6. **Test** each: deliberately fail craig-sync (e.g. point CRAIG_DROP_DIR at an unreadable path) → expect a
   Discord post; run the watchdog by hand; create the SigNoz alert and confirm a test notification.

## Recon facts (so the next session doesn't re-derive)
- **SOPS:** one file `deploy/sops/secrets.enc.yaml` (yaml), age recipient in `deploy/sops/.sops.yaml`,
  **private key on host** at `deploy/sops/age.key`. Add a key: `sops set …enc.yaml '["k"]' '"v"'`.
- **Host→OTLP path exists** (if you'd rather route host events through SigNoz instead of direct curl):
  collector OTLP HTTP is host-published at **`localhost:10353`** (`/v1/logs`), precedent in
  `deploy/telemetry-smoke/`. Decided AGAINST for host handlers (direct Discord is more robust).
- **`ref=` resolution / injection:** [[deploy-sops-injection]] + [[config-single-source]]. The alert
  webhook is consumed by **host glue + SigNoz**, not an app, so it needs **no config.kdl `ref=` pointer**
  and no py/ts schema change (deliberate — keep it out of app config).

Builds on [[pipeline-live-run-gotchas]] + [[deploy-sops-injection]] + [[signoz-mcp]] + [[no-ci-monitoring]].
