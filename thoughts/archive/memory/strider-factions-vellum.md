---
name: strider-factions-vellum
description: strider faction files are vellum (.vellum) rendered via gothic DocumentView — one document per faction, build-only render
metadata:
  type: project
---

strider's `content/factions/*` are **vellum** (`.vellum`), migrated from
YAML-frontmatter markdown on 2026-06-24 (`8161283`). This completes the intent
noted in [[strider-layers-kdl]] (factions → vellum). **Layers are KDL; factions
are vellum** — two different formats, by design.

**Shape (user-chosen): one vellum document per faction.** The faction file is
frontmatter (`name`/`color`/`symbol`, read via gray-matter) + a single vellum
body. `parseFaction` in `scripts/build-content.ts` renders the WHOLE body to one
HTML blob; `FactionDetail` injects it under `++ DOSSIER ++`. There is no longer a
structured member split — the old `splitBody` / `Member` type / `## Known
Members` personnel cards are gone; personnel now appear as in-document headings
inside the rendered body.

**Load-bearing facts:**
- Render path = `renderToStaticMarkup(createElement(DocumentView, { document:
  parseDocument(src), resolveCrossref: () => null }))` — the same gothic renderer
  the akasha wiki uses. Factions have no wiki, so the crossref resolver is a
  no-op. Build-only: `react-dom/server` + gothic's renderer + `@astra/vellum-lang`
  run in the bun build subprocess and never reach the client bundle (the route
  injects baked HTML via `dangerouslySetInnerHTML`).
- `@astra/vellum-lang` is a strider **devDep** (build-time only); `@astra/gothic`
  was already a dep. Existing markdown faction bodies are **valid vellum**
  (markdown subset), so the 20 files were just renamed `.md` → `.vellum` with
  bodies unchanged — the richer directives (`:::fields`/`:::timeline`/`:::columns`
  /inline) are now available for future authoring.
- Plain-prose faction bodies render in gothic **mechanical mode** (the default
  for a document with no `:::kind`) → headings come out teal, not amber. Reads
  fine on the dark panel; visually verified via a headless screenshot of the
  faction modal. If amber headings are wanted later, that's a gothic-mode/theming
  tweak.
- This is NOT a byte-identical migration (gothic ≠ remark HTML) — verify visually,
  not via a generated-output diff (unlike the KDL layer migration's gate).
- site-kit's dev content-watch now also rebuilds on `.vellum` (alongside
  `.md`/`.kdl`). The `Faction` type lost `members`; the banner pseudo-faction
  literals (MapView/BannerDetail) dropped their `members: []`.
