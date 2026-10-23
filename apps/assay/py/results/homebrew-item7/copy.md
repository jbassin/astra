# Copy

## Header block

- **Rank:** 1
- **Routing:** ledger:long-cast
- **Pool reason:** ledger (manual pool, seeded by jmnario's balanceBullets)
- **Current assay line:** no quantitative verdict recorded for this spell in the chunk list (ledger routing — manual review item)
- **Adapter warnings (flags.assay.adapterWarnings):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 1 minute (manipulate, concentrate)
- **Range:** touch
- **Target:** 1 written or drawn document
- **Defense:** none
- **Duration:** — (instantaneous; store `duration.sustained=false, value=""`)
- **Cost:** "" (structured field empty)
- **Requirements:** "You have blank pages or surfaces sufficient to hold the copied material"

## The 5e original

- **Level:** 1
- **School:** memetics
- **Casting time:** 1 action
- **Range:** touch
- **Components:** V, S, M (a drop of black ink)
- **Duration:** Instantaneous
- **Ritual:** yes (`meta.ritual: true`)
- **Classes:** Bard, Seeker (SW), Wizard

> This spell creates a perfect duplicate of any written or drawn document that you touch onto blank pages you supply. You can copy up to 50 pages of text with one casting of this spell. Magical writing, including spellbook pages, can be copied with this spell, but do not retain any magical properties.

No `entriesHigherLevel` block in the 5e original.

## The conversion (canonical store)

You touch a written or drawn document and produce a perfect duplicate onto blank pages or a blank surface you supply. You can copy up to 50 pages of text or an equivalent area of drawn material in one casting. Magical writing (including spellbook pages, scrolls, and glyphs) can be copied, but the copy is mundane — it does not retain magical properties, does not function as the original magical item, and cannot be used as a spell source or activated. The copy is indistinguishable from the original to mundane inspection but can be identified as a copy with a successful Recall Knowledge check against your spell DC.

**Heightened (3rd)** You can copy up to 250 pages of text, and the copy retains any non-magical illustrations or illuminations with perfect fidelity.

No `@UUID[...]` references in this description. Structured fields agree with the current prose, but see "Prior astra touches" below for a store-vs-baseline field move (cost → requirements).

## What changed, plain English

The core "touch a document, get a mundane duplicate" mechanic survives intact, but the casting model, ritual status, and safety valves all shifted.

- **Numbers:** the 50-page-per-casting limit is preserved verbatim. Casting time was **not** shortened from 5e's "1 action" — the store lists 1 minute. This is a deliberate widening, not a straight port: 5e's 1-action time is undercut by the fact that 5e Copy is also a **ritual** (rituals in 5e typically add ~10 minutes when cast ritually, so the "1 action" number alone understates the real-world 5e cast time for a free/no-slot casting). The PF2e conversion's flat 1-minute cast time is the converter's own calibration ("copying 50 pages in 1 action would be too versatile for utility budget"), not a direct port of a 5e number.
- **Structure:** 5e's **ritual tag** (`meta.ritual: true`) is dropped entirely — PF2e Copy is a normal spell with no ritual-casting alternative. The 5e material component ("a drop of black ink") is dropped, consistent with the Remaster's no-material-components convention.
- **Content dropped:** none of the core function (perfect duplicate, 50-page cap, magical writing loses its magic) is missing.
- **Content added:** a **Recall Knowledge check vs. spell DC** to identify the copy as a forgery — no 5e basis; the converter's own notes call this a new "skill-check safety valve" added because a perfect, undetectable rank-1 forgery would be too strong for social/intrigue play. A **heightened (3rd)** entry (250 pages + perfect illustration fidelity) has no 5e basis — 5e Copy has no scaling text at all.

## Converter's notes

**Anchor:** no clean analog — closest is Illusory Writing (rank 1) for interacting with written text

**Archetype:** utility (document duplication)

**balanceBullets:**
- "No direct PF2e analog; closest is Illusory Writing (rank 1) which interacts with written text. Copy is purely practical (not illusion-based) and operates instantaneously."
- "Rank 1 is appropriate: this is a scribal utility with no combat use. The 50-page limit, magical-writing caveat, and Recall Knowledge detection check are the three safety valves."
- "1-minute cast time is preserved as the rate-limiting factor preventing 'instant duplicate any document in one action.'"
- "Mundane text — no combat value. Magical-writing copy — useful but non-magical copy doesn't let you cast spells from a copied spellbook, which is the most powerful potential abuse."

**overridable:**
- "The Recall Knowledge detection check could be removed if the GM wants the copy to be truly perfect (no detection)."
- "Could be made rank 0 (cantrip) if limited to 1 page per cast, for a truly minor utility effect."

**checklistFailures:** none.

## Similar official spells

No official PF2e spell named "Illusory Writing" exists in the codex snapshot (checked across `spells/`, `rituals/`, and `focus/`) — see Open Flags. Nearby-function utility/information spells found instead:

- **Imprint Message (rank 1)** — occult; imprints a short message/emotional theme onto an object, readable via Object Reading. Compares on rank and "information stored in a physical medium" territory, but is psychic-imprint flavored, not literal text duplication.
- **Message Rune (rank 1)** — arcane/occult; inscribes a visible rune with a recorded message and a trigger condition. Compares on rank and "record information onto a surface," but is a triggered-message device, not a document copier.
- **Transcribe Conflict (rank 3)** — records a detailed account of a recent combat onto a sheet of paper for later Recall Knowledge review. Compares on "conjure a written record from nothing," two ranks higher, and produces new text rather than duplicating an existing document.

## Prior astra touches

`revisions.md` lists one deviation for Copy:

- `cost.value`: baseline (fresh adapter re-conversion of jmnario's data) = `'blank pages or surfaces sufficient to hold the copied material'` → store = `''`
- `requirements`: baseline = `''` → store = `'You have blank pages or surfaces sufficient to hold the copied material'`

This is a structural field move (the "cost" text was relocated into the `requirements` field) rather than a content or balance change — the same sentence appears in the store either way, just under a different schema key.

## Open flags

- The converter's own cited anchor, "Illusory Writing (rank 1)," does not exist as a spell name anywhere in the `apps/codex/data/snapshots/foundry/pf2e-8.3.0` corpus (spells, rituals, or focus). The anchor may reference a book/edition outside this snapshot, or may be a converter error — this dossier does not resolve which.
- The 5e original is a **ritual** spell (`meta.ritual: true`); the PF2e conversion has no ritual trait and no ritual-casting alternative — the ritual status was dropped without an explicit note in either the converter's notes or `revisions.md`.
- The adapter warning notes the heightened (3rd) entry is "kept as a description appendix only" — there is no structured `heightening.levels["3"]` payload beyond an empty object (`{}`), consistent with the warning.
