# Final-review application brief (2026-07-31)

The reviewer completed her full pass of the canonical store (174/174 spells reviewed,
`review-ui/state/comments.jsonl`). Your task: **apply her comments to the store**
(`apps/assay/homebrew/spells/*.json`). Her comments are the ground truth for this round —
they override prior sweep decisions and the former frozen-set protection.

Your worklist file (`lane{N}-worklist.json`) carries, per spell: the store file path, an
optional orchestrator annotation, and every live comment (tombstones and the retracted
force→spirit family are already filtered out).

## How to read a comment

- **`kind: "remove"`** — one-click strike: delete the quoted span verbatim, then repair the
  surrounding grammar/flow minimally. The quote may span field-echoed prose; see lockstep below.
- **`kind: "note"`** — the note is the instruction. Terse notes are targeted replacements
  (quote `"Will"` + note `"Reflex"` → replace that span AND the structured field). Longer
  notes describe the change in prose — follow them faithfully; where she supplies replacement
  wording, use her wording (adjusted only to PF2e register/format).
- **`kind: "decision"`** — resolved cards; the annotation in your worklist states the outcome.
- **Quote staleness**: quotes were captured against the store as of her review; minor drift
  is possible. Locate the intent; don't demand a byte-exact match. If a quote is truly
  unfindable, ledger it as `skipped` with the reason.

## Round rules

1. **Alias substitution (plain, no markup).** These D&D-cosmology proper nouns are replaced
   outright — ALL occurrences in the file, preserving sentence flow/articles/case. Never use
   `<name|alias>` markup (that design is dead):
   - Gehenna → the Fetid Maw
   - Far Realms / Far Realm → Slip
   - Plane of Earth → Quarry
   - Orichalcum → Faerock
   - the Grey Waste → Nowhere
   - Carceri → Umberii
2. **Set-wide "activity" rule** (her Umbral Assimilation comment, explicitly set-wide):
   any "as a [N]-action activity" (or "1-minute concentration/process") grant is reworded so
   the spell **grants a named action**, formatted the Pathfinder way. Find an official
   granted-action exemplar in `apps/codex/data/corpus/spell/` and mirror its idiom (never
   invent formatting; never cite the exemplar by name in the body). Known instances:
   compression, fluid-form, haunt, kosmoturgist-s-weapon, umbral-assimilation — but check
   every spell in your lane.
3. **Structural lockstep (mandatory).** Every prose edit must check the structured `system`
   fields (`range`, `duration`, `area`, `defense`, `damage`, `target`, `time`,
   `heightening`) and update them in lockstep — and vice versa: a comment quoting a field
   value (e.g. quote `"Duration 1"` note `"Sustained"`, quote `"30"` note `"60"` on range)
   edits the FIELD and any prose echo of it. Prose and fields must never disagree.
4. **Editorial register** — the standing conventions from `results/sweep-brief-v3.md`
   (T1–T9) govern how your edits READ: terse Remaster copy, no explaining parentheticals,
   no defensive sentences, no official-spell name-drops, `Heightened (+N)` idiom with base
   values in the body, `<hr />` only between body and Heightened, crit-success line deleted
   when identical to success, no labeled Allied/Enemy blocks, curse removal is the one-line
   counteract sentence. T10 is SUPERSEDED by round rule 1.
5. **Damage types**: the force→spirit family is retracted and pre-filtered. Other
   damage-type comments (e.g. Planar Shield vitality→Fire) stand.

## Editing discipline

- **Raw-text edits** preserving each file's existing serialization — never round-trip the
  JSON through a formatter; the store is not uniformly serialized.
- Descriptions are Foundry HTML (`<p>`, `<hr />`, `@UUID[...]` refs, `<strong>`). Keep the
  HTML valid; preserve the file's existing `@UUID` condition-linking convention when a
  comment maps a condition.
- Edit ONLY files in your own worklist. Never run git. Never touch `vendor/`, `review-ui/`,
  scoring code, or `results/` outside your own ledger.
- Consult the 5e original (`vendor/run_balance/`) when a comment references the original's
  wording or design.

## Ledger contract

Write `results/final-review/lane{N}.json`: an array, one object per spell:

```json
{
  "slug": "...",
  "comments": [
    {"id": "<comment id>", "action": "applied | skipped | amended",
     "detail": "one clause: what you did / why skipped / how amended"}
  ],
  "lockstep": ["field changes made (e.g. duration.value 1 -> sustained)"],
  "notes": "anything the orchestrator must review (optional)"
}
```

Every comment in your worklist must appear in the ledger. Skips need a real reason.
Flag (in `notes`) anything that looks like a store-level decision rather than an edit.
