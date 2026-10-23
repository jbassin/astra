# LotI2 store text-review brief — v3

You are reviewing PF2e homebrew spell text in a canonical store against the stakeholder's
editorial bar. For each spell you get the current store description plus the author's 5e
original. Find every span that violates a rule below and say what to do with it.

The bar, in one sentence: **spell text reads like official Paizo Remaster copy — terse,
idiomatic, no hand-holding — and stays faithful to the 5e original's prose, translated
to PF2e vocabulary rather than rewritten.**

## Rules (exemplars are real strikes from the stakeholder's earlier review)

**T1 — Explaining parentheticals.** Delete worked examples, enumerations, and edge-case
qualifiers in parens. Load-bearing content is promoted to plain prose, never left
parenthesized.
- Struck: "(so at rank 4 it targets a 5th-rank slot or lower, at rank 5 a 6th-rank slot
  or lower…)" · "(highest available, working downward)" · "(minimum 1st rank)" ·
  "(a door, a pit, a section of flooring, flowers, a weapon, a chest, etc.)" ·
  "(fire, lightning)" · "(2 bends at rank 5, 3 bends at rank 6, etc.)" ·
  "(or an Identify or Recall Knowledge check)" · "(no daily saves to recover)"
- KEEP: official idiom parens — "(such as …)" used the way official spells use it,
  "minimum 1" on damage dice.

**T2 — Defensive / pre-litigation sentences.** Delete sentences that restate what the
general rules already govern, pre-answer interactions nobody asked about, or fence in
edge cases. If a sentence exists to prevent a rules-lawyer argument, it goes. This
includes positive restatements of rules defaults (an aura's movement, a zone staying
where it was cast, an effect ending when its duration ends).
- Struck: "This spell has no effect on creatures that lack spell slots or focus
  points." · "The orb cannot absorb cantrips, rituals, or spells that target an area."
  · "The emanation moves with you." (that's what an aura does) · "The shroud persists
  for the duration or until it triggers." · "You are exempt from this effect for the
  purpose of sustaining [the spell] itself" · "This is a morph effect that layers on
  top of your wild shape polymorph. It does not stack with other morph effects." ·
  whole class-feat interaction paragraphs.
- A sentence that CONTRADICTS a rules default (a genuine override the design needs) is
  load-bearing — keep it, and note it as such.
- **This rule applies BELOW the sentence too.** Fencing clauses inside an otherwise
  fine sentence are T2 findings on their own: appended restriction lists ("with a
  range other than self or touch" where "other than self" suffices), trailing
  measuring/counting clauses that re-derive what the main clause already implies
  ("…as the origin point for that action, measuring range, area, and line of sight
  from its position instead of your own"), "once per X as a free action" fences the
  design didn't need. Quote just the clause and delete it.

**T3 — No official-spell/feat name-drops in bodies.** Never cite specific official
spells or feats as comparisons, delivery mechanics, or removal mechanics ("as if cast
by a 6th-rank …", "such as [official spell]", "similar to the … feat"). State the
mechanic plainly in the spell's own words. Curse removal is exactly one sentence:
"removing it requires a successful counteract check against this spell's rank."

Also T3: "as if …ed by a [rank-N official spell]" delivery comparisons ("as if
restored by a rank-9 two-action Heal") — replace with the concrete numbers or plain
wording. Mechanical aid: scan every capitalized proper noun that is not a condition,
trait, or the spell's own name; each one is either a T3 finding or gets a stated pass.

**T4 — No over-explanation.** The reader is an experienced GM. Delete sentences that
explain what a mechanic self-evidently means, teach the reader the general rules, or
narrate consequences the mechanics already imply. (E.g., after stating a curse, do not
add that it "can be removed only through effects that target curses" — that is what a
curse is.)

**T5 — Heightening idiom.** Pure numeric ladders collapse to a single `Heightened (+N)`
line with a flat increment — official exemplar: Diamond Dust, "Heightened (+2) The
damage increases by 1d6." Any value the (+N) line scales must be stated in the body.
Damage ladder lines say full/half/double with base damage declared in the body.
- Struck/collapsed in the earlier review: "heightened +1: damage increases by 1d6"
  replacing a fixed damage ladder · "(+2): increase the number of creatures targeted
  by 2" replacing fixed target tiers · "(+2): the flat check DC increases by 2"
  replacing a bespoke two-tier block.
- Fixed tiers granting genuinely different effects may stay fixed. But bespoke tier
  blocks that are pure bloat — stacked micro-upgrades, redundant top tiers, tiers
  that merely extend or loosen a limit (a duration, a time-since-death window, a cap)
  — were repeatedly struck WHOLE in the earlier review (examples: a tier adding a +2
  Athletics bonus to a combat morph; a tier extending an ink cost; tiers relaxing a
  time limit). Treat suspect tier blocks as strike candidates: action=flag.
- **MANDATORY: every spell that has ANY Heightened content must carry a T5 entry** —
  either a finding (collapse/flag/strike) or an explicit keep with one clause of
  justification (put the keep in findings with action=flag and why="keep: …").
  A spell with Heightened text and no T5 entry is an incomplete review.

**T6 — Translation, not rewrite (the doctrine).** Where the store invented flavor
prose, restructured prose into lists, or "punched up" the original, restore the 5e
original's prose translated to PF2e vocabulary. Compare the store text against the
provided 5e original sentence by sentence. The stakeholder, on one such rewrite:
"rewrites like this suck. Use the original prose but updated to use pathfinder
terminology." On a list-ification: "convert this into prose instead of a list, like in
the original."
- A flattened or simplified mechanic (the store dropping the original's staged,
  multi-part, or escalating design) is a T6 finding too: FLAG it, quoting the store
  span and naming what the original had.

**T7 — `<hr>` placement.** A horizontal rule sits ONLY between the body and the
Heightened block. Never before the degree-of-success list (that list is part of the
body), never anywhere else. Flag any other placement (quote the text just before it).

**T8 — 5e vocabulary residue.** concentration/concentrating (dead 5e-ism or a Sustain
reference to re-word) · wild shape / wildshaping (→ polymorph, or delete) ·
"opportunity attack" (→ reactive strike) · ad-hoc penalty stacks that decompose into
named conditions: Str-based rolls → Enfeebled, Dex-based → Clumsy, Con-based checks →
Drained. Earlier-review exemplar: "It becomes Clumsy 1 and takes a -1 status penalty
to Charisma-based skill checks" replacing a bespoke -1 atk/Cha-skills/Cha-saves stack.
Flag condition mappings beyond these exemplars rather than freelancing.

**T9 — Structure conventions.** No labeled "Allied Effect"/"Enemy Effect" blocks —
flatten to prose. A Critical Success line identical to Success is deleted (the Success
line covers both). Complex rolled effects (a d6 of outcomes written as run-on prose)
become a named-entry table in the body, with the degree text referring to the table.

**T10 — Obfuscated proper nouns.** In-universe, this book's author magically obfuscated
the names of people and places from his homeworld. Proper nouns from D&D cosmology
(named planes, settings, or locations that exist in D&D but not in this world) must
not appear plainly. FLAG each occurrence with a suggested `<real name|alias>` pair,
where the alias is a generic in-world paraphrase. Do not rewrite silently — flag.

## Output contract

Write ONE JSON file — an array, one object per spell:

```json
{
  "slug": "…",
  "findings": [
    {
      "rule": "T2",
      "quote": "exact contiguous substring copied from store_description",
      "action": "delete | rewrite | flag",
      "replacement": "only when action=rewrite",
      "why": "one short clause"
    }
  ],
  "clean": ["T1", "T7", "…"]
}
```

Every rule must appear either in `findings` or in `clean` for every spell — no silent
skips. `quote` must be an exact substring of the store description (it is matched
programmatically). Read every spell fully against every rule; the misses that matter
are the judgment ones (T2/T4/T6), not the greppable ones.
