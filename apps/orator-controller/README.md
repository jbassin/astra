# orator-controller — the Stream Deck plugin that remote-controls orator

orator-controller is an Elgato Stream Deck plugin (Node runtime, Elgato SDK) that browses orator's
collections and tags and shows what is playing, over orator-backend's REST API. It is in the pnpm
workspace for typecheck and tests only. It has no Dockerfile and no Compose service: it runs on the
operator's desktop, and it sends best-effort OTLP spans straight to the public `otel.iridi.cc`
endpoint (`src/telemetry.ts`).

## Operations

- **Build the plugin bundle:** `pnpm --filter @astra/orator-controller bundle` (tsc, then tsdown
  into `com.astra.orator.sdPlugin/bin/`).
- **Package a `.streamDeckPlugin`:** `pnpm --filter @astra/orator-controller package` (needs the
  `streamdeck` CLI). CI does not run packaging.
- **Configure on the desk:** in the plugin's property inspector, set the orator origin (for example
  `https://orator.iridi.cc`) and paste an `orator_…` API key minted on orator's Keys page. The plugin
  works only when both are set (`isConfigured` in `src/settings.ts`).

## Traps

- **The plugin cannot mint keys.** It has no web session; key minting is session-gated on
  orator-backend. Mint the key in the SPA and paste it.
- **`com.astra.orator.sdPlugin/` is a packaged-artifact directory** (manifest, property-inspector
  HTML, icons, built `bin/`). It is excluded from linting; `bin/` and `dist/` are gitignored.
- **The workspace runs no `build` task here.** The package has `bundle` and `package` scripts instead,
  so `pnpm -r run build` skips it by design.
- `bundle` runs `tsc --outDir .tsbuild` before tsdown, because rolldown does not lower TC39
  decorators (the Stream Deck SDK's `@action`). Do not point tsdown at the TypeScript sources directly.
