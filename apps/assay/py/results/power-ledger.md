# assay — full-population power ledger (round 2/3)

## Ladder-scored population (n=400, non-cantrip n=369)

Rows with damage EV, sorted hottest -> coldest by residual rank-equivalent (EV vs. own nominal rank on the ladder).

The 158 hostile effect rows (no damage EV) are scored too, but by comparables, not the ladder: they get the top 5 official neighbors and a rank range (`results/comparables-corpus.json`; `uv run assay score --spell <path>` for a homebrew spell).

| Spell | Rank | Kind | EV | Residual (rank-equiv) |
|---|---|---|---|---|
| Disintegrate | 6 | pure-damage | 66.00 | +4.99 |
| Heaving Earth | 7 | hybrid-damage | 66.00 | +3.99 |
| One with the Land | 9 | recovered-damage | 97.50 | +3.86 |
| Dimensional Excision | 9 | pure-damage | 77.00 | +3.66 |
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
| … | | | | |
| Purple Worm Sting | 6 | pure-damage | 10.50 | -4.34 |
| Nature's Reprisal | 6 | pure-damage | 6.00 | -4.51 |
| Massacre | 9 | pure-damage | 31.50 | -4.72 |
| Etheric Shards | 5 | pure-damage | 2.50 | -4.75 |
| Blightburn Blast | 7 | pure-damage | 14.00 | -4.83 |
| Weapon of Judgment | 9 | pure-damage | 22.00 | -4.99 |
| Field of Life | 6 | pure-damage | 4.50 | -5.33 |
| Corrosive Body | 7 | pure-damage | 10.50 | -5.34 |
| Fiery Body | 7 | recovered-damage | 10.50 | -5.34 |
| Summon Archmage | 8 | hybrid-damage | 10.50 | -5.35 |
| Field of Razors | 6 | pure-damage | 5.00 | -5.40 |
| Leng Sting | 7 | pure-damage | 7.00 | -5.85 |
| Linnorm Sting | 9 | pure-damage | 13.00 | -6.98 |
| Nature's Enmity | 9 | recovered-damage | 11.00 | -7.01 |
| Element Embodied | 10 | recovered-damage | 13.00 | -7.98 |

<details><summary>Full non-cantrip ledger (369 rows)</summary>

| Spell | Rank | Kind | EV | Residual (rank-equiv) |
|---|---|---|---|---|
| Disintegrate | 6 | pure-damage | 66.00 | +4.99 |
| Heaving Earth | 7 | hybrid-damage | 66.00 | +3.99 |
| One with the Land | 9 | recovered-damage | 97.50 | +3.86 |
| Dimensional Excision | 9 | pure-damage | 77.00 | +3.66 |
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
| Necromancer's Generosity | 1 | healing | 8.50 | +0.29 |
| Horizon Thunder Sphere (variant 2) | 1 | hybrid-damage | 10.50 | +0.27 |
| Chilling Darkness | 3 | pure-damage | 17.50 | +0.25 |
| Holy Light | 3 | pure-damage | 17.50 | +0.25 |
| Moonlight Ray | 3 | pure-damage | 17.50 | +0.25 |
| Sudden Bolt | 2 | pure-damage | 26.00 | +0.24 |
| Animal Allies | 1 | pure-damage | 7.50 | +0.22 |
| Bandit's Doom | 5 | hybrid-damage | 36.00 | +0.15 |
| Repelling Pulse | 5 | hybrid-damage | 38.50 | +0.15 |
| Acidic Burst | 1 | pure-damage | 7.00 | +0.15 |
| Breathe Fire | 1 | pure-damage | 7.00 | +0.15 |
| Flense | 1 | hybrid-damage | 7.00 | +0.15 |
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
| Signal Skyrocket | 1 | hybrid-damage | 5.50 | +0.04 |
| Cutting Insult | 2 | hybrid-damage | 14.00 | +0.03 |
| Heat Metal | 2 | pure-damage | 14.00 | +0.03 |
| Worm's Repast | 2 | hybrid-damage | 14.00 | +0.03 |
| Attacked from Within | 7 | hybrid-damage | 54.00 | +0.02 |
| Flame Strike | 5 | pure-damage | 28.00 | +0.01 |
| Jassim's Allegiance (Arrive) | 10 | hybrid-damage | 65.00 | +0.01 |
| Corrosive Muck | 5 | pure-damage | 28.00 | +0.00 |
| Instant Minefield | 5 | hybrid-damage | 21.00 | +0.00 |
| Sudden Blight | 2 | pure-damage | 11.00 | -0.01 |
| Horizon Thunder Sphere (variant 3) | 1 | hybrid-damage | 10.50 | -0.02 |
| Hydraulic Push | 1 | pure-damage | 10.50 | -0.02 |
| Purifying Icicle | 1 | pure-damage | 10.50 | -0.02 |
| Concordant Choir (variant 1) | 1 | pure-damage | 5.00 | -0.03 |
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
| Feral Shades | 2 | pure-damage | 10.00 | -0.51 |
| Inner Radiance Torrent (variant 2) | 2 | pure-damage | 10.00 | -0.51 |
| Banishing Touch (3 actions) | 2 | recovered-damage | 7.00 | -0.51 |
| Inevitable Disaster | 5 | pure-damage | 55.00 | -0.54 |
| Trim the Blight | 9 | hybrid-damage | 66.00 | -0.55 |
| Wall of Fire | 4 | hybrid-damage | 14.00 | -0.55 |
| Cycle of Retribution | 1 | pure-damage | 2.50 | -0.55 |
| Nettleskin | 1 | pure-damage | 2.50 | -0.55 |
| Spider Sting | 1 | pure-damage | 2.50 | -0.55 |
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
| Mirror Malefactors | 5 | hybrid-damage | 31.50 | -0.72 |
| Splinter Volley (2 actions) | 2 | recovered-damage | 14.00 | -0.73 |
| Rainbow's End | 1 | hybrid-damage | 2.50 | -0.74 |
| Ash Cloud | 2 | hybrid-damage | 5.00 | -0.74 |
| Armor of Thorn and Claw | 1 | hybrid-damage | 1.00 | -0.81 |
| Curse of Lost Time | 3 | hybrid-damage | 14.00 | -0.84 |
| Undertow | 3 | recovered-damage | 14.00 | -0.84 |
| Ray of Corruption | 7 | pure-damage | 78.00 | -0.85 |
| Sudden Transposition | 8 | hybrid-damage | 55.00 | -0.85 |
| Dancing Fountain | 7 | hybrid-damage | 35.00 | -0.85 |
| Banishing Touch (2 actions) | 2 | recovered-damage | 7.00 | -0.85 |
| Umbral Mindtheft | 2 | pure-damage | 7.00 | -0.85 |
| Mercurial Stride | 4 | hybrid-damage | 21.00 | -0.86 |
| Illusory Creature | 2 | recovered-damage | 7.50 | -0.87 |
| Avenging Wildwood (Slashing) | 2 | pure-damage | 9.00 | -0.90 |
| Avenging Wildwood (Piercing) | 2 | pure-damage | 9.00 | -0.90 |
| Avenging Wildwood (Bludgeoning) | 2 | pure-damage | 9.00 | -0.90 |
| Dirge of Remembrance | 4 | pure-damage | 22.00 | -0.92 |
| Swallow Light | 2 | pure-damage | 7.00 | -0.92 |
| Gasping Marsh | 3 | hybrid-damage | 14.00 | -0.96 |
| Elemental Annihilation Wave (variant 2) | 3 | pure-damage | 14.00 | -0.97 |
| Elemental Annihilation Wave (2 Rounds) | 3 | pure-damage | 14.00 | -0.97 |
| Glass Sand | 3 | pure-damage | 14.00 | -0.97 |
| Arctic Rift | 8 | hybrid-damage | 54.00 | -0.97 |
| Desiccate | 8 | pure-damage | 55.00 | -0.99 |
| Phantom Orchestra | 6 | pure-damage | 28.00 | -0.99 |
| 30-foot Line | 7 | hybrid-damage | 49.00 | -1.07 |
| Shadow Raid | 7 | hybrid-damage | 27.00 | -1.08 |
| Deity's Strike | 7 | pure-damage | 45.50 | -1.11 |
| Ibex's Harvest (3 actions) | 3 | recovered-damage | 9.00 | -1.12 |
| Firework Blast | 3 | hybrid-damage | 14.00 | -1.12 |
| Gentle Breeze | 2 | healing | 10.00 | -1.12 |
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
| Sticky Fire | 2 | hybrid-damage | 4.50 | -1.55 |
| Banishing Touch (1 action) | 2 | recovered-damage | 3.50 | -1.55 |
| Imp Sting | 2 | pure-damage | 2.50 | -1.55 |
| Spirit Song | 8 | hybrid-damage | 49.00 | -1.57 |
| Blastback | 3 | pure-damage | 15.00 | -1.59 |
| Wall of Radiance | 3 | hybrid-damage | 7.00 | -1.60 |
| Pyrefowl Rebuke | 2 | hybrid-damage | 3.50 | -1.61 |
| Moonburst | 7 | hybrid-damage | 44.00 | -1.63 |
| Sunburst | 7 | hybrid-damage | 44.00 | -1.63 |
| Shadow Projectile | 3 | hybrid-damage | 13.50 | -1.64 |
| Flame Vortex | 6 | pure-damage | 18.00 | -1.65 |
| Geyser | 5 | pure-damage | 24.50 | -1.65 |
| Summon Healing Servitor | 5 | pure-damage | 13.50 | -1.67 |
| Healing Well | 5 | healing | 18.00 | -1.67 |
| Agonizing Despair | 3 | hybrid-damage | 14.00 | -1.73 |
| Blood-Feasting Breath | 5 | pure-damage | 17.50 | -1.75 |
| Rip the Spirit (variant 1) | 5 | hybrid-damage | 17.50 | -1.75 |
| Freezing Rain | 5 | hybrid-damage | 14.00 | -1.76 |
| Noxious Metals | 3 | hybrid-damage | 14.00 | -1.81 |
| Cloak of Light | 4 | pure-damage | 14.00 | -1.84 |
| Snake Fangs | 4 | recovered-damage | 14.00 | -1.84 |
| Divine Decree | 7 | hybrid-damage | 38.50 | -1.85 |
| Canticle of Everlasting Grief | 8 | hybrid-damage | 35.00 | -1.86 |
| Petal Storm | 4 | pure-damage | 11.00 | -1.87 |
| Cauterize Wounds | 2 | recovered-damage | 1.00 | -1.89 |
| Crimson Breath | 6 | pure-damage | 28.00 | -1.91 |
| Skeleton Army (Arrive) | 6 | hybrid-damage | 18.00 | -1.92 |
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
| Positive Attunement (Damage) | 3 | pure-damage | 4.50 | -2.24 |
| Call The Blood | 4 | hybrid-damage | 20.00 | -2.24 |
| Grasp of the Deep | 4 | hybrid-damage | 21.00 | -2.27 |
| Diadem of Divine Radiance | 5 | hybrid-damage | 18.00 | -2.27 |
| Murderous Vine | 4 | pure-damage | 19.50 | -2.28 |
| Rouse Skeletons | 3 | pure-damage | 7.00 | -2.33 |
| Rusting Grasp | 4 | recovered-damage | 10.50 | -2.34 |
| Spiritual Guardian | 5 | pure-damage | 13.50 | -2.44 |
| Horde of Underlings (Slashing) | 3 | pure-damage | 2.50 | -2.46 |
| Horde of Underlings (Bludgeoning) | 3 | pure-damage | 2.50 | -2.46 |
| Horde of Underlings (Piercing) | 3 | pure-damage | 2.50 | -2.46 |
| Black Tentacles | 5 | hybrid-damage | 10.50 | -2.51 |
| Slither | 5 | hybrid-damage | 10.50 | -2.51 |
| Necrotize | 6 | pure-damage | 42.00 | -2.52 |
| Holy Cascade | 4 | pure-damage | 10.50 | -2.56 |
| Voracious Gestalt | 9 | pure-damage | 49.00 | -2.57 |
| Acid Storm | 5 | pure-damage | 13.50 | -2.59 |
| Whirlpool | 8 | pure-damage | 33.00 | -2.63 |
| Blinding Foam | 5 | hybrid-damage | 27.50 | -2.64 |
| Anathematic Reprisal | 4 | hybrid-damage | 14.00 | -2.68 |
| Flowing Strike | 5 | pure-damage | 11.00 | -2.74 |
| Ravenous Darkness | 6 | pure-damage | 14.00 | -2.76 |
| Clockwork Devotion (Arrive) | 8 | pure-damage | 22.00 | -2.78 |
| Hypnopompic Terrors | 8 | hybrid-damage | 39.00 | -2.79 |
| Fire Shield | 4 | pure-damage | 7.00 | -2.85 |
| Necrotic Radiation | 4 | pure-damage | 7.00 | -2.85 |
| Blister | 5 | pure-damage | 24.50 | -2.88 |
| Implement of Destruction | 4 | recovered-damage | 7.00 | -2.92 |
| Invoke Spirits | 5 | hybrid-damage | 10.00 | -3.05 |
| Blinding Bottle | 5 | pure-damage | 10.50 | -3.09 |
| Stormburst | 5 | hybrid-damage | 21.00 | -3.15 |
| Whirlwind | 8 | pure-damage | 27.50 | -3.15 |
| Rip the Spirit (variant 2) | 5 | hybrid-damage | 17.50 | -3.17 |
| Wall of Ice | 5 | pure-damage | 7.00 | -3.18 |
| Poltergeist's Fury | 6 | pure-damage | 15.00 | -3.18 |
| Wails of the Damned | 9 | hybrid-damage | 44.00 | -3.18 |
| Beheading Buzz Saw | 7 | pure-damage | 27.50 | -3.22 |
| Vibrant Vibrato | 7 | hybrid-damage | 27.50 | -3.22 |
| Earthquake | 8 | hybrid-damage | 38.50 | -3.25 |
| Flammable Fumes | 5 | pure-damage | 7.00 | -3.28 |
| Burning Blossoms | 8 | hybrid-damage | 21.00 | -3.30 |
| Swarming Wasp Stings | 4 | pure-damage | 3.50 | -3.43 |
| Life's Fresh Bloom | 4 | healing | 3.50 | -3.46 |
| Sawtooth Terrain | 5 | pure-damage | 10.50 | -3.53 |
| Boil Blood | 8 | hybrid-damage | 55.00 | -3.54 |
| Indolent Haze | 7 | hybrid-damage | 15.00 | -3.55 |
| Mantle of the Unwavering Heart | 5 | recovered-damage | 9.00 | -3.56 |
| Vitrifying Blast | 6 | hybrid-damage | 28.00 | -3.59 |
| Spike Stones | 4 | pure-damage | 3.00 | -3.62 |
| Grasping Earth | 4 | hybrid-damage | 3.50 | -3.64 |
| Mirecloak | 5 | hybrid-damage | 9.00 | -3.65 |
| Breath of Life | 5 | healing | 22.50 | -3.72 |
| Conquering Soldiers (Arrive) | 10 | hybrid-damage | 39.00 | -3.74 |
| Wyvern Sting | 5 | pure-damage | 7.50 | -3.78 |
| Fire Seeds | 6 | pure-damage | 14.00 | -3.84 |
| Mantle of the Frozen Heart | 5 | recovered-damage | 7.00 | -3.85 |
| Mantle of the Magma Heart | 5 | recovered-damage | 7.00 | -3.85 |
| Mantle of the Melting Heart | 5 | recovered-damage | 7.00 | -3.85 |
| Bounty of the Sky | 6 | healing | 14.00 | -3.97 |
| Seize Identity | 6 | hybrid-damage | 14.00 | -3.97 |
| Detonate Magic | 9 | pure-damage | 28.00 | -3.99 |
| Inexhaustible Cynicism | 7 | pure-damage | 21.00 | -4.05 |
| Shadow Army | 10 | pure-damage | 33.00 | -4.18 |
| Power Word Kill | 9 | hybrid-damage | 50.00 | -4.20 |
| Jassim's Allegiance (Depart) | 10 | hybrid-damage | 35.00 | -4.33 |
| Purple Worm Sting | 6 | pure-damage | 10.50 | -4.34 |
| Nature's Reprisal | 6 | pure-damage | 6.00 | -4.51 |
| Massacre | 9 | pure-damage | 31.50 | -4.72 |
| Etheric Shards | 5 | pure-damage | 2.50 | -4.75 |
| Blightburn Blast | 7 | pure-damage | 14.00 | -4.83 |
| Weapon of Judgment | 9 | pure-damage | 22.00 | -4.99 |
| Field of Life | 6 | pure-damage | 4.50 | -5.33 |
| Corrosive Body | 7 | pure-damage | 10.50 | -5.34 |
| Fiery Body | 7 | recovered-damage | 10.50 | -5.34 |
| Summon Archmage | 8 | hybrid-damage | 10.50 | -5.35 |
| Field of Razors | 6 | pure-damage | 5.00 | -5.40 |
| Leng Sting | 7 | pure-damage | 7.00 | -5.85 |
| Linnorm Sting | 9 | pure-damage | 13.00 | -6.98 |
| Nature's Enmity | 9 | recovered-damage | 11.00 | -7.01 |
| Element Embodied | 10 | recovered-damage | 13.00 | -7.98 |

</details>

## Typed unscored ledger

Total ledgered (any reason): 657

| Reason | Count | Examples |
|---|---|---|
| utility/no-mechanical-payload | 250 | Approximate, Deep Breath, Detect Magic, Detect Metal, Draw Moisture |
| beneficial-effect | 185 | Bullhorn, Eat Fire, Glamorize, Glowing Trail, Guidance |
| long-cast (out of combat-damage scope) | 96 | Read Aura, Alarm, Breadcrumbs, Disguise Magic, Foraging Friends |
| routing-ambiguous | 35 | Figment, Forbidding Ward, Invoke True Name, Light, Protect Companion |
| raw-modifier-only (not priced — severity is priced only from condition tiers) | 23 | Airburst, Bane, Celestial Accord, Ill Omen, Infuse Vitality |
| summon | 18 | Summon Instrument, Summon Animal, Summon Construct, Summon Fey, Summon Lesser Servitor |
| extraction edge case | 16 | Chromatic Ray, Chromatic Wall, Elemental Breath (Metal), Elemental Breath (Earth), Elemental Breath (Air) |
| teleport/utility | 14 | Fated Confrontation, Far-Flung Fetch, Behold the Weave, Rally Point, Infiltrator's Tunnel |
| non-literal formula (@item.rank arithmetic) | 9 | Flourishing Flora (Roots), Flourishing Flora (Flowers), Flourishing Flora (Cacti), Flourishing Flora (Fruits), Bloodspray Curse |
| low-confidence extraction | 5 | Advanced Scurvy, Blister Bomb, Internal Insurrection, Pest Swarm, Abyssal Plague |
| wall/terrain | 5 | Wall of Shrubs, Wall of Shadow, Wall of Water, Wall of Stone, Wall of Metal |
| effect-item payload | 1 | Mirror Image |

