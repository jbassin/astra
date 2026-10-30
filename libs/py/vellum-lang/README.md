# astra-vellum-lang — the Python vellum metadata extractor

`astra_vellum_lang` reads only the metadata of a vellum document (the akasha wiki's authored
format): its YAML frontmatter and its `[[target#heading|alias]]` cross-references.
akasha-backend (`apps/akasha/py`, `corpus.py`) uses it to build the wiki's page index and
backlink graph. The full parser, with the document AST and structural validation, is the TS
[`@astra/vellum-lang`](../../ts/vellum-lang/README.md); the two must agree on metadata.

## Public surface

- `extract_metadata(source)` returns `Metadata(frontmatter, crossrefs)`. It never raises: bad
  YAML gives an empty `Frontmatter`.
- `canonical_meta_json(source)`: the byte-stable JSON that the parity checks compare with the
  TS `canonicalMetaJson`.
- The parts: `split_frontmatter`, `parse_frontmatter` (`title`, `tags`, `aliases`,
  `campaigns` with repeats dropped, `img`, and every other key in `extra`) and `scan_crossrefs` (in document order, with fenced and inline
  code removed first).

It reads no config.

## Parity checks

- `fixtures/vellum/*.vellum` is the shared conformance corpus. Each file's `.meta.json` is
  written by the TS `scripts/gen-fixtures.ts`; `tests/test_corpus.py` asserts that Python
  produces the same bytes.
- `just vellum-parity` (a CI job) runs `scripts/corpus_parity.py` over `fixtures/vellum`, the
  fixture wiki and strider's content, calling the TS `dump-meta.ts` for the other half.
  `just vellum-parity-live` runs it over the real wiki in the astra-data clone (read-only; not
  in CI; `astra-vellum-parity.timer` runs it daily and pages when it fails).

## Testing

```sh
uv run pytest libs/py/vellum-lang
just vellum-parity
```

## Traps

- **A grammar change lands in both languages.** Change the TS parser, regenerate the fixtures
  with `node --import tsx libs/ts/vellum-lang/scripts/gen-fixtures.ts`, then make Python match
  the new `.meta.json` files.
- **YAML dates stay strings.** The loader drops PyYAML's YAML 1.1 timestamp resolver so
  `created: 2024-01-15` parses as the string TS's YAML 1.2 parser gives. Rare scalar edge cases
  (bare exponent floats) can still differ between the two.
- **Code is stripped by regex.** Fenced (```` ``` ```` and `~~~`) blocks and single-backtick
  spans are removed before the cross-reference scan; indented code blocks and multi-backtick
  spans are not.
