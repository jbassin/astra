# vellum-frontend — the vellum document editor

vellum-frontend is a browser editor for vellum documents (statblocks, handouts, deity cards and
other gothic cards) with a live preview and PNG export, at `https://vellum.iridi.cc`. It is a
TanStack Start SSR app on the strider template (see `apps/strider/web/README.md`): Compose service
`vellum-frontend`, port 10367, `service.name=astra.vellum-frontend`. PNG export calls its sibling
service `apps/vellum/render` (port 10368). Documents live only in the browser (localStorage, plus
lz-string share links); there is no backend store.

## How the pieces connect

- The editor is the `/editor` route with `ssr: false`, so CodeMirror and the preview never run
  on the server. Its code is in `src/domain/editor/`.
- The preview is `parseDocument` (`@astra/vellum-lang`) into gothic `DocumentView`, with no
  wiki-link resolver, so `[[links]]` show as placeholders.
- Export POSTs to same-origin `/render`. In production Caddy sends `/render` and `/health` to
  vellum-render (10368) and everything else here; `/editor` is limited to the local network
  (`sites.caddyfile`). In dev, `vite.config.ts` proxies `/render` and `/health` to the
  vellum-render port from `config.kdl`, so dev and prod share the same contract with no env var.

## Traps

- **Keep the editor's sigil highlighting in step with the parser.** `sigilSync.test.ts` asserts
  that every sigil the editor highlights (`@<action>`, `#trait`, `||redact||`) is lowered by
  `parseDocument`. If you add a sigil to vellum-lang, update `SIGIL` in the editor too.
- **A new vellum block kind needs an editor slash snippet** (`slashComplete.ts`) and a template;
  see the checklist in `libs/ts/gothic/README.md`.
- **Theme colours are gothic's `--color-*` variables**, used by the CodeMirror theme and the one
  CSS module (`editor.module.css`).
- **The editor root is a flex child of `<body>`**: size it with `flex: 1`, not `height: 100%`.
- Changing gothic or vellum-lang can change export PNGs; the golden-image gate lives in
  `apps/vellum/render`.
