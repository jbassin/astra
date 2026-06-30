---
name: astra-alerting-setup
description: Stack-wide Discord alerting — BUILT + LIVE + verified (2026-06-30). Three failure classes: SigNoz error-log rule→discord-ops channel (Class A), host OnFailure handlers (Class C), liveness watchdog (Class B). Webhook in SOPS (may want rotating). Has the load-bearing gotchas.
metadata:
  type: project
---

**UPDATE 2026-06-30 — DONE + LIVE + verified end-to-end.** All three classes built, `git
push`ed (`95735d4`), and live-tested. Discord got real test pages during verification
(expected noise). The webhook **transited the chat again** during SigNoz channel creation →
**still worth rotating** (delete+recreate in Discord, `sops set alert_discord_webhook_url`,
re-run the SigNoz channel + `just alert-install` is unaffected). What shipped + the gotchas:

- **Class A (SigNoz):** `signoz_create_notification_channel` type=`slack` name=**`discord-ops`**
  (`slack_api_url=<webhook>/slack` — Discord is Slack-compatible) + a **threshold LOGS_BASED_ALERT**
  `astra error/fatal logs` (`severity_text IN ['ERROR','FATAL']`, `count()`, groupBy `service.name`,
  target 0 / above / at_least_once, evalWindow 5m, channel `discord-ops`, `disabled:false`). Both
  live in SigNoz's bundled-alertmanager **DB — nothing committed to git** (manage via `signoz_*` MCP).
  Verified `severity_text` is populated (only `INFO` now = healthy) so the field name is right. The
  channel-create call auto-sends a test (it posted OK). NB only `astra.{pipeline,orator-backend,weal-bot,test}`
  emit *logs* today (frontends emit traces) — broaden later (exceptions-based alert, trace error-rate).
- **Class C (host):** `deploy/systemd/alert-notify.sh` (subcommands `failure <unit>`/`watchdog`/`test`;
  `set -uo pipefail` **no -e**; decrypts the webhook from SOPS at runtime; jq-builds the Discord payload,
  ≤1900 chars; `ALERT_DRY_RUN=1` prints instead of paging — keep for testing) + templated
  **`astra-alert@.service`** (`ExecStart=…/alert-notify.sh failure %i`); **`OnFailure=astra-alert@%n.service`**
  added to `craig-sync.service` + `linguist-commit.service`.
- **Class B (host):** `astra-watchdog.{service,timer}` (`OnCalendar=*:0/15`) → `alert-notify.sh watchdog`:
  bounded Drive-mount probe (the **`kill -0` poll, never `wait`** — lifted from `just craig-sync`) +
  each pipeline timer `is-active` AND armed (`NextElapseUSecRealtime` non-empty; the `Trigger: n/a` wedge
  symptom) + **transition debounce** (per-check state file under `$XDG_STATE_HOME/astra-watchdog`, pages
  only ok↔bad; first-run-bad pages, first-run-ok silent).
- **Install:** **`just alert-install`** (copies the new units + RE-copies the two edited services,
  `daemon-reload`, `enable --now astra-watchdog.timer`; `chmod +x` the script which stays in-repo).

### THE gotchas (learned building it)
1. **`OnFailure=` is a `[Unit]` key, NOT `[Service]`.** systemd silently logs `Unknown key name
   'OnFailure' in section 'Service', ignoring` and the handler never fires. Caught only because the real
   install surfaced the warning — `bash -n`/dry-run won't. Verify with `systemctl --user show <unit> -p OnFailure`.
2. **You can't fail craig-sync by pointing `CRAIG_DROP_DIR` at a missing path** — the recipe's
   `shopt -s nullglob` makes a missing dir an empty glob → **exit 0**, no page. It only fails on a real
   *timeout/wedge*. To test the OnFailure chain use **`systemd-run --user -p OnFailure=astra-alert@craig-sync.service.service /bin/false`** (a real failure → auto-triggers the handler) or start the handler instance directly. (The watchdog's own `check_mount` uses `ls`, which *does* fail on a missing path — so it's fine.)
3. **`local a="$1" b="$DIR/$a"` is an unbound-var trap under `set -u`** — `local` expands ALL its RHS
   args before any assignment lands, so `$a` is still unset when `b` is expanded → `a: unbound variable`.
   Split the dependent assignment onto its own `local` line.
4. **Discord webhook is Slack-compatible:** append **`/slack`** for SigNoz's `slack` channel type; for the
   host curl POST Discord-native JSON `{"username","content"}` (content hard-cap 2000 → truncate <1900).
5. **`systemctl --user` is reachable from the automation shell here** (the user session has lingering on),
   so the watchdog/handler are testable in-place. Foreground `sleep` is blocked in this harness → poll with
   `read -t 1` for async OnFailure handlers.

---

<details><summary>Original half-built plan (2026-06-29) — superseded by the 2026-06-30 build above</summary>

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

</details>

Builds on [[pipeline-live-run-gotchas]] + [[deploy-sops-injection]] + [[signoz-mcp]] + [[no-ci-monitoring]] + [[config-single-source]].
