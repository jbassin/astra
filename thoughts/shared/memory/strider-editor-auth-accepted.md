---
name: strider-editor-auth-accepted
description: the strider editor write endpoint's missing auth is a deliberate, accepted risk — do not re-flag it
metadata:
  type: project
---

The strider editor's write path is a TanStack Start server function (`writeLayerFn`
→ `scripts/writeLayer.ts`) that POSTs to `/_serverFn/*`. The Caddy edge gates the
`/editor` **UI** route to private IPs (`import local_only`), but the server-fn path
is on the open fallthrough — so the write *endpoint* is reachable by anyone who can
reach the service. This is **accepted, won't-fix** (decided 2026-06-21 during the
strider template review).

**Why:** these are personal, low-traffic sites; the probability of a bad actor
finding+abusing the server-fn route is low, and the cost/complexity of real auth
(session/CSRF/middleware) outweighs it. Crucially the damage is already bounded —
`scripts/writeLayer.ts` is well-validated: filename allowlist regex, `path.resolve`
+ `startsWith(LAYERS_DIR + path.sep)` traversal guard, 64 KiB cap, and `wx`
no-overwrite. So the worst case is planting *new* `content/layers/*.md` files (live
on next build) or filling disk with uniquely-named small files — no traversal, no
overwrite, no RCE.

**How to apply:** do NOT re-raise "editor write endpoint lacks auth" as a finding for
strider or any frontend copied from it (0011–0013) — it's a known accepted trade-off,
not an oversight. Two caveats that WOULD change the calculus and should be surfaced:
(1) if a copied site is deployed to a higher-traffic or public/multi-tenant context,
re-evaluate; (2) the editor must never start rendering attacker-writable layer
content as HTML — today layer `body` is stored raw and never passed through
`toHtml`/`dangerouslySetInnerHTML`, so the auth gap can't become stored XSS; if that
ever changes, the risk acceptance is void. The cheap mitigation if ever wanted: don't
ship the editor route/server-fn in production builds at all (authoring is dev-time).
Full context in thoughts/shared/research/2026-06-21-strider-template-review-thoughts.md.
Related: [[tanstack-start-skill]].
