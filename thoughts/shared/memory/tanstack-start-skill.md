---
name: tanstack-start-skill
description: when working on astra's TanStack Start frontends (strider + 0011-0013), read the package's bundled SKILL.md FIRST — it's authoritative for the pinned version's patterns
metadata:
  type: reference
---

astra's frontends are **TanStack Start** (`@tanstack/react-start`) apps. The package ships a
Claude skill doc — read it before adding any server-side behavior:

`apps/strider/node_modules/@tanstack/react-start/skills/react-start/SKILL.md`

It documents the canonical patterns for the **pinned** version (react-start **1.168**), which
differs from the current online docs — verify against the installed package's exports, not memory.

Load-bearing fact: the server-side primitive is **`createServerFn`** (`.validator().handler()`;
called via RPC, POSTs to `/_serverFn/*`). This version has **no file-based server/API routes** —
`createServerFileRoute` / `createAPIFileRoute` are not exported here (a newer-version example
mentions them), and `createFileRoute` is **page-routes only**. TanStack Start *owns* POST (that's
how it routes server functions), so a vite/connect middleware never sees a `POST /your-path` —
don't reach for middleware or a custom server route; use `createServerFn`.

**Why:** porting strider's editor write, I reinvented it as a vite middleware + a `server.ts`
POST branch before the SKILL.md/exports showed `createServerFn` was the one right answer — a
wasted detour. **How to apply:** any new server-side endpoint in a frontend → `createServerFn`;
consult the bundled SKILL.md for the version's idioms first. [[verify-before-acting]].
