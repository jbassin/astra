---
name: reboot-boot-traps-2026-07-29
description: The 2026-07-29 disk-full incident + first-reboot-in-108-days — the boot traps it exposed (caddy CF token, caddy NPROC, gdrive OAuth, stale units) and the truncating-write state-file class, all fixed
metadata:
  type: project
---

PROJECT 2026-07-29 **disk-full incident RECOVERED same session** (`151b331` scriptorium
hardening · `e4b93b4` caddy boot fix): the box filled, was resolved + rebooted — the
**first reboot since Apr 12 (108 days)**, so every boot path added since June ran for the
first time and several latent traps fired at once.

**⭐ The reboot boot-traps (all fixed, but the CLASS is the lesson — a long-uptime box
accumulates never-exercised boot paths; after any incident-reboot, sweep `journalctl -b
-p err` + `systemctl --failed` before trusting "containers look healthy"):**

- **caddy trap 1 — no CF_API_TOKEN at boot:** the systemd unit starts caddy bare; the
  SOPS-decrypted token only ever exists in `just caddy-reload`'s environment (by design,
  never on disk). Boot-adapt died on `tls: missing API token` → the ENTIRE `*.iridi.cc`
  edge refused connections. Fix: `{$CF_API_TOKEN:unset-at-boot}` default in
  `sites.caddyfile` (`e4b93b4`) — parses at boot, serves from cached certs. **Caveat:
  the `{$VAR:default}` default applies only when VAR is truly UNSET (empty-but-set still
  fails); ACME renewals fail on the placeholder, so run `just caddy-reload` after any
  reboot.** `/emerald` is a symlink to `/ruby` — one Caddyfile, no divergence.
- **caddy trap 2 — stock `LimitNPROC=512` vs run-as-1000:** after the fix above, restart
  died at `status=203/EXEC "Resource temporarily unavailable"`. uid 1000 carries **845
  threads** (the [[deploy-artifacts-run-as-user]] cutover put all 13 app containers on
  uid 1000); setuid under RLIMIT_NPROC=512 → EAGAIN. Caddy never hit it before because
  it last COLD-started before that cutover. Fix: root drop-in
  `/etc/systemd/system/caddy.service.d/nproc.conf` → `LimitNPROC=infinity`.
- **gdrive OAuth state lost** (disk-full ate the refresh token; boot fell into
  interactive-auth mode, `approval_prompt=force` in the log is the tell — restarts can
  NOT fix it). Recovery one-liner (stakeholder runs it, needs a browser):
  `google-drive-ocamlfuse -headless -label default -id "$(sed -n 's/^client_id=//p'
  ~/.gdfuse/default/config)" -secret "$(sed -n 's/^client_secret=//p'
  ~/.gdfuse/default/config)"` then `sudo systemctl restart gdrive.service`. Until then
  craig-sync nullglobs "0 new" silently ([[astra-alerting-setup]] blind spot).
- **stale faerrin `vellum-render.service`** (system unit → deleted faerrin tree,
  `Restart=always`/3 s) crash-looped since boot flooding the journal — disabled. Sweep
  for pre-astra units after decommissions.

**⭐ The truncating-write state-file class:** scriptorium's `/api/reviewed` used bare
`Path.write_text` → disk-full truncated `state/reviewed.json` to **0 bytes**, and the
parse error then 500'd `/api/state` — wedging every client's sync loop (the reviewer's
"backed up awaiting sync" report, compounded by the edge being down). Fixes in
`151b331`: fail-soft `_read_reviewed()` (corrupt/empty → `{}`), atomic temp+`os.replace`
write, and client boot-time **`reconcileMirror()`** — reviewed flags/comments the
localStorage mirror holds but the server lost are re-applied AND re-queued. Without it,
the first successful `/api/state` fetch + `saveMirror()` would have DESTROYED the
phone's last copy of the lost flags (server-state-wins was the latent data-loss path in
`72dc4b5`'s otherwise-load-bearing outbox/mirror design). Use atomic replace for every
read-modify-write state file; append-only JSONL (`comments.jsonl`) survived untouched.

**Recovery reconstruction trick:** the reviewed map's base was rebuilt EXACTLY as
{store 174} − {fleet lane ledgers 142} = the frozen 32 ([[assay-0030-gotchas]]) — lane
`results/homebrew-fleet/lane*.findings.json` slugs double as a reviewed-set snapshot.

**⚠ [[shell-output-reliability]] struck again:** `ps h -Lu jbassin | wc -l` reported 31;
the `/proc/*/status` walk (single-process Python) reported 845 — the /proc walk is the
trusted counter for per-uid task counts.
