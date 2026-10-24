# Runbook

Recovery procedures, each as numbered steps with commands that exist today. Routine live steps
need no approval ([CLAUDE.md](../CLAUDE.md) "Live steps"); paid steps and replacing published
content get a one-line flag first. Run host commands from the main checkout unless a step says
otherwise; `just deploy` always builds from the deploy checkout.

Contents: [after a reboot](#after-a-reboot) · [certificates](#certificates-expired-or-not-renewing) ·
[Drive mount](#drive-fuse-mount-down) · [NIC](#nic-link-corrupting-frames) ·
[deploy failed or rollback](#deploy-failed-or-rollback) · [disk full](#disk-full) ·
[restore from backup](#restore-from-backup) · [alerting](#alerting-checks) ·
[pipeline](#pipeline-partition-failed) · [heartwood](#heartwood-session-held-or-wrong) ·
[mouthpiece](#mouthpiece-re-render-an-episode) · [codex](#codex-refresh-or-republish) ·
[portal](#portal-module-update-and-headless-gm) · [orator](#orator-youtube-imports-fail) ·
[main campaign](#switch-the-main-campaign) · [republish](#republish-pipeline-output-by-hand)

## After a reboot

A long-uptime host collects boot paths that never ran. Sweep them before trusting "the containers
look healthy".

1. List errors and failed units:
   ```sh
   journalctl -b -p err --no-pager | tail -50
   systemctl --failed; systemctl --user --failed
   ```
2. Check that the Docker services came back: `docker ps --format '{{.Names}} {{.Status}}' | sort`.
3. Check the edge and a certificate: `curl -sI https://akasha.iridi.cc | head -1`. If TLS fails, see
   [certificates](#certificates-expired-or-not-renewing).
4. Check the Drive mount (from a real shell, not the Claude sandbox):
   `findmnt /ruby/data/home/drive`. If it is missing, see [Drive mount](#drive-fuse-mount-down).
5. Check the host timers are armed: `systemctl --user list-timers --no-pager`.

## Certificates expired or not renewing

The edge reads the Cloudflare token from the root drop-in
`/etc/systemd/system/caddy.service.d/cf-token.conf` (an `EnvironmentFile`). Renewal jobs keep the
token they started with, so a `just caddy-reload` cannot repair renewals that started without it;
only a process restart does.

1. Look for ACME errors: `journalctl -u caddy --since -1d | grep -i -E 'acme|renew|6003' | tail`.
   Cloudflare error `6003 Invalid request headers` means the placeholder token.
2. Make sure `/etc/caddy-cf.env` exists and holds `CF_API_TOKEN` (root, mode 600).
3. Restart the edge (sudo, Josh): `sudo systemctl restart caddy`.
4. Re-apply astra's sites: `just caddy-reload`.
5. Verify an expiry date:
   `echo | openssl s_client -connect akasha.iridi.cc:443 -servername akasha.iridi.cc 2>/dev/null | openssl x509 -noout -enddate`.

The `(astra_site)` snippet in `sites.caddyfile` sets `propagation_timeout -1`, because the wildcard
`CNAME` makes Caddy's DNS propagation check fail.

## Drive FUSE mount down

craig-sync copies Craig recordings from the Google Drive mount at `/ruby/data/home/drive`
(`gdrive.service`, a system unit). The watchdog repairs a wedged or vanished mount by itself every
15 minutes and posts a notice. Recordings that sat in Drive are picked up on the next craig-sync
run, so nothing is lost.

1. Check the mount from a real shell: `findmnt /ruby/data/home/drive` and
   `systemctl status gdrive.service`.
2. Restart the daemon (the sudoers drop-in allows this without a password):
   `sudo systemctl restart gdrive.service`.
3. If the mount is wedged (any access hangs), never `ls` it. Detach it, then restart:
   `fusermount -uz /ruby/data/home/drive && sudo systemctl restart gdrive.service`.
4. If the log shows `approval_prompt=force`, the OAuth token is lost and restarts cannot fix it.
   Josh re-authorizes in a browser:
   ```sh
   google-drive-ocamlfuse -headless -label default \
     -id "$(sed -n 's/^client_id=//p' ~/.gdfuse/default/config)" \
     -secret "$(sed -n 's/^client_secret=//p' ~/.gdfuse/default/config)"
   sudo systemctl restart gdrive.service
   ```
5. Pull any waiting recordings now: `systemctl --user start craig-sync.service`.

The watchdog's sudo rules are installed once with `just alert-sudoers-install`.

## NIC link corrupting frames

Symptom: small requests work but bulk transfers stall. The watchdog pages on any growth of
`rx_crc_errors` on `enp4s0` and retrains the link itself (first at full speed, then at 100 Mbit full
duplex).

1. Check the counter and loss: `ethtool -S enp4s0 | grep crc` and a ping to the gateway.
2. Retrain: `sudo ethtool -r enp4s0`.
3. Stopgap if errors continue: `sudo ethtool -s enp4s0 advertise 0x008` (autonegotiation stays on;
   never use `autoneg off`).
4. Swap the cable. Then restore gigabit by hand: `sudo ethtool -s enp4s0 advertise 0x03f`.

## Deploy failed or rollback

`just deploy` prints an exit code; the header of `deploy/deploy.sh` explains each one (3 lock busy,
4 target not pushed, 5 deploy checkout dirty, 6 SOPS decrypt failed, 7 compose failed, 8 astra-data
clone missing, 9 host tooling sync failed or its lock busy, 10 started but not healthy, 11 skipped:
that build already failed at this code and data).

1. See what is live: `docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' astra-codex`
   (any container), or `tail /ruby/data/astra-state/deploy/history.jsonl`.
2. On exit 10 the deploy has printed the failing containers, their last log lines and the rollback
   command. Nothing was rolled back; the new containers keep running until you act.
3. Roll back to an older pushed commit: `just deploy --sha <sha> [service...]`. That pins
   production: later deploys without `--sha`, the bots' included, build the pinned sha and warn.
   After the fix is on `main`, unpin with `just deploy --sha origin/main`.
4. Dry-run the checks without building: `just deploy --dry-run`.
5. Never run a bare `docker compose up`: services start without secrets and the fail-closed ones
   crash-loop. Use `just deploy <service>`; `just deploy --restart <service>` restarts without a
   build.

## Disk full

A full disk truncates files written in place and has emptied state files before.

1. Check: `df -h /ruby` and `docker system df`.
2. Prune dangling images and build cache (routine):
   `docker image prune -f && docker builder prune -f`. Never `prune -a` on the shared daemon without
   Josh's explicit yes.
3. Check the backup disk too: `df -h /ruby/data/plex`.
4. After recovery, run the [reboot sweep](#after-a-reboot) if the host was restarted, and look for
   zero-byte state files under `/ruby/data/astra-state`.

## Restore from backup

Snapshots are under `/ruby/data/plex/data/astra-backups/` (`latest` is the newest). The header of
`deploy/systemd/astra-backup.sh` has the full layout.

1. Prove a snapshot restores before using it: `just backup-restore-test` (or
   `just backup-restore-test <snapshot>`).
2. Postgres: stop the app container (for example `docker stop astra-weal-bot`), then
   ```sh
   docker exec -i astra-weal-postgres pg_restore -U weal -d weal --clean --if-exists \
     --no-owner --single-transaction < /ruby/data/plex/data/astra-backups/latest/postgres/weal.dump
   ```
   and `just deploy weal-bot`. The orator and dagster databases work the same way.
3. State: `rsync -a /ruby/data/plex/data/astra-backups/latest/state/<dir>/ /ruby/data/astra-state/<dir>/`
   (for example `audio/orator`).
4. Alert rules: re-create each `latest/signoz/rules/*.json` with the `signoz_create_alert` tool, and
   re-create the `discord-ops` channel from the SOPS key `alert_discord_webhook_url` (Slack type,
   URL plus `/slack`).
5. Take a fresh snapshot: `just backup-now`.

## Alerting checks

Three paths page the Discord ops channel: the SigNoz rule `astra error/fatal logs`, `astra-alert@`
for failed host units, and the watchdog for silent absence.

1. Send a test page: `deploy/systemd/alert-notify.sh test`.
2. Run the watchdog without paging:
   `XDG_STATE_HOME=$(mktemp -d) ALERT_DRY_RUN=1 deploy/systemd/alert-notify.sh watchdog`.
3. After editing a unit file, reinstall: `just alert-install` (watchdog and alert units) or
   `just backup-install`.
4. Turn off the watchdog's self-repair for an investigation: set `WATCHDOG_REMEDIATE=0` in a
   drop-in for `astra-watchdog.service`.
5. Export the SigNoz rules into git after changing them: `just signoz-rules-export`.

## Pipeline partition failed

Each session is a Dagster partition. The detailed commands (GraphQL calls, container paths) are in
[`dagster/README.md`](../dagster/README.md#operations).

1. Find the failed run in the Dagster UI (`dagster.iridi.cc`, local network) or in SigNoz
   (`service.name = astra.pipeline`, ERROR logs from `pipeline_failure_alert`).
2. Fix the cause, commit, push and `just deploy dagster-code` first if code changed. Check for
   in-flight runs before redeploying Dagster: a redeploy kills them.
3. Re-execute from failure in the UI, or with `launchRunReexecution` (strategy `FROM_FAILURE`).
   This reuses finished outputs, so paid steps that already succeeded are not repeated.
4. To re-run a session from scratch, follow "Re-run a session from scratch" in the Dagster README
   (delete the session's outputs and its dynamic partitions; the sensor re-registers it).
5. A Craig zip whose name has no date is skipped silently: hard-link it under a dated name in
   `/ruby/data/astra-state/scribe/incoming` (date from the zip's `info.txt`), keeping the original
   name. See [`apps/scribe/py/README.md`](../apps/scribe/py/README.md#operations).

## heartwood session held or wrong

heartwood runs per session through Dagster: `session_wiki` files a request, and the host unit
`heartwood-request` runs the agent and publishes to astra-data. Run manual commands against the
deploy checkout (`just -f /ruby/data/astra-deploy/justfile ...`) so live data meets deployed code.
Exit codes and details: [`apps/heartwood/py/README.md`](../apps/heartwood/py/README.md#operations).

1. Read the run's log under `/ruby/data/astra-state/heartwood/requests/logs/` and its exit code.
2. Exit 1 or 2 (nothing published): fix the cause, then re-execute `session_wiki` or run
   `just -f /ruby/data/astra-deploy/justfile heartwood-agent <date>`.
3. Exit 7: run the restore command the log prints.
4. Exit 8 or 9 (committed but not pushed or deployed): `just -f /ruby/data/astra-deploy/justfile
   _heartwood-push-deploy`. Do not re-request the date.
5. To redo a session: `just -f /ruby/data/astra-deploy/justfile heartwood-revert <date>`, then let it
   re-run. Exit 4 means the session predates astra-data; undo it by hand there.
6. After a hard-killed backfill: `just -f /ruby/data/astra-deploy/justfile heartwood-backfill-reset`.

## mouthpiece re-render an episode

Paid (ElevenLabs) and replaces published audio: flag it first. Full steps in
[`apps/mouthpiece/py/README.md`](../apps/mouthpiece/py/README.md#operations).

1. Back up the episode dir `/ruby/data/astra-state/mouthpiece/episodes/<date>/`.
2. Materialize the audio steps detached in the container:
   ```sh
   docker exec -d astra-dagster-code sh -c 'cd /opt/dagster/app && dagster asset materialize \
     -f definitions.py --select session_audio_clips,session_episode --partition <date> \
     > /ruby/data/astra-state/mouthpiece/episodes/.rerender-<date>.log 2>&1'
   ```
   Use `sh -c`, not `sh -lc`. A CLI run exports no telemetry.
3. Check the manifest says `mode: "dialogue"`.
4. The `.last-rendered` sentinel triggers `linguist-commit`, which publishes the catalog, seeds the
   audio and redeploys mouthpiece-frontend. Verify the title and a 206 on `/audio/<id>.mp3`.

## codex refresh or republish

Details: [`apps/codex/web/README.md`](../apps/codex/web/README.md#operations).

1. Full refresh from upstream sources: `just codex-refresh` (needs a clean `apps/codex/web`; it fetches,
   transforms, reindexes and restarts codex). Revert a timestamp-only `corpus-manifest.json` diff.
2. Transform only (ingest code or the assay store changed): `pnpm --filter @astra/codex transform`,
   then `just codex-search-index` if search rows changed, then `just deploy --restart codex`.
3. When render code and the corpus both change, `just deploy codex` first, then transform.
4. Verify: the container log's startup line reads `serving the corpus at
   "/ruby/data/astra-state/codex/data/corpus" (source config, <n> entities, ...)`, and a real entity
   page (`/spell/fireball`) returns 200. The server fails closed: with the corpus missing, of another
   `schemaVersion`, or the fixture, it logs a `CorpusUnservableError` and exits, so compose restarts
   it in a loop. Fix the mount or run `just codex-refresh`; `just codex-real-corpus` checks the
   corpus on the host the same way.

## portal module update and headless GM

Details: [`apps/portal/README.md`](../apps/portal/README.md#operations).

1. Module change: bump `version` in `apps/portal/module/module.json`, push, `just deploy portal`.
2. Josh updates the module from Foundry's module list.
3. `just deploy --restart portal-headless`; human GM tabs reload (F5); MCP clients reconnect
   (`/mcp`).
4. Headless GM not in the world: read `curl -s localhost:10373/health` (`world-down` is normal during
   Foundry maintenance). For `not-designated`, check the module setting with
   `game.settings.get("portal", "bridge-user-id")` in a GM console. Last resort:
   `just deploy --restart portal-headless`.

## orator YouTube imports fail

yt-dlp breaks when YouTube changes. Bump `ARG YT_DLP_VERSION` in `deploy/node.Dockerfile` (the `os-ffmpeg` stage),
push, and `just deploy orator-backend`. See [`apps/orator/bot/README.md`](../apps/orator/bot/README.md).

## Switch the main campaign

Exactly one campaign in `ontology/ontology-being/being.kdl` has `main #true`.

1. Flip the flags in `being.kdl`.
2. Regenerate the canonical JSON: write `astra_ontology.canonical_json(astra_ontology_being.load())`
   to `astra_ontology_being.CANONICAL_JSON_PATH` (no recipe yet; `libs/py/ontology/tests/test_ontology.py`
   checks drift).
3. Re-pin the main-campaign tests (`apps/linguist/py/tests/test_chronicle.py`,
   `apps/mouthpiece/py/tests/test_episodes_index.py`).
4. `just ci`, commit, push, `just deploy`.
5. If episodes were published while flipped, run `just mouthpiece-publish` to recompute `is_main`.

## Republish pipeline output by hand

The `linguist-commit` timer normally does this every 15 minutes and on each new episode.

1. Run it now: `just -f /ruby/data/astra-deploy/justfile linguist-commit`. It commits and pushes new
   datasets in the astra-data clone, refreshes the mouthpiece catalog, seeds audio and redeploys
   akasha-frontend or mouthpiece-frontend as needed.
2. The parts, if needed: `just mouthpiece-publish`, `just mouthpiece-seed`, `just akasha-seed`, then
   `just deploy mouthpiece-frontend` or `just deploy akasha-frontend`. A deploy bakes the clone's
   committed HEAD, so commit in the clone first.
