---
name: deploy-apply-with-just
description: a change is live only after commit, push and `just deploy` from the deploy checkout (+ `just caddy-reload` for the edge); local edits never ship
metadata:
  type: feedback
---

Production builds only from the deploy checkout `/ruby/data/astra-deploy` at a pushed commit.
"I changed deploy, edge or app code" is done only after: commit, push, `just deploy [service...]`
(plus `just caddy-reload` for `sites.caddyfile`, which the edge reads from the deploy checkout),
then a check (a curl, or the image's `org.opencontainers.image.revision` label).

**Why:** deploys from the shared working tree shipped other agents' half-finished edits, and nobody
could say which commit was live ([ADR 0033](../../../docs/adr/0033-deploy-checkout-and-just-deploy.md)).

**How to apply:** never edit the deploy checkout; an unpushed commit or a dirty checkout is refused.
A changed systemd unit file needs its install recipe re-run; a changed script goes live with the
next deploy. A deleted compose service leaves an orphan container: `docker rm -f` it. Details and
exit codes: [`deploy/README.md`](../../../deploy/README.md) and the header of `deploy/deploy.sh`.
