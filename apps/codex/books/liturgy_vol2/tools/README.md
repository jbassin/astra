# vol2 book tools

`measure-heights.mjs` refreshes `../calibration.json` (real rendered px height
per spell ruleBlock, keyed by spell title) by driving a REAL browser against
https://homebrewery.naturalcrit.com (client-side only — nothing is saved or
published; the brew is pasted into a `/new` editor and measured in-page).

Run after any regeneration that changes spell content, then re-run
`uv run assay export-book` so pagination uses the fresh measurements:

```sh
node measure-heights.mjs            # uses apps/vellum-render's playwright
PLAYWRIGHT_PKG=/path/to/playwright/index.mjs node measure-heights.mjs
```

Titles are emitted with plain ASCII apostrophes (Homebrewery smart-quotes
them at render; the exporter matches on the store's `name` field).
