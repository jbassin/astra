# PF2e Spell Creator — Claude Skill

A [Claude Code](https://claude.com/claude-code) skill for designing **balanced** Pathfinder 2e (Second Edition / Remaster) spells. It is grounded in the GM Core damage tables and canonical benchmark spells, so balance recommendations are reproducible rather than vibes-based.

## What it does

When invoked, the skill walks an 8-step workflow:

1. Clarify intent (rank, tradition, archetype, etc.)
2. Locate the closest published anchor spell
3. Apply the GM Core damage budget
4. Pick the defense and write the four-degree save tiers
5. Set range, area, duration
6. Add the right traits (with the **incapacitation** trait gate)
7. Heighten using the canonical per-rank deltas
8. Run the 12-item balance checklist

It produces a spell in published-format plus a brief balance note explaining the trade-offs.

## Installation

Clone into your Claude skills directory:

```bash
# Project-local skill
git clone https://github.com/jmnario/pf2e-spell-creator.git .claude/skills/pf2e-spell-creator

# Or user-level (available across all projects)
git clone https://github.com/jmnario/pf2e-spell-creator.git ~/.claude/skills/pf2e-spell-creator
```

Then in any Claude Code session, ask something like:

- *"Design a rank 4 PF2e spell that summons a flock of ravens to harass enemies."*
- *"Is this homebrew cantrip balanced? [paste]"*
- *"Build me a rank 7 single-target cold attack spell with a drained rider."*

The skill auto-triggers on PF2e spell-design language.

## Structure

```
SKILL.md                              entry point + 8-step workflow
references/
  damage-tables.md                    GM Core damage budgets + pricing
  conditions.md                       conditions by tier + incapacitation
  traits-taxonomy.md                  traits, traditions, defenses, areas
  heightening.md                      per-archetype heightening rates
  benchmark-spells.md                 iconic spells per rank
  healing-buffs-summons.md            non-damage scaling
  design-checklist.md                 12-item review + anti-patterns
```

Reference files are loaded on demand by the skill, not preloaded.

## Terminology

All Remaster: **rank** (not level), **off-guard** (not flat-footed), **vitality/void**, **Force Barrage** (not Magic Missile), **Slither** (not Black Tentacles), **Quandary** (not Maze), **Desiccate** (not Horrid Wilting), **Falling Stars** (not Meteor Swarm).

## Sources

Built from Archives of Nethys (2e.aonprd.com), Paizo GM Core / Player Core, and community design commentary (RPGBOT, Knights of Last Call, The Rules Lawyer, r/Pathfinder2e). See in-file source links in each reference document.

## License

MIT. Pathfinder content is © Paizo Inc. and used under the [Open RPG Creative License (ORC)](https://paizo.com/orclicense) where applicable. This skill is a fan reference and is not endorsed by Paizo.
