---
name: tanstack-start-skill
description: before changing a TanStack Start frontend, read the site-kit and gothic READMEs and the TanStack skills bundled with the installed packages
metadata:
  type: reference
---

astra's SSR frontends (strider, akasha-frontend, mouthpiece-frontend, vellum-frontend, harrow,
ledger, codex) are TanStack Start apps on the site-kit preset; a new one starts from
`just new-frontend <name>`. Before adding server-side behaviour or a new frontend:

1. Read `libs/ts/site-kit/README.md` (resolve hook, `--configLoader runner`, SSR smoke traps) and
   `libs/ts/gothic/README.md` (theme import, `@layer base` reset, vellum block kinds).
2. Read the skills shipped with the installed version; they beat online docs and memory:
   `apps/<app>/node_modules/@tanstack/react-start/skills/react-start/SKILL.md`, and the start-core
   sub-skills (server-functions, server-routes, middleware, execution-model) under
   `node_modules/.pnpm/@tanstack+start-client-core@*/node_modules/@tanstack/start-client-core/skills/start-core/`.

Loaders are isomorphic. astra puts server-only work in `createServerFn`, defined in app source (the
vite plugin does not transform server functions in a workspace lib). Server routes
(`createFileRoute(...)({ server: { handlers } })`) exist in the installed start-core, but astra has
not used one yet; read the server-routes skill before adding the first.
