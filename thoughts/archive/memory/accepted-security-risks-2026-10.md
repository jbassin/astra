---
name: accepted-security-risks-2026-10
description: Security findings Josh reviewed and deliberately accepted on 2026-10-22; don't re-flag them in later audits.
metadata:
  type: project
---

On 2026-10-22 Josh reviewed the 0037 security findings and dropped these as accepted risks for a
personal-scale stack:

- The portal module registers its handlers in Foundry's global query registry (players could invoke
  them).
- The Cloudflare token's handling on the host edge (plaintext Caddyfiles, admin API).
- Service ports, including the Postgres instances, published on all interfaces.
- Secret rotation after a secret appears in a chat transcript ("Don't care").
- Public, unauthenticated OTLP ingest at `otel.iridi.cc`.
- The repo staying public, including transcripts and personal-use fonts ("Just leave this public").
- The smaller items: admin-user processes, the bridge key in world settings, the GM password length,
  edge and input gaps, portal auth details, secret hygiene, and assay's `eval`.

**Why:** It is Josh's call for his own stack, made with the evidence in front of him
(`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`, section 0).

**How to apply:** Don't raise these again as new findings or block work on them. Mention one only if
its circumstances change materially (for example, new public write access or a real incident). He
kept the internal Docker network split and fail-closed secrets; those are planned work. Related:
[[strider-editor-auth-accepted]].
