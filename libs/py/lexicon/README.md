# astra-lexicon — the canonical-names vocabulary and fuzzy name matching

`astra_lexicon` holds `defs.kdl`, the hand-edited list of the campaign's proper nouns and
their known speech-recognition mistranscriptions, plus the matchers that compare a messy name
with the canonical ones. linguist uses it to correct transcripts, mouthpiece reads its IPA
pronunciations for TTS, and `astra_ontology` builds entity resolution (heartwood, the
mouthpiece producer) and the entity registry seed on top of it.

## Public surface

- **Corrections.** `load_corrections(defs_path)` returns a `Replacer`: one function that
  replaces every known variant with its canonical form and strips the result. `load_defs()`
  gives `{canonical: [variant, ...]}`; `build_replacer(defs)` compiles any such mapping.
  `to_fragment(span)` turns a literal mistranscription into a stored variant (each word
  escaped, joined on `\s*`).
- **Pronunciations.** `load_pronunciations()` gives `{canonical: ipa}` for entries with an
  `ipa="..."` property.
- **Lexicon.** `build_lexicon(defs_path, extra_names)` or `build_lexicon_from(forms)` returns a
  `Lexicon`: `has(fold)` (a whole canonical form), `is_token(fold)` (a word inside one) and
  `nearest(fold, k, floor)` (ranked `Hypothesis` list).
- **Matching primitives.** `fold_for_match` (diacritic and ligature folding, for matching
  only), `tokenize`, `ngrams`, and the similarity signals `edit_sim`, `jaro_sim`,
  `phonetic_sim` (Double Metaphone), `dice_sim` and their weighted blend `ensemble_sim`
  (`WEIGHTS`).

`DEFS_PATH` is the packaged `defs.kdl`; every loader takes another path.

## `defs.kdl`

```kdl
entry "Anouk" ipa="..." {
    variant "Anak"
    variant "Anuk"
}
```

Each `entry` is a correct form. Each `variant` is a regular-expression fragment, stored
unescaped on purpose, and matched case-insensitively between word boundaries. All variants
compile into one alternation; the first group that matches decides the replacement.

## Testing

```sh
uv run pytest libs/py/lexicon
```

## Traps

- **A variant is a regex.** A literal `.`, `?`, `(` or `$` in a variant changes what it
  matches. Use `to_fragment` (or `escape_regex`) when adding a literal span.
- **An edit to `defs.kdl` changes three things:** linguist's corrections, mouthpiece's
  pronunciations and the entity registry seed. Run `just ontology-gen` to regenerate the
  fixture registry (`just ontology-check` fails until you do); the real registry in astra-data
  is reseeded on the next heartwood run (see
  [`ontology/ontology-entity`](../../../ontology/ontology-entity/README.md)).
- **Never make a common word a variant.** Matching ignores case, so a `Tech` variant for T3C
  would rewrite every "tech", a `Don` variant would hit every "Don't", and a `cave` variant for
  Kaathe would rewrite every real cave. Check a variant's hits across
  `linguist/transcripts/` first (`grep -o -i -w`), and fix the few real mis-hearings on the
  wiki by hand instead. A deployed `defs.kdl` change makes `stored_corrections` rewrite every
  stored transcript, so a bad variant reaches published text within minutes.
- **Folding is for comparison only.** Keep the original glyphs (Færrin, Anaïs) in any text you
  write back.
