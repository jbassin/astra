# assay — full-population power ledger (round 2/3)

**Round 3 note:** the `condition-control` rows below still carry their Stage-B fitted score (kept for population-wide reference — this is what informs the Stage A/B appendix in `point-tables.md`), but it is **no longer the recommended per-spell design tool** for hostile effect spells. Use `uv run assay score --spell <path>` for a homebrew effect spell — it returns D30-23 comparables (top-5 official neighbors + a rank RANGE) and D30-24 prior-card pointers instead of this fitted point score. See `README.md`'s homebrew workflow.

## Scored population (n=558, non-cantrip n=525)

Sorted hottest -> coldest by residual rank-equivalent (score vs. own nominal rank).

| Spell | Rank | Kind | EV/score | Residual (rank-equiv) | Boss-weighted resid |
|---|---|---|---|---|---|
| Disintegrate | 6 | pure-damage | 66.00 | +4.99 | — |
| Heaving Earth | 7 | hybrid-damage | 66.00 | +3.99 | — |
| One with the Land | 9 | recovered-damage | 97.50 | +3.86 | — |
| Dimensional Excision | 9 | pure-damage | 77.00 | +3.66 | — |
| Ravening Maw | 5 | condition-control | 56.63 | +2.81 | — |
| Incendiary Fog | 5 | pure-damage | 35.00 | +2.52 | — |
| Rust Cloud | 4 | hybrid-damage | 27.50 | +2.02 | — |
| Soothing Spring | 4 | healing | 45.00 | +1.94 | — |
| Execute (Vitality) | 7 | pure-damage | 70.00 | +1.91 | — |
| Boomerang Shot | 5 | hybrid-damage | 38.50 | +1.70 | — |
| Force Barrage (3 actions) | 1 | recovered-damage | 10.50 | +1.65 | — |
| Final Sacrifice (Cold) | 2 | pure-damage | 21.00 | +1.61 | — |
| Final Sacrifice (Fire) | 2 | pure-damage | 21.00 | +1.61 | — |
| Volcanic Eruption | 7 | pure-damage | 49.00 | +1.38 | — |
| Cataclysm | 10 | pure-damage | 99.00 | +1.31 | — |
| … | | | | | |
| True Target | 7 | condition-control | 0.47 | -6.90 | — |
| Control Sand | 7 | condition-control | 0.18 | -6.96 | — |
| Linnorm Sting | 9 | pure-damage | 13.00 | -6.98 | — |
| Nature's Enmity | 9 | recovered-damage | 11.00 | -7.01 | — |
| Confusing Colors | 8 | condition-control | 5.59 | -7.07 | -7.43 |
| Deluge | 8 | condition-control | 4.79 | -7.19 | — |
| Upheaval | 9 | condition-control | 10.52 | -7.34 | — |
| Divinity Leech | 9 | condition-control | 6.81 | -7.88 | — |
| Conquering Soldiers (Depart) | 10 | condition-control | 13.24 | -7.94 | — |
| Element Embodied | 10 | recovered-damage | 13.00 | -7.98 | — |
| Unspeakable Shadow | 9 | condition-control | 5.43 | -8.09 | — |
| Unfathomable Song | 9 | condition-control | 5.33 | -8.11 | -8.52 |
| Call Fluxwraith | 9 | condition-control | 4.88 | -8.18 | — |
| Storm of Vengeance | 9 | condition-control | 0.52 | -8.89 | — |
| Overwhelming Presence | 9 | condition-control | 0.07 | -8.98 | -8.98 |

<details><summary>Full non-cantrip ledger (525 rows)</summary>

| Spell | Rank | Kind | EV/score | Residual (rank-equiv) |
|---|---|---|---|---|
| Disintegrate | 6 | pure-damage | 66.00 | +4.99 |
| Heaving Earth | 7 | hybrid-damage | 66.00 | +3.99 |
| One with the Land | 9 | recovered-damage | 97.50 | +3.86 |
| Dimensional Excision | 9 | pure-damage | 77.00 | +3.66 |
| Ravening Maw | 5 | condition-control | 56.63 | +2.81 |
| Incendiary Fog | 5 | pure-damage | 35.00 | +2.52 |
| Rust Cloud | 4 | hybrid-damage | 27.50 | +2.02 |
| Soothing Spring | 4 | healing | 45.00 | +1.94 |
| Execute (Vitality) | 7 | pure-damage | 70.00 | +1.91 |
| Boomerang Shot | 5 | hybrid-damage | 38.50 | +1.70 |
| Force Barrage (3 actions) | 1 | recovered-damage | 10.50 | +1.65 |
| Final Sacrifice (Cold) | 2 | pure-damage | 21.00 | +1.61 |
| Final Sacrifice (Fire) | 2 | pure-damage | 21.00 | +1.61 |
| Volcanic Eruption | 7 | pure-damage | 49.00 | +1.38 |
| Cataclysm | 10 | pure-damage | 99.00 | +1.31 |
| Blade Barrier | 6 | pure-damage | 31.50 | +1.26 |
| Spirit Blast | 6 | pure-damage | 56.00 | +1.26 |
| Spiritual Torrent (variant 1) | 5 | pure-damage | 35.00 | +1.15 |
| Boneshaker (variant 1) | 2 | hybrid-damage | 13.50 | +1.13 |
| Quench | 2 | pure-damage | 18.00 | +1.13 |
| Arrow Salvo | 6 | hybrid-damage | 44.00 | +1.12 |
| Falling Stars (Plasma) | 9 | pure-damage | 82.00 | +1.12 |
| Falling Stars (Airbursts) | 9 | pure-damage | 82.00 | +1.12 |
| Falling Stars (Comets) | 9 | pure-damage | 82.00 | +1.12 |
| Falling Stars (Asteroids) | 9 | pure-damage | 82.00 | +1.12 |
| Frigid Flurry | 7 | pure-damage | 63.00 | +1.10 |
| Summon Draconic Legion | 9 | pure-damage | 45.00 | +1.07 |
| Undertaker | 9 | recovered-damage | 80.00 | +1.07 |
| Shocking Grasp | 1 | pure-damage | 13.00 | +1.02 |
| Coral Eruption | 4 | pure-damage | 21.00 | +1.01 |
| Painful Vibrations | 4 | hybrid-damage | 28.00 | +1.00 |
| Vision of Death | 4 | hybrid-damage | 28.00 | +1.00 |
| Wrathful Storm | 9 | recovered-damage | 64.50 | +0.94 |
| Blood Feast | 5 | pure-damage | 42.00 | +0.94 |
| Toxic Cloud | 5 | pure-damage | 27.00 | +0.92 |
| Channel Arrogance (3 actions) | 4 | recovered-damage | 27.50 | +0.92 |
| Magnetic Acceleration | 3 | pure-damage | 21.00 | +0.84 |
| Harm (vs. Undead) | 1 | healing | 12.50 | +0.83 |
| Heal (vs. Living) | 1 | healing | 12.50 | +0.83 |
| Blessed Boundary | 6 | pure-damage | 31.50 | +0.82 |
| Explosive Barrage | 6 | hybrid-damage | 42.00 | +0.82 |
| Inner Radiance Torrent (2 Rounds) | 2 | pure-damage | 20.00 | +0.82 |
| Thunderstrike | 1 | hybrid-damage | 9.00 | +0.76 |
| Animus Mine | 2 | hybrid-damage | 18.00 | +0.73 |
| Lightning Storm | 5 | pure-damage | 26.00 | +0.72 |
| Crisis of Faith (Vs. Divine) | 3 | hybrid-damage | 27.00 | +0.71 |
| Mantis's Grasp | 4 | hybrid-damage | 28.00 | +0.70 |
| Howling Blizzard (variant 2) | 5 | pure-damage | 35.00 | +0.67 |
| Chain Lightning | 6 | pure-damage | 52.00 | +0.66 |
| Exploding Earth | 2 | hybrid-damage | 14.00 | +0.65 |
| Revival | 10 | healing | 85.00 | +0.65 |
| Final Fate of the Locust Host | 7 | hybrid-damage | 45.00 | +0.60 |
| Lightning Bolt | 3 | pure-damage | 26.00 | +0.59 |
| Cone of Cold | 5 | pure-damage | 42.00 | +0.58 |
| Eclipse Burst | 7 | hybrid-damage | 64.00 | +0.58 |
| Forge | 1 | pure-damage | 10.50 | +0.56 |
| Horizon Thunder Sphere (variant 1) | 1 | hybrid-damage | 10.50 | +0.56 |
| Acid Arrow | 2 | pure-damage | 13.50 | +0.56 |
| Awaken Entropy (variant 1) | 6 | pure-damage | 28.00 | +0.53 |
| Awaken Entropy (Immune to Void) | 6 | pure-damage | 28.00 | +0.53 |
| Implosion | 9 | pure-damage | 75.00 | +0.49 |
| Phantasmagoria | 9 | hybrid-damage | 56.00 | +0.45 |
| Weird | 9 | hybrid-damage | 56.00 | +0.45 |
| Soothe | 1 | healing | 9.50 | +0.42 |
| Boneshaker (variant 2) | 2 | hybrid-damage | 13.50 | +0.41 |
| Force Barrage (2 actions) | 1 | recovered-damage | 7.00 | +0.40 |
| Agitate | 1 | pure-damage | 9.00 | +0.35 |
| Possession | 7 | condition-control | 52.97 | +0.34 |
| Necromancer's Generosity | 1 | healing | 8.50 | +0.29 |
| Horizon Thunder Sphere (variant 2) | 1 | hybrid-damage | 10.50 | +0.27 |
| Chilling Darkness | 3 | pure-damage | 17.50 | +0.25 |
| Holy Light | 3 | pure-damage | 17.50 | +0.25 |
| Moonlight Ray | 3 | pure-damage | 17.50 | +0.25 |
| Sudden Bolt | 2 | pure-damage | 26.00 | +0.24 |
| Animal Allies | 1 | pure-damage | 7.50 | +0.22 |
| Paralyze | 3 | condition-control | 21.38 | +0.19 |
| Bandit's Doom | 5 | hybrid-damage | 36.00 | +0.15 |
| Repelling Pulse | 5 | hybrid-damage | 38.50 | +0.15 |
| Acidic Burst | 1 | pure-damage | 7.00 | +0.15 |
| Breathe Fire | 1 | pure-damage | 7.00 | +0.15 |
| Flense | 1 | hybrid-damage | 7.00 | +0.15 |
| Coral Scourge | 3 | condition-control | 21.01 | +0.14 |
| Vampiric Feast | 3 | pure-damage | 21.00 | +0.14 |
| Animated Assault | 2 | pure-damage | 11.00 | +0.13 |
| Draw Ire | 1 | pure-damage | 5.50 | +0.12 |
| Ice Storm | 4 | pure-damage | 18.00 | +0.08 |
| Sacred Beasts (Slashing) | 1 | pure-damage | 7.00 | +0.08 |
| Sacred Beasts (Piercing) | 1 | pure-damage | 7.00 | +0.08 |
| Sacred Beasts (Bludgeoning) | 1 | pure-damage | 7.00 | +0.08 |
| Gust of Wind | 1 | hybrid-damage | 7.00 | +0.08 |
| Threefold Limb (Ice) | 1 | hybrid-damage | 7.00 | +0.08 |
| Threefold Limb (Liquid Water) | 1 | hybrid-damage | 7.00 | +0.08 |
| Threefold Limb (Steam) | 1 | hybrid-damage | 7.00 | +0.08 |
| Biting Words | 1 | pure-damage | 7.00 | +0.08 |
| Hippocampus Retreat | 1 | pure-damage | 7.00 | +0.08 |
| Inkshot | 1 | hybrid-damage | 7.00 | +0.08 |
| Aqueous Blast | 1 | hybrid-damage | 9.00 | +0.06 |
| Scorching Blast | 1 | pure-damage | 9.00 | +0.06 |
| Sleep | 1 | condition-control | 6.28 | +0.04 |
| Signal Skyrocket | 1 | hybrid-damage | 5.50 | +0.04 |
| Cutting Insult | 2 | hybrid-damage | 14.00 | +0.03 |
| Heat Metal | 2 | pure-damage | 14.00 | +0.03 |
| Worm's Repast | 2 | hybrid-damage | 14.00 | +0.03 |
| Attacked from Within | 7 | hybrid-damage | 54.00 | +0.02 |
| Flame Strike | 5 | pure-damage | 28.00 | +0.01 |
| Jassim's Allegiance (Arrive) | 10 | hybrid-damage | 65.00 | +0.01 |
| Corrosive Muck | 5 | pure-damage | 28.00 | +0.00 |
| Instant Minefield | 5 | hybrid-damage | 21.00 | +0.00 |
| Monstrosity Form | 8 | condition-control | 58.11 | -0.00 |
| Sudden Blight | 2 | pure-damage | 11.00 | -0.01 |
| Divine Aura | 8 | condition-control | 57.97 | -0.02 |
| Horizon Thunder Sphere (variant 3) | 1 | hybrid-damage | 10.50 | -0.02 |
| Hydraulic Push | 1 | pure-damage | 10.50 | -0.02 |
| Purifying Icicle | 1 | pure-damage | 10.50 | -0.02 |
| Concordant Choir (variant 1) | 1 | pure-damage | 5.00 | -0.03 |
| Ooze Form | 3 | condition-control | 19.69 | -0.04 |
| Crashing Wave | 3 | pure-damage | 21.00 | -0.05 |
| Impending Doom | 3 | hybrid-damage | 21.00 | -0.05 |
| Inner Radiance Torrent (variant 1) | 2 | pure-damage | 10.00 | -0.05 |
| Harm (variant 3) | 1 | pure-damage | 4.50 | -0.07 |
| Heal (variant 3) | 1 | pure-damage | 4.50 | -0.07 |
| Pain of Ages | 6 | hybrid-damage | 36.00 | -0.08 |
| Rose's Thorns | 6 | hybrid-damage | 36.00 | -0.08 |
| Utter Destruction | 6 | hybrid-damage | 36.00 | -0.08 |
| Bone Spray | 2 | pure-damage | 12.00 | -0.12 |
| Scouring Pulse | 5 | hybrid-damage | 27.00 | -0.15 |
| Hydraulic Torrent | 4 | pure-damage | 28.00 | -0.15 |
| Life-Draining Roots | 4 | pure-damage | 28.00 | -0.15 |
| Buffeting Winds | 1 | pure-damage | 5.00 | -0.16 |
| Chilling Spray | 1 | pure-damage | 5.00 | -0.16 |
| Gritty Wheeze | 1 | hybrid-damage | 5.00 | -0.16 |
| Pummeling Rubble | 1 | pure-damage | 5.00 | -0.16 |
| Devouring Void | 7 | pure-damage | 31.50 | -0.18 |
| Concordant Choir (variant 2) | 1 | pure-damage | 5.00 | -0.21 |
| Grim Tendrils | 1 | pure-damage | 5.00 | -0.21 |
| Phantom Pain | 1 | hybrid-damage | 5.00 | -0.21 |
| Snowball | 1 | pure-damage | 5.00 | -0.21 |
| Kinetic Ram (variant 2) | 1 | recovered-damage | 3.50 | -0.21 |
| Radiant Beam | 4 | hybrid-damage | 27.50 | -0.22 |
| Divine Wrath | 4 | hybrid-damage | 22.00 | -0.23 |
| Acid Grip | 2 | pure-damage | 9.00 | -0.24 |
| Spiritual Armament (Spirit) | 2 | pure-damage | 9.00 | -0.24 |
| Spiritual Armament (Slashing) | 2 | pure-damage | 9.00 | -0.24 |
| Spiritual Armament (Bludgeoning) | 2 | pure-damage | 9.00 | -0.24 |
| Spiritual Armament (Piercing) | 2 | pure-damage | 9.00 | -0.24 |
| Spiritual Weapon | 2 | pure-damage | 9.00 | -0.24 |
| Shattering Gem | 1 | pure-damage | 4.50 | -0.24 |
| Blazing Blade | 2 | pure-damage | 11.00 | -0.27 |
| Polar Ray | 8 | hybrid-damage | 45.00 | -0.27 |
| Blazing Dive | 3 | pure-damage | 18.00 | -0.27 |
| Devour Life | 8 | pure-damage | 60.00 | -0.27 |
| Fireball | 3 | pure-damage | 21.00 | -0.28 |
| Blazing Fissure | 5 | hybrid-damage | 35.00 | -0.28 |
| Harm (vs. Living) | 1 | pure-damage | 4.50 | -0.28 |
| Heal (vs. Undead) | 1 | pure-damage | 4.50 | -0.28 |
| Rip the Spirit (variant 3) | 5 | hybrid-damage | 35.00 | -0.29 |
| Clockwork Devotion (Depart) | 8 | pure-damage | 36.00 | -0.29 |
| Dragon Turret | 10 | pure-damage | 58.50 | -0.31 |
| Cast into Time | 6 | hybrid-damage | 40.00 | -0.31 |
| Admonishing Ray | 1 | pure-damage | 7.00 | -0.33 |
| Briny Bolt | 1 | hybrid-damage | 7.00 | -0.33 |
| Sea Surge | 2 | hybrid-damage | 10.50 | -0.34 |
| Splinter Volley (3 actions) | 2 | recovered-damage | 14.00 | -0.34 |
| Elemental Annihilation Wave (variant 1) | 3 | pure-damage | 14.00 | -0.35 |
| Noise Blast | 2 | hybrid-damage | 11.00 | -0.37 |
| Shatter | 2 | pure-damage | 11.00 | -0.37 |
| Noxious Vapors | 1 | hybrid-damage | 3.50 | -0.39 |
| Shockwave | 1 | hybrid-damage | 3.50 | -0.39 |
| Camel Spit | 1 | hybrid-damage | 3.50 | -0.39 |
| Draw the Lightning | 4 | pure-damage | 19.50 | -0.41 |
| Vampiric Exsanguination | 6 | pure-damage | 42.00 | -0.42 |
| Missed Cue | 6 | hybrid-damage | 42.00 | -0.43 |
| Defended by Spirits | 1 | pure-damage | 3.50 | -0.43 |
| Kinetic Ram (variant 1) | 1 | recovered-damage | 3.50 | -0.43 |
| Echo Jump | 3 | pure-damage | 18.00 | -0.43 |
| Suspended Retribution | 6 | pure-damage | 70.00 | -0.43 |
| Floating Flame | 2 | pure-damage | 10.50 | -0.44 |
| Eagle's Cry | 3 | hybrid-damage | 18.00 | -0.44 |
| Harm (variant 2) | 1 | pure-damage | 4.50 | -0.44 |
| Heal (variant 2) | 1 | pure-damage | 4.50 | -0.44 |
| Force Barrage (1 action) | 1 | recovered-damage | 3.50 | -0.46 |
| Hungry Depths | 7 | pure-damage | 28.00 | -0.47 |
| Dive and Breach | 3 | pure-damage | 16.50 | -0.48 |
| Spiritual Anamnesis | 4 | condition-control | 23.65 | -0.50 |
| Feral Shades | 2 | pure-damage | 10.00 | -0.51 |
| Inner Radiance Torrent (variant 2) | 2 | pure-damage | 10.00 | -0.51 |
| Banishing Touch (3 actions) | 2 | recovered-damage | 7.00 | -0.51 |
| Inevitable Disaster | 5 | pure-damage | 55.00 | -0.54 |
| Trim the Blight | 9 | hybrid-damage | 66.00 | -0.55 |
| Wall of Fire | 4 | hybrid-damage | 14.00 | -0.55 |
| Cycle of Retribution | 1 | pure-damage | 2.50 | -0.55 |
| Nettleskin | 1 | pure-damage | 2.50 | -0.55 |
| Spider Sting | 1 | pure-damage | 2.50 | -0.55 |
| Death Knell | 2 | condition-control | 8.98 | -0.56 |
| Fated Healing | 1 | healing | 2.50 | -0.58 |
| Kinetic Ram (variant 3) | 1 | recovered-damage | 3.50 | -0.58 |
| Bonewall Bulwark | 3 | pure-damage | 16.50 | -0.64 |
| Vomit Swarm | 2 | hybrid-damage | 9.00 | -0.64 |
| Frog Tongue | 2 | hybrid-damage | 9.00 | -0.65 |
| Spirit Link | 1 | healing | 2.00 | -0.66 |
| 10-foot Burst | 7 | hybrid-damage | 49.00 | -0.68 |
| Concordant Choir (variant 3) | 1 | pure-damage | 2.50 | -0.69 |
| Pollen Pods | 7 | hybrid-damage | 36.00 | -0.70 |
| Wall of Virtue | 3 | pure-damage | 9.00 | -0.70 |
| Befuddle | 1 | condition-control | 1.61 | -0.70 |
| Mirror Malefactors | 5 | hybrid-damage | 31.50 | -0.72 |
| Splinter Volley (2 actions) | 2 | recovered-damage | 14.00 | -0.73 |
| Overselling Flourish | 1 | condition-control | 1.44 | -0.73 |
| Rainbow's End | 1 | hybrid-damage | 2.50 | -0.74 |
| Ash Cloud | 2 | hybrid-damage | 5.00 | -0.74 |
| Equal Footing | 1 | condition-control | 1.32 | -0.75 |
| Curse of Recoil | 1 | condition-control | 1.26 | -0.76 |
| Schadenfreude | 1 | condition-control | 1.17 | -0.78 |
| Swampcall | 1 | condition-control | 1.01 | -0.81 |
| Armor of Thorn and Claw | 1 | hybrid-damage | 1.00 | -0.81 |
| Dizzying Colors | 1 | condition-control | 0.99 | -0.81 |
| Dehydrate | 1 | condition-control | 0.95 | -0.82 |
| Grease | 1 | condition-control | 0.88 | -0.83 |
| Enfeeble | 1 | condition-control | 0.87 | -0.83 |
| Curse of Lost Time | 3 | hybrid-damage | 14.00 | -0.84 |
| Undertow | 3 | recovered-damage | 14.00 | -0.84 |
| Fear | 1 | condition-control | 0.77 | -0.85 |
| Ray of Corruption | 7 | pure-damage | 78.00 | -0.85 |
| Sudden Transposition | 8 | hybrid-damage | 55.00 | -0.85 |
| Dancing Fountain | 7 | hybrid-damage | 35.00 | -0.85 |
| Banishing Touch (2 actions) | 2 | recovered-damage | 7.00 | -0.85 |
| Umbral Mindtheft | 2 | pure-damage | 7.00 | -0.85 |
| Mercurial Stride | 4 | hybrid-damage | 21.00 | -0.86 |
| Déjà Vu | 1 | condition-control | 0.69 | -0.86 |
| Gravitational Pull (variant 2) | 1 | condition-control | 0.68 | -0.86 |
| Illusory Creature | 2 | recovered-damage | 7.50 | -0.87 |
| Dominate | 6 | condition-control | 35.68 | -0.89 |
| Avenging Wildwood (Slashing) | 2 | pure-damage | 9.00 | -0.90 |
| Avenging Wildwood (Piercing) | 2 | pure-damage | 9.00 | -0.90 |
| Avenging Wildwood (Bludgeoning) | 2 | pure-damage | 9.00 | -0.90 |
| Gravitational Pull (variant 1) | 1 | condition-control | 0.49 | -0.90 |
| Dirge of Remembrance | 4 | pure-damage | 22.00 | -0.92 |
| Swallow Light | 2 | pure-damage | 7.00 | -0.92 |
| Gravitational Pull (variant 3) | 1 | condition-control | 0.37 | -0.92 |
| Scouring Sand | 1 | condition-control | 0.28 | -0.94 |
| Gasping Marsh | 3 | hybrid-damage | 14.00 | -0.96 |
| Elemental Annihilation Wave (variant 2) | 3 | pure-damage | 14.00 | -0.97 |
| Elemental Annihilation Wave (2 Rounds) | 3 | pure-damage | 14.00 | -0.97 |
| Glass Sand | 3 | pure-damage | 14.00 | -0.97 |
| Tether | 1 | condition-control | 0.14 | -0.97 |
| Arctic Rift | 8 | hybrid-damage | 54.00 | -0.97 |
| Desiccate | 8 | pure-damage | 55.00 | -0.99 |
| Phantom Orchestra | 6 | pure-damage | 28.00 | -0.99 |
| Leaden Steps | 1 | condition-control | 0.02 | -0.99 |
| 30-foot Line | 7 | hybrid-damage | 49.00 | -1.07 |
| Shadow Raid | 7 | hybrid-damage | 27.00 | -1.08 |
| Deity's Strike | 7 | pure-damage | 45.50 | -1.11 |
| Ibex's Harvest (3 actions) | 3 | recovered-damage | 9.00 | -1.12 |
| Firework Blast | 3 | hybrid-damage | 14.00 | -1.12 |
| Gentle Breeze | 2 | healing | 10.00 | -1.12 |
| Petrify | 6 | condition-control | 33.89 | -1.13 |
| Ignite Fireworks | 2 | hybrid-damage | 9.00 | -1.15 |
| Impaling Spike | 5 | hybrid-damage | 28.00 | -1.16 |
| Vampiric Maiden | 4 | hybrid-damage | 20.00 | -1.18 |
| Visions of Danger | 7 | pure-damage | 36.00 | -1.18 |
| Teeth to Terror | 2 | hybrid-damage | 5.00 | -1.21 |
| Channel Arrogance (1 action) | 4 | recovered-damage | 27.50 | -1.23 |
| Warrior's Regret | 2 | pure-damage | 4.50 | -1.24 |
| Phantasmal Calamity | 6 | hybrid-damage | 38.50 | -1.25 |
| Sign of Conviction | 3 | hybrid-damage | 11.00 | -1.27 |
| Cave Fangs | 3 | pure-damage | 21.00 | -1.27 |
| Phoenix Ward | 4 | healing | 18.00 | -1.27 |
| Skeleton Army (Depart) | 6 | hybrid-damage | 21.00 | -1.30 |
| Cyclone Rondo | 3 | hybrid-damage | 14.00 | -1.34 |
| Ymeri's Mark | 4 | pure-damage | 17.50 | -1.34 |
| Infectious Ennui | 3 | condition-control | 10.34 | -1.36 |
| Bralani Referendum | 2 | hybrid-damage | 7.00 | -1.37 |
| Croak Voice | 3 | pure-damage | 11.00 | -1.37 |
| Ancestral Winds | 5 | hybrid-damage | 21.00 | -1.39 |
| Divine Immolation | 5 | pure-damage | 21.00 | -1.39 |
| Percussive Impact | 3 | hybrid-damage | 18.00 | -1.40 |
| Mutilate (3 actions) | 4 | recovered-damage | 22.50 | -1.44 |
| Frozen Fog | 6 | hybrid-damage | 27.00 | -1.45 |
| Feast of Ashes | 2 | hybrid-damage | 2.50 | -1.46 |
| Blazing Armory | 2 | recovered-damage | 3.50 | -1.46 |
| Sacred Nimbus | 4 | pure-damage | 17.50 | -1.50 |
| Rime Slick | 2 | hybrid-damage | 5.00 | -1.51 |
| Magical Fetters | 3 | condition-control | 9.30 | -1.51 |
| Sticky Fire | 2 | hybrid-damage | 4.50 | -1.55 |
| Banishing Touch (1 action) | 2 | recovered-damage | 3.50 | -1.55 |
| Imp Sting | 2 | pure-damage | 2.50 | -1.55 |
| Spirit Song | 8 | hybrid-damage | 49.00 | -1.57 |
| Steel Fortifications | 2 | condition-control | 2.37 | -1.58 |
| Blastback | 3 | pure-damage | 15.00 | -1.59 |
| Horrifying Blood Loss | 2 | condition-control | 2.24 | -1.60 |
| Wall of Radiance | 3 | hybrid-damage | 7.00 | -1.60 |
| Pyrefowl Rebuke | 2 | hybrid-damage | 3.50 | -1.61 |
| Moonburst | 7 | hybrid-damage | 44.00 | -1.63 |
| Sunburst | 7 | hybrid-damage | 44.00 | -1.63 |
| Stupefy | 2 | condition-control | 2.03 | -1.63 |
| Shadow Projectile | 3 | hybrid-damage | 13.50 | -1.64 |
| Flame Vortex | 6 | pure-damage | 18.00 | -1.65 |
| Geyser | 5 | pure-damage | 24.50 | -1.65 |
| Deathless March | 4 | condition-control | 15.23 | -1.66 |
| Summon Healing Servitor | 5 | pure-damage | 13.50 | -1.67 |
| Healing Well | 5 | healing | 18.00 | -1.67 |
| Summon Kaiju | 10 | condition-control | 60.67 | -1.68 |
| Reaper's Lantern | 2 | condition-control | 1.66 | -1.69 |
| Overwhelming Memory | 3 | condition-control | 7.90 | -1.72 |
| Agonizing Despair | 3 | hybrid-damage | 14.00 | -1.73 |
| Carrion Mire | 2 | condition-control | 1.40 | -1.74 |
| Laughing Fit | 2 | condition-control | 1.38 | -1.74 |
| Blood-Feasting Breath | 5 | pure-damage | 17.50 | -1.75 |
| Rip the Spirit (variant 1) | 5 | hybrid-damage | 17.50 | -1.75 |
| With Friends like These | 2 | condition-control | 1.33 | -1.75 |
| Freezing Rain | 5 | hybrid-damage | 14.00 | -1.76 |
| Ghoulish Cravings | 2 | condition-control | 1.24 | -1.77 |
| Expeditious Excavation | 2 | condition-control | 1.23 | -1.77 |
| Albatross Curse | 2 | condition-control | 1.21 | -1.77 |
| Mind Games | 2 | condition-control | 1.15 | -1.78 |
| Blistering Invective | 2 | condition-control | 1.11 | -1.79 |
| Charitable Urge | 2 | condition-control | 1.11 | -1.79 |
| Noxious Metals | 3 | hybrid-damage | 14.00 | -1.81 |
| Cloak of Light | 4 | pure-damage | 14.00 | -1.84 |
| Snake Fangs | 4 | recovered-damage | 14.00 | -1.84 |
| Divine Decree | 7 | hybrid-damage | 38.50 | -1.85 |
| Osseous Cage | 2 | condition-control | 0.77 | -1.85 |
| Manifestation of Spirits | 2 | condition-control | 0.74 | -1.85 |
| Canticle of Everlasting Grief | 8 | hybrid-damage | 35.00 | -1.86 |
| Petal Storm | 4 | pure-damage | 11.00 | -1.87 |
| Cauterize Wounds | 2 | recovered-damage | 1.00 | -1.89 |
| Crimson Breath | 6 | pure-damage | 28.00 | -1.91 |
| Tanglecurse | 6 | condition-control | 27.97 | -1.91 |
| The Queen's Rainbow | 2 | condition-control | 0.41 | -1.92 |
| Skeleton Army (Arrive) | 6 | hybrid-damage | 18.00 | -1.92 |
| Fear the Sun | 2 | condition-control | 0.39 | -1.92 |
| Breath of Drought | 2 | condition-control | 0.38 | -1.92 |
| Entangling Flora | 2 | condition-control | 0.37 | -1.92 |
| Entangle Fate | 4 | condition-control | 13.37 | -1.92 |
| Radiant Field | 2 | condition-control | 0.32 | -1.93 |
| Web | 2 | condition-control | 0.13 | -1.97 |
| Deafness | 2 | condition-control | 0.04 | -1.99 |
| Veil of Spirits | 2 | condition-control | 0.03 | -1.99 |
| Phantasmal Treasure | 2 | condition-control | 0.02 | -1.99 |
| Mark of Blood | 2 | condition-control | 0.02 | -2.00 |
| Lashing Rope | 3 | pure-damage | 10.50 | -2.02 |
| Mutilate (2 actions) | 4 | recovered-damage | 22.50 | -2.04 |
| Grisly Growths | 5 | hybrid-damage | 35.00 | -2.05 |
| Wall Of Mirrors | 4 | hybrid-damage | 10.00 | -2.06 |
| Wall of Thorns | 3 | pure-damage | 7.50 | -2.07 |
| Stifling Stillness | 4 | hybrid-damage | 10.50 | -2.09 |
| Sanguine Mist | 4 | hybrid-damage | 21.00 | -2.15 |
| Bursting Bloom | 4 | hybrid-damage | 21.00 | -2.16 |
| Moth's Supper | 3 | healing | 5.00 | -2.16 |
| Fateful Condemnation | 6 | hybrid-damage | 28.00 | -2.16 |
| Shock to the System | 7 | healing | 36.00 | -2.16 |
| Sea of Thought | 3 | condition-control | 4.85 | -2.18 |
| Positive Attunement (Damage) | 3 | pure-damage | 4.50 | -2.24 |
| Call The Blood | 4 | hybrid-damage | 20.00 | -2.24 |
| Annunciation of the Outer Gate | 3 | condition-control | 4.31 | -2.27 |
| Grasp of the Deep | 4 | hybrid-damage | 21.00 | -2.27 |
| Diadem of Divine Radiance | 5 | hybrid-damage | 18.00 | -2.27 |
| Murderous Vine | 4 | pure-damage | 19.50 | -2.28 |
| Rouse Skeletons | 3 | pure-damage | 7.00 | -2.33 |
| Vision of Beauty | 4 | condition-control | 10.54 | -2.33 |
| Rusting Grasp | 4 | recovered-damage | 10.50 | -2.34 |
| Day's Weight | 3 | condition-control | 3.74 | -2.36 |
| Roaring Applause | 3 | condition-control | 3.67 | -2.37 |
| Unseasonable Squall | 3 | condition-control | 3.65 | -2.37 |
| Slow | 3 | condition-control | 3.52 | -2.39 |
| Chroma Leach | 4 | condition-control | 9.92 | -2.42 |
| Spiritual Guardian | 5 | pure-damage | 13.50 | -2.44 |
| Horde of Underlings (Slashing) | 3 | pure-damage | 2.50 | -2.46 |
| Horde of Underlings (Bludgeoning) | 3 | pure-damage | 2.50 | -2.46 |
| Horde of Underlings (Piercing) | 3 | pure-damage | 2.50 | -2.46 |
| Black Tentacles | 5 | hybrid-damage | 10.50 | -2.51 |
| Slither | 5 | hybrid-damage | 10.50 | -2.51 |
| Necrotize | 6 | pure-damage | 42.00 | -2.52 |
| Blindness | 3 | condition-control | 2.59 | -2.54 |
| Holy Cascade | 4 | pure-damage | 10.50 | -2.56 |
| Voracious Gestalt | 9 | pure-damage | 49.00 | -2.57 |
| Acid Storm | 5 | pure-damage | 13.50 | -2.59 |
| Stinking Cloud | 3 | condition-control | 2.20 | -2.60 |
| Shifting Sand | 3 | condition-control | 2.15 | -2.61 |
| Whirlpool | 8 | pure-damage | 33.00 | -2.63 |
| Blinding Foam | 5 | hybrid-damage | 27.50 | -2.64 |
| Bridge of Vines | 4 | condition-control | 8.35 | -2.65 |
| Anathematic Reprisal | 4 | hybrid-damage | 14.00 | -2.68 |
| Envenom Companion | 3 | condition-control | 1.71 | -2.69 |
| Pyrotechnics | 3 | condition-control | 1.42 | -2.74 |
| Flowing Strike | 5 | pure-damage | 11.00 | -2.74 |
| Ravenous Darkness | 6 | pure-damage | 14.00 | -2.76 |
| Clockwork Devotion (Arrive) | 8 | pure-damage | 22.00 | -2.78 |
| Hypnopompic Terrors | 8 | hybrid-damage | 39.00 | -2.79 |
| Bestial Curse | 4 | condition-control | 7.34 | -2.80 |
| Phantasmal Protagonist | 4 | condition-control | 7.32 | -2.81 |
| Fire Shield | 4 | pure-damage | 7.00 | -2.85 |
| Necrotic Radiation | 4 | pure-damage | 7.00 | -2.85 |
| Oneiric Mire | 3 | condition-control | 0.72 | -2.86 |
| Blister | 5 | pure-damage | 24.50 | -2.88 |
| Sculpt Sound | 3 | condition-control | 0.48 | -2.90 |
| Radiant Globe | 3 | condition-control | 0.48 | -2.90 |
| Implement of Destruction | 4 | recovered-damage | 7.00 | -2.92 |
| Aromatic Lure | 4 | condition-control | 6.46 | -2.94 |
| Antlion Trap | 3 | condition-control | 0.26 | -2.95 |
| Cup of Dust | 3 | condition-control | 0.05 | -2.99 |
| Enthrall | 3 | condition-control | 0.05 | -2.99 |
| Hypnotize | 3 | condition-control | 0.04 | -2.99 |
| Mad Monkeys | 3 | condition-control | 0.03 | -2.99 |
| Disruptive Transfer | 3 | condition-control | 0.03 | -2.99 |
| Sparkleskin | 3 | condition-control | 0.03 | -2.99 |
| Entrancing Eyes | 7 | condition-control | 27.00 | -3.04 |
| Invoke Spirits | 5 | hybrid-damage | 10.00 | -3.05 |
| Summon Ancient Fleshforged | 9 | condition-control | 41.97 | -3.07 |
| Astral Labyrinth | 9 | condition-control | 41.91 | -3.08 |
| Blinding Bottle | 5 | pure-damage | 10.50 | -3.09 |
| Tortoise and the Hare | 4 | condition-control | 5.23 | -3.12 |
| Cinder Swarm (Fireflies) | 4 | condition-control | 5.09 | -3.15 |
| Cinder Swarm (Fire Ants) | 4 | condition-control | 5.09 | -3.15 |
| Stormburst | 5 | hybrid-damage | 21.00 | -3.15 |
| Whirlwind | 8 | pure-damage | 27.50 | -3.15 |
| Rip the Spirit (variant 2) | 5 | hybrid-damage | 17.50 | -3.17 |
| Wall of Ice | 5 | pure-damage | 7.00 | -3.18 |
| Poltergeist's Fury | 6 | pure-damage | 15.00 | -3.18 |
| Wails of the Damned | 9 | hybrid-damage | 44.00 | -3.18 |
| Belittling Boast | 5 | condition-control | 11.41 | -3.21 |
| Beheading Buzz Saw | 7 | pure-damage | 27.50 | -3.22 |
| Vibrant Vibrato | 7 | hybrid-damage | 27.50 | -3.22 |
| Confusion | 4 | condition-control | 4.58 | -3.22 |
| Earthquake | 8 | hybrid-damage | 38.50 | -3.25 |
| Ranage's Circle | 4 | condition-control | 4.40 | -3.25 |
| Flammable Fumes | 5 | pure-damage | 7.00 | -3.28 |
| Burning Blossoms | 8 | hybrid-damage | 21.00 | -3.30 |
| Fallen Soldier's Lament | 4 | condition-control | 4.05 | -3.31 |
| Heinous Future | 6 | condition-control | 17.53 | -3.34 |
| Luring Wail | 4 | condition-control | 3.74 | -3.36 |
| Tomorrow's Dawn | 4 | condition-control | 3.52 | -3.39 |
| Swarming Wasp Stings | 4 | pure-damage | 3.50 | -3.43 |
| Life's Fresh Bloom | 4 | healing | 3.50 | -3.46 |
| Life's Flowing River | 4 | condition-control | 3.00 | -3.47 |
| Morass of Ages | 4 | condition-control | 2.64 | -3.53 |
| Sawtooth Terrain | 5 | pure-damage | 10.50 | -3.53 |
| Shape Stone | 4 | condition-control | 2.61 | -3.54 |
| Boil Blood | 8 | hybrid-damage | 55.00 | -3.54 |
| Indolent Haze | 7 | hybrid-damage | 15.00 | -3.55 |
| Infectious Melody | 4 | condition-control | 2.51 | -3.55 |
| Mantle of the Unwavering Heart | 5 | recovered-damage | 9.00 | -3.56 |
| Vitrifying Blast | 6 | hybrid-damage | 28.00 | -3.59 |
| Spike Stones | 4 | pure-damage | 3.00 | -3.62 |
| Grasping Earth | 4 | hybrid-damage | 3.50 | -3.64 |
| Mirecloak | 5 | hybrid-damage | 9.00 | -3.65 |
| Breath of Life | 5 | healing | 22.50 | -3.72 |
| Conquering Soldiers (Arrive) | 10 | hybrid-damage | 39.00 | -3.74 |
| Pressure Zone | 5 | condition-control | 7.65 | -3.76 |
| Transmute Rock And Mud | 5 | condition-control | 7.63 | -3.76 |
| Wyvern Sting | 5 | pure-damage | 7.50 | -3.78 |
| Radiant Heart of Devotion | 4 | condition-control | 1.16 | -3.78 |
| Fire Seeds | 6 | pure-damage | 14.00 | -3.84 |
| Nightmare | 4 | condition-control | 0.76 | -3.85 |
| Mantle of the Frozen Heart | 5 | recovered-damage | 7.00 | -3.85 |
| Mantle of the Magma Heart | 5 | recovered-damage | 7.00 | -3.85 |
| Mantle of the Melting Heart | 5 | recovered-damage | 7.00 | -3.85 |
| Anchoring Air | 4 | condition-control | 0.47 | -3.90 |
| Bounty of the Sky | 6 | healing | 14.00 | -3.97 |
| Seize Identity | 6 | hybrid-damage | 14.00 | -3.97 |
| Wall of Flesh | 5 | condition-control | 6.25 | -3.97 |
| Chromatic Armor | 4 | condition-control | 0.10 | -3.98 |
| Detonate Magic | 9 | pure-damage | 28.00 | -3.99 |
| Inexhaustible Cynicism | 7 | pure-damage | 21.00 | -4.05 |
| Confusing Cry | 5 | condition-control | 5.45 | -4.09 |
| Shadow Army | 10 | pure-damage | 33.00 | -4.18 |
| Power Word Kill | 9 | hybrid-damage | 50.00 | -4.20 |
| Synesthesia | 5 | condition-control | 4.31 | -4.27 |
| Mariner's Curse | 5 | condition-control | 4.25 | -4.28 |
| Jassim's Allegiance (Depart) | 10 | hybrid-damage | 35.00 | -4.33 |
| Purple Worm Sting | 6 | pure-damage | 10.50 | -4.34 |
| Shock and Awe | 5 | condition-control | 3.84 | -4.34 |
| Whispers of a Dead Goddess | 5 | condition-control | 3.81 | -4.34 |
| Infectious Comedy | 5 | condition-control | 3.23 | -4.44 |
| Synaptic Pulse | 5 | condition-control | 3.21 | -4.44 |
| Wave of Despair | 5 | condition-control | 3.13 | -4.45 |
| Nature's Reprisal | 6 | pure-damage | 6.00 | -4.51 |
| Stagnate Time | 5 | condition-control | 2.28 | -4.59 |
| Cloak of Colors | 5 | condition-control | 1.96 | -4.64 |
| Massacre | 9 | pure-damage | 31.50 | -4.72 |
| Etheric Shards | 5 | pure-damage | 2.50 | -4.75 |
| Blightburn Blast | 7 | pure-damage | 14.00 | -4.83 |
| Weapon of Judgment | 9 | pure-damage | 22.00 | -4.99 |
| Flames of Ego | 5 | condition-control | 0.03 | -4.99 |
| Lignify | 6 | condition-control | 6.00 | -5.01 |
| Nature Incarnate | 10 | condition-control | 32.83 | -5.27 |
| Field of Life | 6 | pure-damage | 4.50 | -5.33 |
| Spiritual Epidemic | 8 | condition-control | 17.56 | -5.33 |
| Corrosive Body | 7 | pure-damage | 10.50 | -5.34 |
| Fiery Body | 7 | recovered-damage | 10.50 | -5.34 |
| Summon Archmage | 8 | hybrid-damage | 10.50 | -5.35 |
| Garden of the Green Man's Growth | 10 | condition-control | 31.90 | -5.39 |
| Field of Razors | 6 | pure-damage | 5.00 | -5.40 |
| Vibrant Pattern | 6 | condition-control | 2.96 | -5.48 |
| Never Mind | 6 | condition-control | 2.93 | -5.49 |
| Frost Pillar | 6 | condition-control | 2.67 | -5.53 |
| Blanket of Stars | 6 | condition-control | 1.17 | -5.78 |
| Temporal Ward | 6 | condition-control | 0.81 | -5.84 |
| Leng Sting | 7 | pure-damage | 7.00 | -5.85 |
| Blinding Fury | 6 | condition-control | 0.09 | -5.98 |
| Cursed Metamorphosis | 6 | condition-control | 0.04 | -5.99 |
| Warp Mind | 7 | condition-control | 5.08 | -6.15 |
| Mask of Terror | 7 | condition-control | 4.38 | -6.26 |
| Summon Elemental Herald | 8 | condition-control | 10.82 | -6.29 |
| Summon Stampede | 7 | condition-control | 3.61 | -6.38 |
| Falling Sky | 8 | condition-control | 10.06 | -6.40 |
| Tempest of Shades | 7 | condition-control | 3.23 | -6.44 |
| Vacuum | 7 | condition-control | 3.07 | -6.46 |
| Chrysopoetic Curse | 7 | condition-control | 2.93 | -6.48 |
| Primal Herd | 10 | condition-control | 23.30 | -6.55 |
| True Target | 7 | condition-control | 0.47 | -6.90 |
| Control Sand | 7 | condition-control | 0.18 | -6.96 |
| Linnorm Sting | 9 | pure-damage | 13.00 | -6.98 |
| Nature's Enmity | 9 | recovered-damage | 11.00 | -7.01 |
| Confusing Colors | 8 | condition-control | 5.59 | -7.07 |
| Deluge | 8 | condition-control | 4.79 | -7.19 |
| Upheaval | 9 | condition-control | 10.52 | -7.34 |
| Divinity Leech | 9 | condition-control | 6.81 | -7.88 |
| Conquering Soldiers (Depart) | 10 | condition-control | 13.24 | -7.94 |
| Element Embodied | 10 | recovered-damage | 13.00 | -7.98 |
| Unspeakable Shadow | 9 | condition-control | 5.43 | -8.09 |
| Unfathomable Song | 9 | condition-control | 5.33 | -8.11 |
| Call Fluxwraith | 9 | condition-control | 4.88 | -8.18 |
| Storm of Vengeance | 9 | condition-control | 0.52 | -8.89 |
| Overwhelming Presence | 9 | condition-control | 0.07 | -8.98 |

</details>

## Typed unscored ledger (D30-8)

Total ledgered (any reason): 657

| Reason | Count | Examples |
|---|---|---|
| utility/no-mechanical-payload | 250 | Approximate, Deep Breath, Detect Magic, Detect Metal, Draw Moisture |
| long-cast (out of combat-damage scope) | 96 | Read Aura, Alarm, Breadcrumbs, Disguise Magic, Foraging Friends |
| beneficial-effect | 81 | Eat Fire, Glowing Trail, Root Reading, Ant Haul, Carryall |
| effect-item payload | 75 | Bullhorn, Inside Ropes, Light, Read the Air, Rousing Splash |
| raw-modifier-only (not priced — D30-5 restricts severity to condition tiers) | 65 | Figment, Forbidding Ward, Glamorize, Guidance, Infectious Enthusiasm |
| routing-ambiguous | 20 | Invoke True Name, Stabilize, Confetti Cloud (variant 1), Confetti Cloud (variant 2), Confetti Cloud (variant 3) |
| summon | 18 | Summon Instrument, Summon Animal, Summon Construct, Summon Fey, Summon Lesser Servitor |
| teleport/utility | 17 | Fated Confrontation, Far-Flung Fetch, Warping Pull, Behold the Weave, Rally Point |
| extraction edge case | 16 | Chromatic Ray, Chromatic Wall, Elemental Breath (Metal), Elemental Breath (Earth), Elemental Breath (Air) |
| non-literal formula (@item.rank arithmetic) | 9 | Flourishing Flora (Roots), Flourishing Flora (Flowers), Flourishing Flora (Cacti), Flourishing Flora (Fruits), Bloodspray Curse |
| low-confidence extraction | 5 | Advanced Scurvy, Blister Bomb, Internal Insurrection, Pest Swarm, Abyssal Plague |
| wall/terrain | 5 | Wall of Shrubs, Wall of Shadow, Wall of Water, Wall of Stone, Wall of Metal |

