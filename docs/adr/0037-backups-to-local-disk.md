# 0037. Nightly backups go to the local sda disk only

- **Date:** 2026-10-22
- **Status:** Accepted (done)
- **Source:** [2026-10-22-techdebt-paydown-0037-thoughts.md](../../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) (section 0.1, Phase 0 item 8)

## Context

Nothing outside git was backed up: three databases, the orator music library, OAuth state, alert rules.

## Decision

`astra-backup.timer` writes a snapshot nightly to `/ruby/data/plex/data/astra-backups/` on a different disk from the live data: Postgres dumps, every data-root directory (hardlinked), and the SigNoz rules. Retention is 14 daily plus 8 weekly. No encryption and no off-host copy (Josh's choice). The SOPS age key's second copy is in Josh's password manager.

## Consequences

A host loss loses the backups too. `just backup-restore-test` proves a snapshot restores.
