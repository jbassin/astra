---
name: migration-guide
description: REFERENCE — read the migration playbook before porting any non-TanStack app (esp. frontends 0011–0013) into astra
metadata:
  type: reference
---

Before starting any app migration — especially the remaining frontends 0011–0013 — read
**`thoughts/shared/guides/migrating-an-app-into-astra.md`**: the sequenced how-to
(scope→spec→implement, the 7 frontend phases A–G, a framework-translation cheat-sheet)
plus a comprehensive **dos & don'ts** and the load-bearing gotchas.

Pairs with **`apps/strider/README.md`** (the concrete copy-this-app port recipe) and
the gotchas in [[strider-0016-gotchas]]. Honors [[verify-before-acting]],
[[no-silent-scope-cuts]], [[config-single-source]], [[telemetry-built-in]],
[[deploy-apply-with-just]], [[no-ci-monitoring]]. Don't duplicate `CONTRIBUTING.md`
(dev process + gotchas catalog §8) — the guide cross-references it.
