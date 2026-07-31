<!-- vol2 generated style — spell-list tables -->
<style>
  /* Homebrewery leaves tables at natural width; span the whole wide row.
     vol2SpellTable is a theme-NEUTRAL class name — the PHB theme's own
     spell-list class lays any child table into a ~160px sub-column, so it
     must not be reused here. 0.9em buys wrap headroom on long name/summary
     rows. (No mustache braces in this block — Homebrewery substitutes them
     even inside style tags.) */
  .page .vol2SpellTable table {
    width: 100%;
    font-size: 0.9em;
  }
  /* Narrow Rank/Actions columns, spell names single-line, Summary takes
     the remaining width. */
  .page .vol2SpellTable table th:nth-child(1),
  .page .vol2SpellTable table td:nth-child(1) {
    width: 3em;
  }
  .page .vol2SpellTable table td:nth-child(2) {
    white-space: nowrap;
  }
  .page .vol2SpellTable table th:nth-child(3),
  .page .vol2SpellTable table td:nth-child(3) {
    width: 4em;
  }
  /* In-statblock tables (random-effect tables like Eye Stalks' d8 rays)
     wrap long cells hard in a 302px column; smaller type + tighter cell
     padding keeps the worst block within one page, matching how official
     books set big tables. (0.85em left Eye Stalks 38px over on live audit;
     0.8em + 0.5mm padding measured it inside the page.) */
  .page .ruleBlock table {
    font-size: 0.8em;
  }
  .page .ruleBlock table td {
    padding: 0.5mm;
  }
</style>

{{frontCover}}

### PER ASPERA, AD ASTRA

# LITURGY OF THE IRIDITE

## VOLUME II · THE EIGHT SCHOOLS

<!-- ART SLOT [fm-cover]: {{imageWrapper,fullPage ![](URL) {top:-100px,left:-550px,width:1926px} }} — suggested subject: a lone caster silhouetted against the crack in the firmament, spell-light of all eight schools braiding upward into the second sun -->

\page

# Liturgy of the Iridite
### Volume II — The Eight Schools

:::

**Written & Compiled** :: Josh Bassin
**Spell Conversion & Review** :: Josh Bassin <!-- TODO: confirm/add reviewer credit -->
**Cover & Interior Art** :: TODO
**Cartography of the Astra** :: The chanceries of Belvedere, by their leave

:::

{{descriptive
##### Imprimatur
Set to type in Hallia, in the shadow of the Basilica, and distributed with the blessing (if not always the close reading) of the appropriate convox. The workings herein are recorded as they are practiced, not as any institution might prefer them to be practiced. Errors of transcription are the compiler's; errors of judgment are the caster's.
}}

:::

{{rightAligned
_Per aspera, ad astra._
}}

\page

# Reading This Book

You have already read the first volume, or you are the sort of person who starts with the spells. Either way, welcome. The first Liturgy told you what Færrin is: a once-mundane sphere near the galaxy's core, cracked open centuries ago and flooded with divinity, now busy industrializing its miracles. This second volume is about what Færrin *casts*.

Magic came to this planet late, and it came all at once. The rest of the Astra had millennia to let its traditions settle into comfortable ruts; Færrin got a firmament breach, a dark age, and then a gold rush. The result is a body of magic that grew up alongside radio towers, assembly lines, and actuarial tables -- practical, aggressive, occasionally litigated. Scholars of the Iridescent Church sorted these native workings into eight schools and bound them into the canon they call the Liturgy: **antillurgy**, magic turned against magic; **chronomancy**, the magic of when; **gestalt**, the shapeshifter's refinement; **kosmoturgy**, the levers of the cosmos; **memetics**, the magic of minds and the ideas that inhabit them; **mercuromancy**, the bending of fate; **planara**, the reaching across realities; and **seraphic**, which is discussed last, briefly, and with the respect one affords a loaded weapon.

Each school receives a chapter: first the school as Færrin knows it -- who practices it, who profits from it, who lies awake because of it -- and then its codified spells in full.

{{note
##### These Spells Are Setting-Native
Every working in this volume was developed on Færrin, inside the firmament, by Færrish casters. None of them appear in the standard canons of the wider Astra, and a traveler abroad should expect blank stares (or professional interest, or arrest) when producing them. At your table, treat them as uncommon at minimum: access flows through the schools' practitioners, institutions, and archives described in each chapter, or however else your GM sees fit.
}}

\column

<!-- ART SLOT [fm-reading]: {{imageWrapper,fullSidebarRight {{borderImage ![](URL) {top:0px,left:-160px,width:650px} }} }} — suggested subject: a cluttered scriptorium desk in Hallia — spell diagrams, a smoldering censer, a half-drunk coffee, a fax machine -->

{{pageNumber,auto}}

\page

## How to Read a Spell Block

A brief word from your compilers, with the liturgical register set aside: the entries in this book use the same conventions as any remastered spell reference, and if you have cast so much as a cantrip you already know how to read them. For everyone else, the short course follows.

**Rank.** Every spell has a rank from 1 to 10 that measures its raw magnitude. Casters grow into higher ranks; a rank-9 working is the business of archmages, and rank 10 is the business of chapter eight. When this book says a spell "heightens," it means the spell can be cast using a higher rank for a stronger effect -- each entry's **Heightened** lines spell out exactly what improves.

**Traditions.** Each entry lists which of the four traditions -- arcane, divine, occult, primal -- can learn it. The schools of the Liturgy are not traditions; they are bodies of technique that cut across them. A Church exorcist and a Belvedere theorist may cast the same antillurgic ward and agree on nothing else.

**Actions.** The glyphs beside a spell's name tell you its casting cost: one, two, or three action glyphs for casts made in the flow of combat, a reaction glyph for casts made on someone else's time, and a free-action glyph for casts that cost nothing but the thought. Some entries instead list a casting time in minutes or hours; clear your afternoon.

**Traits.** Every spell in this volume carries its school's trait -- an antillurgy spell is *antillurgy*, wherever it goes and whoever casts it. The remaining traits work as standard: *concentrate*, *manipulate*, *curse*, *incapacitation*, and their kin mean exactly what they mean everywhere else in the remastered rules.

**Rituals.** A handful of workings in this book are too large for spell slots -- they are rituals, cast over hours or days, often by more than one participant. Færrish convention is firm on this point: if it takes longer than an hour, it is a ritual, and it will say so.

{{descriptive
##### On the Summaries
Each chapter opens its spell list with a table of one-line summaries. These are the compiler's plain-language cribs, not rules text. When a summary and a spell block disagree, the spell block wins, and the compiler apologizes.
}}

{{pageNumber,auto}}

\page

{{toc
# Contents

- ## [{{ Chapter 1 — Antillurgy}}{{ 6}}](#p6)
- ## [{{ Chapter 2 — Chronomancy}}{{ 15}}](#p15)
- ## [{{ Chapter 3 — Gestalt}}{{ 27}}](#p27)
- ## [{{ Chapter 4 — Kosmoturgy}}{{ 37}}](#p37)
- ## [{{ Chapter 5 — Memetics}}{{ 50}}](#p50)
- ## [{{ Chapter 6 — Mercuromancy}}{{ 66}}](#p66)
- ## [{{ Chapter 7 — Planara}}{{ 75}}](#p75)
- ## [{{ Chapter 8 — Seraphic}}{{ 87}}](#p87)
}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 1
# Antillurgy
___
}}

There is an old joke in the dueling halls of Hallia: the most dangerous mage in any room is the one who hates magic professionally. Antillurgy is that hatred, refined into a curriculum. It is magic turned against magic -- the art of drinking a hostile spell out of the air, of pinching a rival's power off at the source, and, at its terrible height, of severing a caster from spellcasting altogether. Its practitioners will tell you, with straight faces, that theirs is the only honest school in the Liturgy. Everyone else makes more magic. They clean it up.

The school is a Færrish invention born of a Færrish problem. When the firmament cracked, power arrived centuries before restraint did, and the dark ages that followed were an education in what unopposed spellwork does to a city. The first antillurgists were survivors of that lesson -- hedge-wardens who learned to smother a warlord's fireflood one desperate absorption at a time. Their heirs are considerably better dressed. Today every Org that can afford one keeps an antillurgist on retainer the way it keeps a lawyer, and for the same reason: not because trouble is certain, but because trouble is *expensive*. The Scale's Arbiters study the school as a matter of course, since the fugitives they collect rarely come quietly, and rarely come unarmed.

Much of the working canon descends from a single irascible master: Almonk, called the Unmoved, who spent a long career being shot at by his betters and inconveniencing them in return. His signature siphon -- a small black orb that orbits the caster's head and swallows an incoming spell whole, refunding the drinker a measure of what was spent on it -- remains the school's calling card, and his retribution, a standing fire that scorches anyone reckless enough to cast within it, remains its clearest statement of intent. Apprentices, meanwhile, still begin where apprentices have always begun: with the Macabredanse, a gutter-cantrip of flickered candles and stolen sparks, taught first because it teaches the essential antillurgic reflex -- that all magic, however grand, is just *material*.

It is at the far end of the syllabus that the public grows quiet. A censure that shutters a caster's gift entirely; a zone in which every working, friend or foe, is ground down to its barest minimum -- these are not wards, they are verdicts. Spellcasters treat a known antillurgist the way duelists treat a pacifist with a loaded gun: politely, and from a distance. The antillurgists, for their part, seem to enjoy this.

{{note
##### From *On First Principles*, attributed to Almonk the Unmoved
A spell is not a miracle. A spell is fuel, briefly organized. The caster across the field has spent years learning to organize it and will be gravely offended when you decline to be impressed. Decline anyway. Drink their masterpiece. Pocket the change. Offense has never killed anyone -- which is more than can be said for organized fuel.
}}

<!-- ART SLOT [ch1-antillurgy]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a composed antillurgist mid-duel, black siphon-orb orbiting their head as it swallows an incoming lance of spellfire -->

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{wide,vol2SpellTable
##### Antillurgy Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Antimagic Shroud | {{aa}} | Absorb a spell's sting, erupt at its caster |
| 1 | Elemental Sink | {{aa}} | Sustained sink amplifies damage with elemental riders |
| 1 | Macabredanse | {{aa}} | Cantrip of three minor antillurgical tricks |
| 2 | Disperse Magic | {{r}} | Reaction: save bonus and better basic-save degree |
| 2 | Divine Regression | {{aa}} | Afflicted target's healing becomes void damage |
| 2 | Poisoned Backflow | {{aa}} | Curse punishes casting healing spells on others |
| 3 | Almonk's Arcane Drain | {{aa}} | Tear spell slots from a failing caster |
| 3 | Almonk's Arcane Siphon | {{aa}} | Orbiting orb devours a spell, refunds slots |
| 3 | Festering Slick | {{a}} | Weapon slick: void damage, blocks healing |
| 4 | Arcane Interdiction | {{aa}} | Emanation: enemy spells risk fizzling entirely |
| 4 | Phlogistic Shield | {{aa}} | Floating lens negates spells passing through |
| 5 | Almonk's Retribution | {{aa}} | Burning zone punishes every spellcaster within |
| 5 | Focus Break | {{aa}} | End a sustained spell, possibly stunning |
| 5 | Reduce Resistivity | {{aa}} | Penalize a foe's saves against spells |
| 6 | Thaumaturgic Inhibition | {{aa}} | Emanation weakens spells cast within it |
| 6 | Thaumaturgic Obstruction | {{aa}} | Emanation makes enemy spells cost extra actions |
| 7 | Containment Orbs | {{aa}} | Three orbs each devour one tradition's spell |
| 7 | Return Spell | {{aa}} | Ward lets an ally reflect spells back |
| 7 | Sapping Lightning | {{aa}} | Lightning line that burns away spell slots |
| 8 | Zone of Minimization | {{aa}} | Zone forces all damage dice to minimum |
| 9 | Arcane Censure | {{aa}} | Curse severs a caster from magic entirely |
}}

{{ruleBlock
{{preamble
{{title Antimagic Shroud}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Targets** :: you
**Defense** :: basic Reflex
**Duration** :: 10 minutes
}}

A black, translucent shroud of absorbed magical energy clings to your body. The first time you take damage from a spell or magical effect while the shroud is active, the shroud violently erupts outward toward the source of that spell, and the spell ends. The creature that targeted you with that spell must attempt a basic Reflex save against your spell DC; on a failure it takes 2d4 force damage as the shroud's energy detonates outward. Whether the Reflex save succeeds or fails, the shroud dissipates after it triggers.

{{postamble
**Heightened (+1)** :: The retributive damage increases by 1d4.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Elemental Sink}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature
**Duration** :: sustained up to 1 minute
}}

You form an elemental sink on a creature you can see within range. Choose one damage type when you cast the spell: acid, cold, electricity, fire, or sonic. While the spell is sustained, each time the target takes damage from a Strike or spell it takes an additional 3d4 damage of the chosen type. If you roll the maximum value on any of this additional damage's dice, the sink also causes an extra effect depending on the chosen damage type, as shown below.

|  |  |
|:---:|:---:|
| Damage Type | Effect |
| Acid | One creature adjacent to the target takes 1 acid damage. |
| Cold | The target's Speed is reduced by 10 feet until the end of its next turn. |
| Electricity | The target cannot take reactions until the end of its next turn. |
| Fire | The target sheds bright light in a 10-foot emanation until the end of its next turn, and the next Strike against it before the end of its next turn gains a +1 circumstance bonus to the attack roll. |
| Sonic | The target is pushed 5 feet away from you. |

If the target is reduced to 0 HP while the spell is sustained, you can move the sink to a new creature within range as a free action when you Sustain the Spell on your next turn.

{{postamble
**Heightened (+2)** :: The additional damage increases by 3d4.
}}
}}

{{ruleBlock
{{preamble
{{title Macabredanse}} {{aa}} {{spacer}} {{kind Cantrip}} {{level 1}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Cantrip}}{{trait Concentrate}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 10 feet
**Duration** :: 10 minutes
}}

You conjure one of three minor antillurgical effects within range. Choose one when you Cast the Spell:

- **Memento** You create a brief, harmless sensory effect: flickering candles, a puff of cold wind, a cacophony of unintelligible whispers, or the faint odor of decay. This is purely cosmetic and lasts only a moment.
- **Tiny Thrall** You animate the bones or corpse of a Tiny dead creature within range, raising it as a harmless Tiny undead with no attack and Speed 10 feet. The creature is friendly to you, can understand your spoken words, but cannot speak. It cannot act in combat; it has 1 HP and is destroyed if it takes any damage. It persists for up to 10 minutes and then crumbles.
- **Wither** You instantly spoil a single discrete portion of perishable organic matter you can see within range: a flower wilts, meat goes bad, milk curdles. This affects an amount no larger than 1 cubic foot.

You may have up to two non-instantaneous Macabredanse effects active at a time. Dismissing an active effect is a single action with the concentrate trait.
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Disperse Magic}} {{r}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Trigger** :: You are forced to attempt a saving throw against a spell or magical effect.
**Range** :: self
**Targets** :: you
}}

You redirect incoming magical energy back into the surrounding field. You gain a +2 circumstance bonus to the triggering saving throw. Additionally, if the triggering effect requires a basic saving throw, you get a result one degree of success better than you rolled.
}}

{{ruleBlock
{{preamble
{{title Divine Regression}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: touch
**Targets** :: 1 creature
**Duration** :: 1 minute
}}

You reverse the flow of vital energy within a creature, weaponizing its own capacity for recovery. Make a melee spell attack roll against the target. On a hit, the target takes 3d8 void damage and is afflicted with Reversed Vitality for 1 minute. While afflicted, any time the target would regain HP from any source, it instead takes void damage equal to the amount it would have healed, and regains no HP. At the end of each of the target's turns, it can attempt a Fortitude save against your spell DC; a success reduces the duration remaining by half, and a critical success ends the effect immediately. The affliction ends if a successful counteract check is made against this spell's rank.

{{postamble
**Heightened (+1)** :: The initial void damage increases by 1d8.
}}
}}

{{ruleBlock
{{preamble
{{title Poisoned Backflow}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Curse}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: arcane, divine, occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 day
}}

You lay your hand on a creature and poison the thread that ties it to the magical fabric of the world. The target is cursed unless it succeeds at a Will saving throw.

While cursed, each time the target restores Hit Points to another creature by Casting a Spell with the healing trait, the backflowing taint tears through it, dealing 3d6 void damage to the cursed target. This damage occurs once per healing spell cast, regardless of how many creatures the healing spell affects.

The curse can be removed only with a successful counteract check against this spell's rank.

**Critical Success** The target is unaffected and becomes temporarily immune to this spell for 24 hours.

**Success** The target is unaffected.

**Failure** The target is cursed for 1 day.

**Critical Failure** The target is cursed for 1 day and immediately takes 3d6 void damage.
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Almonk's Arcane Drain}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 120 feet
**Targets** :: 1 creature with spell slots or focus points
**Defense** :: Will
}}

A silvery ray of disruptive energy shoots from your outstretched hand, tearing at the target's connection to arcane or spiritual power. The target must attempt a Will saving throw.

**Critical Success** The target is unaffected and is temporarily immune to Almonk's Arcane Drain for 1 day.

**Success** The target loses one 1st-rank spell slot.

**Failure** The target loses its highest available spell slot of rank 4 or lower.

**Critical Failure** As failure, but the target loses two spell slots instead of one.

{{postamble
**Heightened (+1)** :: The maximum rank of spell slot the target can lose on a failure increases by 1.
}}
}}

{{ruleBlock
{{preamble
{{title Almonk's Arcane Siphon}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

A small black orb manifests and orbits your head, drawing magical energy toward itself like a drain. The orb can intercept one single-target spell of rank 3 or lower. If such a spell is cast while the orb is active, the orb devours the incoming magic before it takes effect.

When the orb absorbs a spell in this way: the spell's effect is completely negated against you; you regain one expended spell slot of rank one lower than the absorbed spell. If the absorbed spell was rank 1, you instead gain 1 temporary Focus Point (which can be spent normally and lasts until the end of your next turn) rather than a spell slot. The orb then vanishes and the spell ends.

{{postamble
**Heightened (+1)** :: The maximum rank of spell the orb can absorb increases by 1.
}}
}}

{{ruleBlock
{{preamble
{{title Festering Slick}} {{a}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Void}}
}}

{{definitions
**Traditions** :: arcane, divine, occult
**Range** :: touch
**Targets** :: 1 melee weapon you are holding
**Duration** :: 1 minute
}}

You speak a word of antillurgic power and coat a melee weapon you are holding with a slick of festering void energy. The next successful attack with the weapon deals an additional 3d6 void damage and applies festering corruption for 1 minute. While a creature is affected by festering corruption, it cannot regain Hit Points by any method.

{{postamble
**Heightened (+1)** :: The void damage on trigger increases by 1d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Arcane Interdiction}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Aura}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane
**Range** :: self
**Area** :: 60-foot emanation
**Duration** :: sustained up to 1 minute
}}

You stress the threads of magical energy in a 60-foot emanation, making it harder for spells to manifest within the area. Any enemy that attempts to Cast a Spell while inside the emanation must succeed at a flat check of DC 5 + the spell's rank or the spell is lost; the slot is expended and the spell has no effect.

Creatures entering the area mid-turn must attempt the flat check if they cast a spell on that same turn.

{{postamble
**Heightened (+2)** :: The flat check DC to cast spells in the area increases by 2.
}}
}}

{{ruleBlock
{{preamble
{{title Phlogistic Shield}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 30 feet
**Duration** :: 1 minute
}}

You conjure a shimmering, lens-shaped barrier of condensed phlogiston within 30 feet of you. The lens is 10 feet wide and 10 feet tall. Any spell of rank 4 or lower whose line of effect to its target passes through the lens is completely blocked and negated; the spell is lost and its slot is expended normally. Spells you cast are not blocked by your own Phlogistic Shield.

Area effects are not blocked: if a spell's area originates outside the lens and overlaps with the area on the other side, the overlapping area still affects creatures normally.

As a single action (which has the concentrate trait), you can move the lens to any unoccupied space within 30 feet of you.

{{postamble
**Heightened (+1)** :: The maximum rank of spells blocked increases by 1.
}}
}}

{{ruleBlock
{{preamble
{{title Almonk's Retribution}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Fire}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 500 feet
**Area** :: 30-foot burst
**Defense** :: basic Fortitude
**Duration** :: 1 minute
}}

You ignite the surrounding magic in a 30-foot-radius sphere centered on a point you can see within range. The flames persist for the duration.

Whenever a creature within the area casts a spell or uses a magical ability that requires its own concentrate or manipulate action, the flames scorch them, dealing 11d6 fire damage. That creature must attempt a Fortitude save. Their spell or ability functions normally regardless of the save result; Almonk's Retribution punishes rather than interrupts.

**Critical Success** The creature takes no damage.

**Success** The creature takes half damage.

**Failure** The creature takes full damage.

**Critical Failure** The creature takes 12d6 fire damage.

{{postamble
**Heightened (+1)** :: The damage on failure increases by 1d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Focus Break}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature currently Sustaining a spell
**Defense** :: Fortitude
}}

You project a ripple of disruptive antimagic energy at a creature maintaining a sustained spell or other ongoing magical effect. The creature must attempt a Fortitude saving throw.

**Critical Success** The creature is unaffected and the magical effect it was sustaining continues normally.

**Success** The creature's sustained spell or effect ends immediately.

**Failure** The creature's sustained spell or effect ends immediately, and the creature is Stunned 1.

**Critical Failure** The creature's sustained spell or effect ends immediately, and the creature is Stunned 2.
}}

{{ruleBlock
{{preamble
{{title Reduce Resistivity}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

You tear at the magical defenses of a target creature, leaving its arcane shielding in tatters. The creature must attempt a Fortitude saving throw.

**Critical Success** The creature is unaffected.

**Success** The creature takes a –1 status penalty to saving throws against spells for 1 round.

**Failure** The creature takes a –1 status penalty to saving throws against spells for 1 minute.

**Critical Failure** As failure, but the penalty is –2 to saving throws against spells.
}}

{{ruleBlock
{{preamble
{{title Thaumaturgic Inhibition}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Area** :: 60-foot emanation
**Duration** :: 1 minute
}}

You weave antillurgic interference through the ambient aether, throttling spellcasting within the sphere. Any creature other than you that casts a spell while within the 60-foot emanation must attempt a DC equal to your spell DC check using its key spellcasting attribute. On a failure, the spell is cast as if using the lowest possible spell slot that could produce it (minimum rank 1), and the spell's damage dice each roll one lower than normal (minimum 1 per die). On a success, the spell takes effect normally.
}}

{{ruleBlock
{{preamble
{{title Thaumaturgic Obstruction}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Aura}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Area** :: 60-foot emanation
**Duration** :: sustained up to 1 minute
}}

You envelope yourself in a field of temporal-aetheric drag that slows the casting process for all spellcasters other than yourself within range. While you sustain this spell, any creature within the 60-foot emanation (other than you) that casts a spell requires one additional action beyond the spell's normal casting time. Spells that normally require 1 action to cast require 2 actions; spells requiring 2 actions require 3 actions; spells requiring 3 actions cannot be cast at all while within the emanation. Free-action and reaction spells are unaffected.
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Containment Orbs}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Defense** :: basic Reflex
**Duration** :: 10 minutes
}}

Three small orbs of multicolored force orbit you. When you cast Containment Orbs, assign each orb one magical tradition: arcane, divine, occult, or primal. Each orb can absorb the next spell of its assigned tradition that targets you or includes you in its area, negating that spell entirely. An orb can absorb only one spell and is then loaded. As a 2-action activity (concentrate, manipulate), you can cause a loaded orb to detonate: all creatures within 20 feet of you take force damage equal to 3d6 per rank of the absorbed spell, with a basic Reflex save against your spell DC. Each detonated orb is destroyed. When the spell ends, any remaining orbs dissolve harmlessly.

{{postamble
**Heightened (+1)** :: You gain one additional orb.
}}
}}

{{ruleBlock
{{preamble
{{title Return Spell}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 8 hours
}}

You weave a ward of antimagic deflection around a willing creature. For the duration, when a spell that requires a saving throw targets the warded creature, the creature can use its reaction to attempt to reflect the spell back at the caster. The target of the reflected spell attempts a saving throw against it. On a success, the spell rebounds again to the other party, who then attempts a saving throw of their own; on another success, it rebounds again. This continues until one party fails its save, at which point the spell takes full effect on whichever party just failed and stops rebounding. If six total saving throws have been made — three by each party — without a failure, the spell dissipates harmlessly. If the reflected spell has an area that partially covers the warded creature, only the portion targeting the warded creature is reflected; the rest functions normally on other targets in the area.
}}

{{ruleBlock
{{preamble
{{title Sapping Lightning}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Electricity}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Area** :: 120-foot line
**Defense** :: basic Reflex
}}

You unleash a beam of antillurgic energy from your fingertips in a sizzling 120-foot line. Each creature in the line must attempt a Reflex save against 9d12 electricity damage.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and its highest-rank spell slot is lost.

**Critical Failure** As failure, but double damage.

{{postamble
**Heightened (+1)** :: The electricity damage increases by 1d12.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{ruleBlock
{{preamble
{{title Zone of Minimization}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 120 feet
**Area** :: 20-foot burst
**Duration** :: 1 minute
}}

You saturate an area with antillurgic energy that collapses all damage potential within it to its barest minimum. For the duration, creatures inside the burst deal minimum damage on all of their damage rolls: each die result counts as 1, though flat damage bonuses are unaffected. This effect applies to all creatures inside the zone regardless of alliance, including you.

The zone does not affect damage from spells or abilities that originate entirely outside the zone.
}}

{{ruleBlock
{{preamble
{{title Arcane Censure}} {{aa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,unique Antillurgy}}{{trait Concentrate}}{{trait Curse}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature with spellcasting ability
**Defense** :: Will
**Duration** :: varies (see text)
}}

You sever a creature's connection to the magical wellspring of its power, imposing the Arcane Censure curse. The target must attempt a Will save.

The curse, if applied, prevents the target from Casting Spells and from using innate magical abilities.

**Critical Success** The target is unaffected.

**Success** The target is Stupefied 2 for 1 hour.

**Failure** The target is afflicted with the Arcane Censure curse for 1 week, during which it cannot Cast Spells or use innate magical abilities. At the end of each day, it may attempt a new Will save; on a success, the curse ends.

**Critical Failure** The target is afflicted with the Arcane Censure curse indefinitely. Only a counteract attempt at rank 9 or a specific restoration effect can end it.
}}

{{pageNumber,auto}}
{{footnote Chapter 1 | Antillurgy}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 2
# Chronomancy
___
}}

Somewhere in Velthara right now, a root cellar is defying entropy. The preserves in it will taste of last summer forever, because a traveling caster was paid three coins and a hot meal to freeze time inside the jars. This is chronomancy at its most domestic, and it is worth holding onto that image, because the rest of the school is considerably less cozy. Chronomancy is the magic of time's flow -- of *when* rather than *what*. Its practitioners displace creatures out of the timeline entirely, rewind wounds into the past, and force moments to replay until they come out differently. A chronomancer does not change what happens. They change when it happens, which turns out to be the same thing with better paperwork.

The school's respectable face is everywhere in Færric commerce. Lyrr, a Fenrithi weatherworker who never once lost a cargo, gave the maritime world her chronomantic shell -- a traveling bubble of borrowed calm inside which the sea is always the sea of a gentler hour, and which convoy insurers now price into their premiums. Laixa's historical tracker, a charmed lens that replays the recent past of a road or room, has become standard issue for constables and Belvedere archivists alike, to the lasting irritation of everyone with something to hide. And in every port city there are licensed menders who will, for a fee that scales alarmingly with the injury, pull yesterday's wound backward out of your flesh and take a share of it into their own.

Then there is the sharp end. Battlefield chronomancers steal moments outright -- a mercenary captain thrust three rounds into the future returns to find her company dead and the war impolitely continued without her. The wealthy commission temporal checkpoints before doing anything stupid, which has made certain Austrene sports both more survivable and much worse. And the school's masters can lift a creature out of time altogether, to a place where nothing ages, nothing thinks, and nothing waits, because waiting requires a *when*.

All of which explains why chronomancy is the only school of the Liturgy with its own dedicated police. The Timekeepers of the Scale hold a standing mandate to prevent meddling with the timestream, and they pursue paradox the way other lawmen pursue arson -- as a crime whose victims include the neighborhood. Practitioners describe the relationship as cordial. They describe it that way very carefully.

There is one working the Timekeepers have never once objected to. On clear nights, a chronomancer may dissolve the newly dead into stardust and hang them in the sky as a constellation, outside the reach of decay, until the family can afford the resurrection. Look up from any Austrene observatory and you can see them: the waiting dead, burning patiently. Even the Scale agrees that some appointments should be kept late.

{{note
##### Notice of Practice — Posted by Order of the Scale
The bearer is reminded that workings which displace a creature from the timestream, revise a completed event, or propagate effect ahead of cause are classified acts under the Concord of Hours and are witnessed *as they occur, from the outside, regardless of local sequence*. Timekeepers do not accept "it hasn't happened yet" as a plea. It has. Kindly conduct yourself accordingly.
}}

<!-- ART SLOT [ch2-chronomancy]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a memorial constellation rising from a dissolving body into the night sky above an Austrene observatory, mourners lit by starlight -->

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{wide,vol2SpellTable
##### Chronomancy Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Preserve Foodstuffs | 1 minute | Container's contents never age or spoil |
| 1 | Tunnel Vision | {{aa}} | Initiative bonus; once, roll initiative twice |
| 2 | Deja Vu | {{r}} | Reaction: foe relives the damage just dealt |
| 2 | Laixa's Historical Tracker | {{aa}} | Lens reveals an area's recent past |
| 2 | Time Step | {{a}} | Vanish outside time until next turn |
| 3 | Lend Time | {{r}} | Give your entire turn to an ally |
| 3 | Lyrr's Chronomantic Shell | {{aa}} | Traveling shell of calm, moderated weather |
| 3 | Nightfall | {{aa}} | Cylinder of premature midnight and starlight |
| 3 | Rewind and Playback | {{aa}} | Heal by channeling wounds into yourself |
| 4 | Celestial Preservation | 1 hour | Preserve the dead as a waiting constellation |
| 4 | Ebb and Flow | {{aa}} | Zone hastens allies, slows failing enemies |
| 4 | Force Drumfire | {{aa}} | Force missiles loop back to strike again |
| 4 | Reset | {{aa}} | Force initiative rerolls favoring your side |
| 4 | Temporal Discharge | 10 minutes | Object trap discharges stored elemental burst |
| 4 | Temporal Threshold | 1 minute | Doorway trap of violently conflicting time-flows |
| 5 | Jolt | {{aa}} | Grant allies an immediate extra action |
| 5 | Legend Killer | {{a}} | Suppress a foe's mythic abilities |
| 5 | Repetitious Trauma | {{aa}} | Foe relives damaging moment each sustained round |
| 5 | Revisit | {{aa}} | Snap back to a recently occupied spot |
| 5 | Wall of Time | {{aa}} | Temporal wall slows those passing through |
| 6 | Chrysalis | 10 minutes | Cocoon compresses eight-hour rest into one |
| 6 | Fast-Forward | {{aa}} | Curse ages a foe decades in moments |
| 6 | Time Loop | {{aa}} | Foe must replay its previous turn |
| 7 | Anomalous Object | {{aa}} | Hold an object twice via temporal duplicate |
| 7 | Cone of Decay | {{aa}} | Cone of accelerated rot and void damage |
| 8 | Outside of Time | {{aa}} | Pluck a target wholly out of time |
| 8 | Stolen Moment | {{aa}} | Thrust a foe forward through time |
| 9 | Checkpoint | {{aa}} | Instead of falling, target heals massively once |
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Preserve Foodstuffs}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, primal
**Cast** :: 1 minute
**Range** :: touch
**Targets** :: 1 container of up to 10 cubic feet volume
**Duration** :: until opened
}}

You freeze time within a closed container, perfectly preserving all contents inside. While the spell is active, nothing inside the container ages, spoils, rots, or changes state; perishables remain indefinitely fresh. It automatically fails if any living creature is inside when the spell is cast. The spell ends immediately when the container is opened. This spell can preserve containers of up to 10 cubic feet in volume.

{{postamble
**Heightened (3rd)** :: The container volume increases to 50 cubic feet. You can also target multiple sealed containers up to that combined volume.
}}
}}

{{ruleBlock
{{preamble
{{title Tunnel Vision}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 8 hours
}}

You imbue a willing creature with an acute foresight that sharpens its reflexes just before danger strikes. For the duration, the target gains a +1 status bonus to initiative rolls. Additionally, once during the duration, the target can invoke the foresight as a free action at the start of a combat to roll initiative twice and take the higher result. If you Cast this Spell again, any prior casting of it ends.
}}

{{ruleBlock
{{preamble
{{title Deja Vu}} {{r}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Trigger** :: A creature within range is damaged by an attack or effect.
**Range** :: 30 feet
**Targets** :: 1 creature
**Defense** :: Will
}}

You twist time to force a creature to relive the worst moment of its recent past. The target must attempt a Will save against your spell DC.

**Success** The target is unaffected.

**Failure** The target takes damage of the same type equal to the triggering damage, to a maximum of 30.

**Critical Failure** As failure, but the echoed damage has no maximum.

{{postamble
**Heightened (+1)** :: The maximum echoed damage increases by 6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Laixa's Historical Tracker}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: self
**Targets** :: you
**Duration** :: 10 minutes
}}

You imbue a small looking glass or lens with chronomantic energy. For the duration, you can use a single Seek action to glimpse into the recent past of a path, road, corridor, or open area within 30 feet of you, seeing the footprints of the last creature that traveled through as ghostly, shimmering footsteps only you can see. You learn the creature's size and the direction it was headed.

{{postamble
**Heightened (4th)** :: You can identify the ancestry or creature type of the tracked creature in addition to its size and direction.
**Heightened (6th)** :: If the tracked creature has a proper name and is known to you, you also learn that name.
}}
}}

{{ruleBlock
{{preamble
{{title Time Step}} {{a}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: self
**Targets** :: you
**Duration** :: until the start of your next turn
}}

You briefly step forward through time, vanishing from your current location. You disappear until the start of your next turn. While displaced, you cannot be targeted by any effect, cannot be detected, cannot observe or interact with the world, and are not affected by anything that happens in your absence.

At the start of your next turn, you reappear in any unoccupied space within 30 feet of where you vanished. You cannot cast this spell twice in a row.
}}

{{ruleBlock
{{preamble
{{title Lend Time}} {{r}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Trigger** :: Immediately before your turn begins.
**Range** :: 60 feet
**Targets** :: 1 willing ally, or 2 willing allies
**Duration** :: until the end of the ally's turn
}}

You lend your turn to a willing ally within range. You forfeit all three of your actions and your reaction this turn. In exchange, one willing ally you can see within 60 feet immediately gains one extra turn, inserted right now in the initiative order. The ally takes a complete turn: they gain 3 actions and 1 reaction as normal. Their position in the initiative order is otherwise unchanged; they still act again when their own turn arrives. Alternatively, you can target 2 willing allies, each gaining 1 action on an inserted partial turn instead.

The ally cannot use their extra turn to cast Lend Time or grant their actions to another creature.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Lyrr's Chronomantic Shell}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 30 feet
**Area** :: 100-foot emanation
**Duration** :: 8 hours
}}

You anchor a chronomantic shell to a relative point you designate within range, such as the hull of a ship, the center of a wagon, or the base of a tent. A sphere with a 100-foot radius radiates from that anchor point and moves with it. Within this sphere, environmental conditions are reset to a calm state of the caster's choosing at the moment of casting: wind stills to a gentle breeze, rain ceases, temperature moderates, and waves calm to a placid sea. The shell has no effect on weather conditions created by magic after the casting. Creatures and objects inside the sphere are unaffected by external mundane weather for the duration.

{{postamble
**Heightened (+1)** :: The radius of the shell increases by 100 feet.
}}
}}

{{ruleBlock
{{preamble
{{title Nightfall}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Darkness}}{{trait Illusion}}{{trait Manipulate}}{{trait Visual}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 100 feet
**Area** :: 60-foot cylinder
**Duration** :: until midnight (special)
}}

You call upon night to arrive ahead of schedule. A 60-foot-diameter cylinder descends from the sky, centered on a point within range. Creatures and objects inside the cylinder are unaffected by the time-shifted sky, but the sky above and within the area darkens as the suns quickly set and stars emerge, as if midnight had come early. All creatures inside the cylinder perceive their environment as if it were nighttime: darkness outside of any artificial light sources. Creatures outside the cylinder cannot perceive any change in the wider sky.

The spell ends automatically at midnight as the wider world catches up to the time-shift and the effect dissolves naturally.

{{postamble
**Heightened (4th)** :: The cylinder's diameter expands to 600 feet.
**Heightened (5th)** :: The cylinder's diameter expands to 1 mile.
**Heightened (6th)** :: The diameter expands to 10 miles.
}}
}}

{{ruleBlock
{{preamble
{{title Rewind and Playback}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Healing}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: touch
**Targets** :: 1 willing living creature other than yourself
}}

You reach through time and pull a creature's wounds backward, rewinding the damage into the past and redirecting it through yourself as a conduit. Choose the number of Hit Points to restore to the target. You take 1d6 void damage for every 6 Hit Points restored, rounding up to the next multiple of 6; this damage can't be reduced by resistance, immunity, or any other means.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Celestial Preservation}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, occult, primal
**Cast** :: 1 hour
**Cost** :: 25 gp of starlight-ink and ritual chalk
**Range** :: touch
**Targets** :: 1 dead creature
**Duration** :: until ended
}}

You can cast this spell only at night, under an open sky where stars are visible. You memorialize a dead creature you touch, provided it has been dead no longer than 1 day, turning it into a constellation. The creature's body dissolves into luminous stardust and rises into the sky, visible as a new constellation on clear nights.

While the creature exists as a constellation, time does not pass for it as regards resurrection magic: days spent in this state do not count against the time limits of spells such as Raise Dead, Resurrect, or similar. Spells that normally require a body or physical remains can instead target the creature's constellation, provided the spell is cast at night when the constellation is visible.

If the creature is successfully returned to life through any resurrection effect, this spell ends and the constellation fades from the sky.
}}

{{ruleBlock
{{preamble
{{title Ebb and Flow}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Area** :: 20-foot burst
**Defense** :: Will
**Duration** :: sustained up to 1 minute
}}

You detach a 20-foot-radius sphere centered on a point within range from the natural flow of time.

Allied creatures that begin their turn within the zone gain a +10-foot status bonus to their Speed until the start of their next turn and gain 1 additional reaction that turn. Enemy creatures in the area when the spell is cast must attempt a Will save; a creature that enters the zone later attempts the save when it first enters.

**Success** The creature is unaffected by the temporal distortion.

**Failure** The creature is Slowed 1 while within the zone.

**Critical Failure** As failure, and the creature also loses its reaction while within the zone.
}}

{{ruleBlock
{{preamble
{{title Force Drumfire}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 120 feet
**Targets** :: up to 3 creatures
**Duration** :: sustained up to 1 minute
}}

You trap three force missiles in a chronomantic loop, causing them to return to your side after each impact rather than dissipating. When you Cast this Spell, choose up to 3 creatures you can see within range. You launch one missile at each chosen creature; each missile automatically hits and deals 1d4+1 force damage. You can choose to focus multiple missiles on fewer targets.

After the missiles impact, they snap back to orbit you, hovering visibly. On subsequent turns, Sustaining this spell launches all orbiting missiles again at any combination of creatures you can see within range, choosing new targets each time, each missile again dealing 1d4+1 force damage. If a missile impacts a shield spell effect, that missile is dispelled and removed from play permanently.

{{postamble
**Heightened (+2)** :: The number of missiles increases by 1.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Reset}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}{{trait Misfortune}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Targets** :: up to 4 creatures
**Defense** :: Will
}}

A burst of temporal energy ripples outward from you, seizing the threads of fate around each target and forcing a re-evaluation of their place in the combat order. If a target is your ally, it may immediately reroll its initiative, taking the higher of the new roll or its current initiative value; this takes effect at the start of the next round. If a target is your enemy, it must attempt a Will save against this misfortune effect, and new initiative results take effect at the start of the next round.

A creature can only be affected by Reset once per encounter.

**Critical Success** The enemy is unaffected and temporarily immune to Reset for 24 hours.

**Success** The enemy is unaffected.

**Failure** The enemy rerolls its initiative twice, and you choose which of the two results applies to it.

**Critical Failure** As failure, and the enemy also becomes Off-Guard to all creatures until the end of its next turn as temporal disorientation washes over it.

{{postamble
**Heightened (+1)** :: The number of targets increases by 1.
}}
}}

{{ruleBlock
{{preamble
{{title Temporal Discharge}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Cast** :: 10 minutes
**Cost** :: a gemstone worth at least 25 gp (consumed)
**Range** :: touch
**Targets** :: 1 non-creature object
**Defense** :: basic Reflex
**Duration** :: until discharged or until your next daily preparations
}}

You spend ten minutes channeling magical energy into a touched object, storing a temporal charge within it. When you cast the spell, choose one of the following damage types: acid, cold, electricity, fire, sonic, or void. Also speak a command word in a language you know. The charged object is otherwise unchanged in appearance; a successful Recall Knowledge or Seek check against your spell DC reveals the presence of a magical aura.

**Trigger** The first time a creature touches the object without speaking the command word within 6 seconds of touching it, the stored energy discharges, requiring the triggering creature to attempt a basic Reflex save against your spell DC and take 10d6 damage of the chosen type.

{{postamble
**Heightened (+1)** :: The damage increases by 2d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Temporal Threshold}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Force}}{{trait Incapacitation}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Cast** :: 1 minute
**Range** :: touch
**Targets** :: 1 doorway, gate, window, or similar threshold
**Defense** :: Will
**Duration** :: 24 hours
}}

You lace the fabric of time around a threshold, a doorway, gate, window, or other constructed opening, with catastrophic temporal distortion. When you cast the spell, choose a word, phrase, or simple action (such as knocking twice) that serves as the safe passage. The threshold shimmers faintly if examined with a successful Perception or Recall Knowledge check against your spell DC.

**Trigger** The first creature that passes through the threshold without performing the safeguard within the same round finds itself subjected to violently conflicting time-flows. That creature must attempt a Will save against 8d10 force damage. The threshold resets after triggering and can trigger again on the next creature that passes without the safeguard.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage and is not paralyzed.

**Failure** The creature takes full damage and is Paralyzed until the start of its next turn.

**Critical Failure** The creature takes double damage and is Paralyzed until the end of its next turn. It must then succeed at a Will save or remain Paralyzed for an additional round.
}}

{{ruleBlock
{{preamble
{{title Jolt}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Targets** :: up to 4 willing creatures
}}

You donate a fraction of your own time-stream to willing allies, jolting each of them forward by a breath. Each target immediately gains 1 free action it must use before the start of your next turn. This free action can be used to make one Strike with a weapon or unarmed attack the target currently has at the ready, or to Stride up to 10 feet.

{{postamble
**Heightened (+1)** :: You can target 1 additional willing creature.
}}
}}

{{ruleBlock
{{preamble
{{title Legend Killer}} {{a}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

You slow down the flow of time around a mighty creature. The target must attempt a Fortitude save.

**Critical Success** The creature is unaffected.

**Success** For the duration, the creature can't use mythic abilities or spend Mythic Points.

**Failure** As success, and the creature also can't take reactions.

**Critical Failure** As failure, and the creature is Stunned 1.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Repetitious Trauma}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: sustained up to 1 minute
}}

You twist the strands of time to force a creature to relive a damaging moment over and over. On the round you cast this spell, the target must attempt a Will saving throw against 8d6 damage of the relived type. Each round you Sustain the spell, the target must attempt a Will saving throw against 6d6 damage of the relived type. The damage type each round is the most recent damage type dealt to the target before this spell was cast, or mental if no damage type is known.

**Critical Success** The creature is unaffected this round.

**Success** The creature takes half damage.

**Failure** The creature takes full damage.

**Critical Failure** The creature takes double damage and is Stunned 1.

{{postamble
**Heightened (+1)** :: The damage increases by 2d6.
}}
}}

{{ruleBlock
{{preamble
{{title Revisit}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: self
}}

You rewind your own personal timeline to a location you occupied within the last hour, snapping back to that position in an instant. You arrive with the exact momentum you had at the moment you left that location. You cannot teleport into a space that is currently occupied by a solid object.

{{postamble
**Heightened (+1)** :: You can bring 1 additional willing creature who is adjacent to you at the time of casting.
}}
}}

{{ruleBlock
{{preamble
{{title Wall of Time}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 120 feet
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

You tear a rift in linear time and shape it into a translucent, rippling wall of temporal energy at a point within range, forming either a straight wall up to 60 feet long, 20 feet high, and 1 foot thick, or a ring up to 20 feet in diameter, 20 feet high, and 1 foot thick. The wall is intangible; creatures can move through it freely.

The wall imposes a Fortitude save (DC = your spell DC) on any creature that passes through it. On a failure, the creature is Slowed 1 until the start of its next turn.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Chrysalis}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, primal
**Cast** :: 10 minutes
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 1 hour
}}

You dramatically accelerate the flow of time around a willing creature, allowing it to compress an 8-hour long rest into a single hour. The target is wrapped in a thick, iridescent cocoon and does not need to eat or drink during this time. At the end of the hour, the target emerges as if it had just completed a full 8-hour rest.

While within the cocoon, the target is completely cut off from outside stimuli. The cocoon is fragile: it has AC 10, Hardness 5, and 20 HP. If the cocoon is destroyed, the spell ends immediately and the target emerges Stunned 2, without having gained the benefits of the rest.
}}

{{ruleBlock
{{preamble
{{title Fast-Forward}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Curse}}{{trait Incapacitation}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: until removed
}}

You reach into a creature's personal timeline and hurl it decades into the future, leaving its body wizened, aged, and Enfeebled while its mind remains trapped in the present. The target must attempt a Fortitude saving throw.

**Critical Success** The creature is unaffected.

**Success** The creature's apparent age advances rapidly and then snaps back over 1 round. It is Slowed 1 until the start of your next turn.

**Failure** The creature is cursed with accelerated aging. It becomes Enfeebled 2 and Clumsy 2, and its Speed is reduced by 10 feet. This curse persists until removed.

**Critical Failure** As failure, but the creature is Enfeebled 3 and Clumsy 3 instead, and the Speed reduction is 20 feet.
}}

{{ruleBlock
{{preamble
{{title Time Loop}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 minute
}}

You trap a creature in a closed loop of time, forcing it to replay the broad strokes of its previous turn. The target must attempt a Will save.

**Success** The creature is unaffected, and is temporarily immune to Time Loop for 24 hours.

**Failure** The creature is pulled back to its approximate position at the start of its previous turn and must spend its actions this turn in the same categories as last turn: if it Moved then Struck, it can only Move then Strike, choosing any targets and directions freely. If the required action type is impossible, the creature instead loses that action. The creature repeats the saving throw at the end of each of its turns; on a success the effect ends.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Anomalous Object}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: touch
**Targets** :: 1 object of up to 1 Bulk
**Duration** :: 1 hour
}}

You reach through time to retrieve a duplicate of a touched object from another moment in the timestream, superimposing two temporal instances of the same object. For the duration, you hold both the original and the duplicate simultaneously. Any effect that affects one version (damage, charges spent, magical alterations) also affects the other. If either version is destroyed, both are destroyed. If the object is currently held or Controlled by another creature, you must succeed at a Thievery check against that creature's Reflex DC to touch it; on a failure the spell is lost. When the spell ends, the duplicate dissolves.

{{postamble
**Heightened (9th)** :: The object can be up to 4 Bulk and the duration extends to 8 hours.
}}
}}

{{ruleBlock
{{preamble
{{title Cone of Decay}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: arcane, divine, primal
**Range** :: self
**Area** :: 60-foot cone
**Defense** :: basic Fortitude
}}

You unleash a tide of temporal decay from your outstretched hand, accelerating decomposition in everything it touches. All unattended, nonliving, organic matter in the cone crumbles to dust immediately. Creatures in the cone take 8d10 void damage from the ravaging decomposition with a basic Fortitude save. A creature's nonmagical organic gear can be destroyed, and a nonmagical metal item penalty applies to AC for armor or to attack and damage rolls for weapons.

**Critical Success** The creature takes no damage and its gear is unaffected.

**Success** The creature takes half damage and its gear is unaffected.

**Failure** The creature takes full damage and its nonmagical organic gear is destroyed.

**Critical Failure** The creature takes double damage, its nonmagical organic gear is destroyed, and its nonmagical metal gear takes a permanent −1 item penalty to relevant statistics. Undead take an additional 4d10 void damage.

{{postamble
**Heightened (+1)** :: The base void damage increases by 1d10.
}}
}}

{{ruleBlock
{{preamble
{{title Outside of Time}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 30 feet
**Targets** :: 1 willing creature or unattended object
**Duration** :: up to 24 hours (chosen at casting)
}}

You reach into the flow of time and pluck the target entirely out of it. The target disappears from the world. While outside of time, the target cannot be perceived, located, or affected by any means; for all purposes it does not exist. Any spells the target was Sustaining end immediately. No effect, not even a rank-10 spell, can retrieve the target early; it is genuinely absent.

When you Cast this Spell, you choose the duration, from 1 round to 24 hours. The target returns automatically at the end of the chosen duration, reappearing in the nearest unoccupied space to where it left. The target experiences no subjective passage of time and is not aware it was gone. Any ongoing effects active on the target (except sustained spells) resume exactly as they were.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{ruleBlock
{{preamble
{{title Stolen Moment}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: varies (see text)
}}

You grab hold of the target and thrust it forward in time. The target must attempt a Fortitude save. On a failure, the creature disappears from the current moment for a duration determined by the save result. While displaced in time, the target cannot act and cannot be targeted. When the target returns, it appears in the space it occupied when displaced, or the nearest unoccupied space if that space is occupied.

**Critical Success** The target is unaffected.

**Success** The target disappears until the start of its next turn.

**Failure** The target disappears for 1d4+1 rounds. At the end of each round, it may attempt a new Fortitude save to return early.

**Critical Failure** The target disappears for 1d4+2 rounds with no intermediate save to return early.
}}

{{ruleBlock
{{preamble
{{title Checkpoint}} {{aa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Chronomancy}}{{trait Concentrate}}{{trait Healing}}{{trait Manipulate}}{{trait Vitality}}
}}

{{definitions
**Traditions** :: arcane, divine, primal
**Requirements** :: The target is at full Hit Points.
**Range** :: touch
**Targets** :: 1 willing living creature
**Duration** :: 1 hour
}}

You imprint a temporal checkpoint on the target's life-force, recording its current vitality. For the duration, the target carries this temporal anchor.

If the target would be reduced to 0 HP or would die outright at any point during the duration, instead of Dying or falling Unconscious, the checkpoint activates: the target immediately regains 9d8+72 Hit Points, any Dying and Wounded conditions are removed, and the temporal anchor is consumed, ending the spell.
}}

{{pageNumber,auto}}
{{footnote Chapter 2 | Chronomancy}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 3
# Gestalt
___
}}

Every shapeshifter learns the same secret eventually: the shapes remember. Somewhere beneath the surface of every transformation lies a vast communal reservoir -- every wing ever worn, every fang ever grown, every heartbeat of every borrowed body, pooled into what practitioners call the gestalt collective. Ordinary polymorphy draws a whole form out of that pool at once. Gestalt magic is the finer art of drawing *pieces*: the refinement of the shapeshifter's craft, augmenting an already-transformed body with grafted claws, monstrous organs, and musculature tuned like an engine. Nearly all of it demands that the caster already wear another form. You cannot edit a page you have not turned to.

The school's heartland is the primal circles -- Istrian strider-scouts who run the Stillness-haunted ruins in borrowed skins, and the Children of the Heir, whose animal devotions make them its most natural students. But gestalt work has admirers in stranger quarters. Protectorate quartermasters have noticed that a soldier who can grow their own armor requisitions less of it, and more than one Austrene surgeon has quietly studied the school's anatomies for insights the Pale Lantern would pay dearly to hear first. The public, for its part, has never fully warmed to gestalt casters. A wizard's fire is comprehensible. A neighbor who is currently a bear, and who has *improved* the bear, is a different kind of conversation.

The craft itself climbs like a trade. Apprentices begin with the body enhancements -- a hooked claw, a beast's jaws, a hide that shrugs off blows -- small emendations that teach the hand without risking the whole manuscript. Journeyworkers learn the shape modifications, and with them the school's central discipline: every refinement is a trade. Sharper talons dull the senses; heavier plating drags the stride. The collective gives nothing away. It barters.

Mastery is the monstrous copies, and here the school shows its teeth. To wear a monster's parts, you must first *know* the monster -- and the collective is particular about what counts as knowing. The masters speak of it plainly: the excavating claws of the great burrowers, the keening throat of the grave-wailer, the writhing eye-stalks of the Aberrant, the mirror-shell of the Armageddon Engine itself. Each copy is a trophy that remembers being taken. Students are advised, in the standard texts and in identical dry tones, that the knowing is the hard part, and that the monsters are under no obligation to survive being studied.

{{descriptive
##### The Collective
No one agrees on what the gestalt collective actually is. The Children call it the Heir's menagerie, a living archive of every beast she has shepherded through the cycle. Belvedere's theorists model it as a resonance field -- transformation leaving grooves that later transformations fall into. A minority position, popular after midnight, holds that it is a single vast dreaming mind, and that every borrowed claw is a favor that will someday be recalled. Practitioners are untroubled by the question. The pool is deep, the water is warm, and nothing has ever pulled anyone under. Yet.
}}

<!-- ART SLOT [ch3-gestalt]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a druid mid-refinement — half-human silhouette with bone blades erupting at the joints, ghostly outlines of a hundred prior shapes layered behind them -->

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{wide,vol2SpellTable
##### Gestalt Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Body Enhancement: Claws | {{aa}} | Grow claw Strikes with agile slashing damage |
| 1 | Body Enhancement: Fangs | {{aa}} | Bite a foe for immediate piercing damage |
| 1 | Body Enhancement: Hide | {{aa}} | Thick hide grants recurring temporary Hit Points |
| 1 | Body Enhancement: Sense | {{aa}} | Sharpen one sense to bestial acuity |
| 2 | Body Enhancement: Horns | {{aa}} | Gore a foe with heavy horn damage |
| 2 | Body Enhancement: Mind | {{aa}} | Sharpen cognition: Will bonus plus mental edge |
| 3 | Bestial Rage | {{a}} | Frenzy boosts beast-form attacks and damage dice |
| 3 | Shape Modify: Accuracy | {{a}} | Trade form's power for attack precision |
| 3 | Shape Modify: Armor | {{a}} | Trade form's speed for tougher armor |
| 3 | Shape Modify: Severity | {{a}} | Trade form's senses for sharper natural weapons |
| 3 | Shape Modify: Speed | {{a}} | Trade form's padding for faster Speeds |
| 4 | Fluid Form | {{aa}} | Become amorphous liquid with your gear |
| 4 | Grosteque Selfshape | {{aa}} | Grow Large: temporary HP, reach, bonus damage |
| 4 | Suspension | {{aa}} | Vines grant flight near surfaces, negate falls |
| 5 | Blades of Bone | {{aa}} | Bone spurs make your grapples deal damage |
| 5 | Incensed Bestial Rage | {{a}} | Push battle form feral: damage up, AC down |
| 5 | Monstrous Copy: Tentacle | {{aa}} | Tentacle Strike: agile, disarm, grapple, reach |
| 6 | Monstrous Copy: Claws | {{aa}} | Excavating claws grant full-speed burrowing |
| 6 | Monstrous Copy: Wail | {{aa}} | Keening wail: mental damage and stupefaction |
| 7 | Monstrous Copy: Eye Stalks | {{aaa}} | Three eye-stalk rays with random effects |
| 7 | Monstrous Copy: Tail | {{aa}} | Reach tail Strike batters with stunning force |
| 8 | Monstrous Copy: Stinger | {{aa}} | Venomous reach stinger with devastating poison |
| 9 | Monstrous Copy: Shell | {{aa}} | Reaction deflects ranged spell attacks, sometimes reflecting |
}}

{{ruleBlock
{{preamble
{{title Body Enhancement: Claws}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw on the gestalt memory of every shape your kind has worn and partially reshape your fingers into long, hooked claws of magically hardened keratin. You grow a claw unarmed Strike that deals 1d6 slashing damage and has the agile, finesse, magical, and unarmed traits. You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your claws use that proficiency instead. The claws count as magical for the purpose of overcoming resistances.

{{postamble
**Heightened (+1)** :: The damage increases by 1d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Body Enhancement: Fangs}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: touch
**Targets** :: you
}}

You draw upon the collective's memory of wildshaping to partially modify your body, transforming your mouth into the jaws of a beast. Make a melee spell attack roll against a creature within your reach, dealing 3d6 piercing damage on a hit.

**Critical Success** The target takes double damage and is knocked Prone.

**Success** The target takes full damage.

{{postamble
**Heightened (+1)** :: The damage increases by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Body Enhancement: Hide}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon the collective's memory of wildshaping to thicken your skin into the coarse, layered hide of a great beast. At the beginning of each of your turns, you gain 5 temporary Hit Points. While these temporary Hit Points remain, your hide hardens your exterior against glancing blows; you gain a +1 circumstance bonus to AC.

{{postamble
**Heightened (+2)** :: The temporary Hit Points increase by 5.
}}
}}

{{ruleBlock
{{preamble
{{title Body Enhancement: Sense}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 hour
}}

You draw upon the collective's memory of wildshaping to sharpen one of your senses into the acuity of a great beast. Choose one of the following sense modifications: you develop low-light vision, gain a +2 circumstance bonus to Perception checks that rely on hearing, or gain a +2 circumstance bonus to Survival checks to Track by scent. The chosen modification persists for the duration.

{{postamble
**Heightened (2nd)** :: Choose two sense modifications instead of one.
**Heightened (3rd)** :: Gain all three sense modifications. The Perception bonus and Survival bonus each increase to +3.
}}
}}

{{ruleBlock
{{preamble
{{title Body Enhancement: Horns}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: touch
**Targets** :: you
}}

You draw upon the collective's memory of wildshaping to partially modify your body, growing a set of heavy curved horns and rushing at your target. Make a melee spell attack roll against a creature within your reach, dealing 3d12 bludgeoning damage on a hit. If you Strode at least 20 feet in a straight line toward the target this turn, a hit also inflicts one of the following effects of your choice: the target is pushed 10 feet away from you, the target is knocked Prone, or the target takes an additional 1d12 bludgeoning damage.

**Critical Success** The target takes double damage.

**Success** The target takes full damage.

{{postamble
**Heightened (+1)** :: The damage increases by 1d12.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Body Enhancement: Mind}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon the collective's knowledge of every mind the gestalt memory contains, sharpening your own cognition into a razor's edge. You gain a +1 status bonus to Will saving throws. Additionally, choose one of the following abilities: you can use your Wisdom modifier in place of your Intelligence modifier for all Intelligence-based skill checks, you can use your Wisdom modifier in place of your Strength modifier for Athletics checks, or you gain a +1 status bonus to Perception checks.
}}

{{ruleBlock
{{preamble
{{title Bestial Rage}} {{a}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: until your wild shape ends
}}

You channel the gestalt collective's memory of wildshaping at its most savage, sharpening your current beast form into a state of heightened frenzy. This spell must be cast simultaneously with a polymorph spell or as part of activating a polymorph ability.

For the duration of your current polymorph, you gain a +1 status bonus to melee attack rolls made with your natural attacks, and your natural attack damage dice increase by one step: d4 to d6, d6 to d8, d8 to d10, or d10 to d12. Creatures attacking you with melee Strikes gain a +1 circumstance bonus to their attack rolls.
}}

{{ruleBlock
{{preamble
{{title Shape Modify: Accuracy}} {{a}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: until your polymorph effect ends
}}

You draw upon the collective's memory of polymorphing to refine your current form. You must be polymorphed to Cast this Spell. You sharpen the senses of your current form, trading raw striking power for precision. For the duration, your unarmed Strikes in your current form gain a +2 circumstance bonus to attack rolls, but deal 2d6 less damage (minimum 1).
}}

{{ruleBlock
{{preamble
{{title Shape Modify: Armor}} {{a}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: until your polymorph effect ends
}}

You draw upon the collective's memory of polymorphing to refine your current form. You must be polymorphed to Cast this Spell. You increase the protection of your current form, but decrease its speed. For the duration, you gain a +2 circumstance bonus to AC in your current form, but your Speed is reduced to 15 feet for all movement types.
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Shape Modify: Severity}} {{a}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: until your polymorph effect ends
}}

You draw upon the collective's memory of polymorphing to refine your current form. You must be polymorphed to Cast this Spell. You increase the sharpness of your natural weapons, but blunt your senses in the process. For the duration, your unarmed Strikes in your current form deal 2d6 additional damage, but take a -2 circumstance penalty to attack rolls.
}}

{{ruleBlock
{{preamble
{{title Shape Modify: Speed}} {{a}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: until your polymorph effect ends
}}

You draw upon the collective's memory of polymorphing to refine your current form. You must be polymorphed to Cast this Spell. You increase the speed of your current form, but decrease its padding. For the duration, your Speeds increase by 20 feet for all movement types available to your current form, but you take a -2 circumstance penalty to AC.
}}

{{ruleBlock
{{preamble
{{title Fluid Form}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 hour
}}

You turn your gestalt polymorph energy inward, dissolving your solid body and everything you are carrying into an animated mass of thick, viscous liquid that retains your mass and volume but becomes fully amorphous. While in Fluid Form you can Squeeze through any gap at least 1 inch wide without needing to succeed at an Acrobatics check. You gain resistance 10 to physical damage from non-magical weapons. You have immunity to poison, and you are immune to the Paralyzed and Stunned conditions. Your Speed becomes 20 feet, and you gain a 20-foot swim Speed.

While in Fluid Form you cannot speak, cast spells, or make Strikes. You cannot use manipulate actions that require hands. If the spell ends while you are in a space too small for your normal form, you are automatically expelled to the nearest unoccupied space large enough to contain you; if no such space is within 30 feet, you are squeezed out over 1 round and become Slowed 1 for 1 minute from the traumatic reconstitution.

You can Dismiss this spell.

{{postamble
**Heightened (6th)** :: You can flow up walls and across ceilings, gaining a 20-foot climb Speed.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Grosteque Selfshape}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You funnel your gestalt polymorph energy outward rather than inward, distorting and massively enlarging your form beyond its natural limits. Your size becomes Large. If there is insufficient space, you grow as large as you can safely fit. Your equipment and worn items grow proportionally with you. You gain 15 temporary hit points when you Cast the Spell, and you gain 5 temporary hit points at the start of each of your turns while this spell is in effect.

While in this form, your unarmed Strikes and weapon Strikes deal an additional 2d6 damage of the damage type appropriate to the weapon or unarmed attack. Your reach increases by 5 feet. You are unable to cast polymorph spells while Grosteque Selfshape is active.

{{postamble
**Heightened (+2)** :: Your size increases by one step, the additional Strike damage increases by 1d6, and the temporary Hit Points you gain (both on cast and each turn) each increase by 5.
}}
}}

{{ruleBlock
{{preamble
{{title Suspension}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Plant}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 5 minutes
}}

Vines magically sprout from any solid surface within 30 feet of you and weave around your torso, leaving your arms and legs free. The vines extend and retract as you move, always anchoring to the nearest surface. If a vine is destroyed, it's immediately replaced. For the duration, you gain a fly Speed of 40 feet, provided you remain within 30 feet of a solid surface. If you move farther than 30 feet from any solid surface, this fly Speed ends immediately and you fall normally. You cannot be knocked Prone, and you gain a +2 status bonus to saving throws against effects that would force you to move against your will. You may spend a reaction to cast this spell if you are falling; the vines catch you, negating all falling damage.
}}

{{ruleBlock
{{preamble
{{title Blades of Bone}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You turn your gestalt wildshaping energy inward, forcing long, curved spurs of hardened bone to erupt from your skin at joints, knuckles, elbows, shoulders, and knees.

While this spell is active, when you successfully Grapple a creature, you deal 3d6 piercing damage to that creature in addition to the Grapple's effects, and at the start of each of your turns while you have a creature Grabbed, that creature takes 2d6 piercing damage.
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Incensed Bestial Rage}} {{a}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}{{trait Polymorph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Duration** :: 1 minute
}}

You tap into the collective memory of generations of shapeshifters, pushing your wild form to its most primal extreme. You must be in a battle form created by a polymorph spell of rank 3 or lower to cast this spell; it enhances that existing form rather than replacing it. While Incensed Bestial Rage is active, your battle form's unarmed Strikes deal 2d6 additional damage, but its AC is reduced by 2 as the rage makes your movements aggressive and predictable. You gain 20 temporary HP and a +2 status bonus to Athletics checks. You cannot use the Sustain action to alter the details of the original polymorph spell; the incensed form is locked in its most feral configuration.

This effect ends when your underlying battle form ends. When Incensed Bestial Rage ends, you become Fatigued.

{{postamble
**Heightened (+2)** :: The additional damage increases by 1d6 and the temporary HP increases by 10.
}}
}}

{{ruleBlock
{{preamble
{{title Monstrous Copy: Tentacle}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}{{trait Poison}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon your knowledge of monsters to fight like them, reshaping one of your limbs into a sinuous, prehensile tentacle. You grow a tentacle unarmed Strike that deals 2d8 piercing damage and has the agile, disarm, grapple, magical, reach (15 feet), trip, and unarmed traits. You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your tentacle uses that proficiency instead.

When you successfully Grapple or maintain a Grapple against a creature using this tentacle, you can inject paralytic venom into the creature as part of the same action. The creature must attempt a Fortitude save against your spell DC.

**Critical Success** The creature is unaffected and is temporarily immune to this poison for 24 hours.

**Success** The creature is unaffected.

**Failure** The creature is afflicted with Tentacle Venom at stage 1.

**Critical Failure** The creature is afflicted with Tentacle Venom at stage 2.

**Tentacle Venom**; **Saving Throw** Fortitude against your spell DC; **Maximum Duration** 6 rounds; **Stage 1** Enfeebled 1 and Clumsy 1 (1 round); **Stage 2** Paralyzed (1 round); **Stage 3** Paralyzed for 1 minute (1 round).

{{postamble
**Heightened (8th)** :: The tentacle's base damage increases to 3d10 piercing.
**Heightened (9th)** :: The tentacle's base damage increases to 4d8 piercing.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Monstrous Copy: Claws}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Earth}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon your knowledge of the Bulette, reshaping your hands into massive, excavating claws. You gain a burrow Speed equal to your land Speed. You can burrow through non-magical earth, soil, and loose rock at your full burrow Speed. You can burrow through solid stone or worked rock at half your burrow Speed.

You grow a claws unarmed Strike that deals 2d12 slashing damage and has the magical, sweep, and unarmed traits. Against unattended objects and structures, you treat your attack roll result as one degree of success better. You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your claws use that proficiency instead.

{{postamble
**Heightened (+1)** :: The slashing damage increases by 1d12.
}}
}}

{{ruleBlock
{{preamble
{{title Monstrous Copy: Wail}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Auditory}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}{{trait Morph}}{{trait Sleep}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Area** :: 20-foot emanation
**Defense** :: Fortitude
}}

You draw upon your knowledge of the Banshee, reshaping your vocal cords into a monstrous approximation of its spectral wail. You unleash a bone-chilling keening cry that pierces the mind of all who hear it. Each creature in the area must attempt a Fortitude saving throw, taking 8d8 mental damage on a failure.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and is Stupefied 2.

**Critical Failure** The creature takes double damage and is Stupefied 3.
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Monstrous Copy: Eye Stalks}} {{aaa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Emotion}}{{trait Fear}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Morph}}{{trait Sleep}}{{trait Visual}}
}}

{{definitions
**Traditions** :: primal
**Range** :: 120 feet
**Targets** :: 3 creatures
**Defense** :: Will
**Duration** :: varies
}}

You draw upon your knowledge of the Aberrant, sprouting three writhing eye stalks from your skull. Each eye stalk fires a magical ray at a different target within range, or the same target if you choose. For each of the three rays, roll 1d8 on the Eye Stalks table to determine its effect. Reroll duplicate results until you have three distinct effects. Each ray is resolved separately and uses your spell DC.

| d8 | Ray | Effect |
|:---:|:---:|:---:|
| 1 | Charm Ray | The target must attempt a Will save. On a failure, the creature is Fascinated by you and must spend its first action each turn attempting to approach or aid you; this lasts 1 minute or until you or your allies harm the creature. |
| 2 | Fear Ray | The target must attempt a Will save. On a failure, the creature is Frightened 3 (Frightened 4 on a critical failure). |
| 3 | Slowing Ray | The target must attempt a Will save. On a failure, the creature is Slowed 1 for 1 minute (Slowed 2 on a critical failure). The creature can attempt a Will save at the end of each of its turns to end the effect. |
| 4 | Sleep Ray | The target must attempt a Will save. On a failure, the creature falls Unconscious for 1 minute. The creature wakes if it takes damage or if an adjacent creature spends an action to rouse it. This ray has no effect on constructs and undead. |
| 5 | Enervation Ray | The target must attempt a basic Fortitude save; on a failure, it takes 6d10 void damage. |
| 6 | Telekinetic Ray | The target must attempt a Fortitude save. On a failure, you can move the target up to 20 feet in any direction and it is Grabbed until the start of your next turn. |
| 7 | Petrification Ray | The target must attempt a Fortitude save. On a failure, the target is Slowed 1 and is becoming Petrified; at the start of your next turn the target must attempt another Fortitude save. On a failure of that second save, the target is Petrified. On a success, the petrification ends. |
| 8 | Disintegration Ray | The target must attempt a basic Fortitude save; on a failure, it takes 10d10 force damage. If this reduces the creature to 0 HP, it is reduced to dust. |

{{postamble
**Heightened (8th)** :: You fire four rays instead of three, rerolling duplicates. The Enervation and Disintegration ray damage each increase by 2d10.
**Heightened (9th)** :: You fire five rays instead of four. All ray damage increases by an additional 2d10 over the 8th-rank totals.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{ruleBlock
{{preamble
{{title Monstrous Copy: Tail}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon your knowledge of the Bore Worm, growing a massive, whip-like tail capable of battering foes with stunning force. You grow a tail unarmed Strike that deals 3d10 bludgeoning damage and has the magical, reach (10 feet), and unarmed traits. You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your tail uses that proficiency instead.

Once per round when you hit a creature with your tail Strike, you can attempt to stun it. The creature must attempt a Fortitude save against your spell DC.

**Critical Success** The creature is unaffected and is temporarily immune to this effect for 1 minute.

**Success** The creature is unaffected.

**Failure** The creature is Stunned 1.

**Critical Failure** The creature is Stunned 3.
}}

{{ruleBlock
{{preamble
{{title Monstrous Copy: Stinger}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}{{trait Poison}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon your knowledge of the Hutijin, growing a 10-foot tail tipped with a devastating venomous stinger. You grow a stinger unarmed Strike that deals 1d4 piercing damage plus 4d10 poison damage and has the magical, reach (10 feet), and unarmed traits. You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your stinger uses that proficiency instead.

When you hit a creature with your stinger Strike, the creature must attempt a Fortitude save against your spell DC.

**Critical Success** The creature is unaffected and is temporarily immune to this poison for 24 hours.

**Success** The creature is unaffected.

**Failure** The creature is afflicted with Hutijin Venom at stage 1.

**Critical Failure** The creature is afflicted with Hutijin Venom at stage 2.

**Hutijin Venom**; **Saving Throw** Fortitude against your spell DC; **Maximum Duration** 6 rounds; **Stage 1** 3d6 poison damage, Enfeebled 2, and Clumsy 2 (1 round); **Stage 2** 4d6 poison damage, Enfeebled 2, and Clumsy 2 (1 round); **Stage 3** Paralyzed (1 round).
}}

{{ruleBlock
{{preamble
{{title Monstrous Copy: Shell}} {{aa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,unique Gestalt}}{{trait Concentrate}}{{trait Manipulate}}{{trait Morph}}
}}

{{definitions
**Traditions** :: primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You draw upon your knowledge of the Armageddon Engine, growing a dense, iridescent carapace of supernaturally reflective shell. For the duration, you gain the Deflecting Shell reaction.

**Deflecting Shell** {{r}} **Frequency** once per round; **Trigger** A ranged spell attack roll targets you; **Effect** Roll 1d6. On a 1–5, you are unaffected by the triggering effect. On a 6, you are unaffected and you can redirect the effect as though it originated from your space, choosing new targets or direction within the spell's original range.
}}

{{pageNumber,auto}}
{{footnote Chapter 3 | Gestalt}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 4
# Kosmoturgy
___
}}

The universe has machinery. Beneath the paint of the world there are levers -- gravity, force, the seams where space is stitched to itself -- and kosmoturgy is the school that grabs them with both hands. Its casters crack the earth along invented fault lines, crush the unrighteous under anvils of compressed gravity, and pull hundred-foot slabs of bedrock into the sky because the battle would go better with high ground. It is the least subtle school in the Liturgy, and its practitioners regard this as a feature. Subtlety, one war-college maxim runs, is what you resort to when you cannot simply move the planet.

From its beginnings the school has understood itself as an instrument of divine judgment. The theology is straightforward: the Gods built the machinery, so pulling its levers in their name is not presumption but *citation*. No figure embodies this better than Djura, the battle-saint of the crusading years, whose canon anchors the school's devotional wing -- the compressed-air aegis she raised over whole shield-walls, the razor-edge she whispered onto blades until they cut the fabric of reality, the holy pressure that rolls off a consecrated caster like heat off a forge. Her catechism survives in the school's most distinctive pairing, the two Hands of Judgment: the left hand, which answers every blow with a counter, and the right, which keeps accounts and pays them back with interest. Novices are taught both, and taught which one to lead with, and the answer is a small theology lesson in itself.

In the present peace -- which is to say, the present arms race -- kosmoturgy is soldier's magic, and everyone who employs soldiers knows it. Calarian crusade doctrine reserves a battery of kosmoturgists for every field army; the Protectorate bills theirs out at rates that would embarrass a cardinal; and the Orgs have found gentler employment for the same levers, raising foundations, dropping mineshafts, and moving cargo that no crane on Færrin could love. A kosmoturgist never wants for work. The levers are always there, and something always needs moving.

The public reaction is the parade-ground kind: awe with the safety off. Crowds turn out to watch a demonstration -- the anvil falling, the island rising -- and cheer with the particular enthusiasm of people who are very glad the machinery is on their side. The school's own texts encourage this. Judgment, they note, works best when the sentence is legible from a distance.

{{note
##### Field Sermon, attributed to Djura
They will tell you the earth is patient. The earth is not patient. The earth is *held* -- every stone of it, every second, by a grip that does not tire. Ours is a borrowed hand upon that grip. So when you break the ground beneath the wicked, break it as a signature, not a tantrum. The weight is His. The aim, my friends, is yours. Aim well.
}}

<!-- ART SLOT [ch4-kosmoturgy]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a battle-cleric on a shattered field, a translucent anvil of warped gravity descending from above her raised hand, the ground fracturing in a radial fault -->

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{wide,vol2SpellTable
##### Kosmoturgy Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Attraction | {{aa}} | Drag nearby creatures violently toward you |
| 1 | Disrupt Movement | {{aa}} | Contracted space halves three creatures' Speeds |
| 1 | Distorted Mark | {{aa}} | Cantrip Strike marks foes for sonic follow-up |
| 1 | Reposition | {{aa}} | Teleport a creature ten feet away |
| 1 | Retributive Force | {{aa}} | Bonus force damage; melee attackers get launched |
| 2 | Compressive Weapon | {{aa}} | Your weapon always reaches one chosen foe |
| 2 | Propagating Blast | {{a}} | Melee-channeled bolt pierces a line |
| 3 | Bodydouble | {{aa}} | Projected double becomes your attacks' origin point |
| 3 | Flutterstep | {{aa}} | Gain shortcut Strides that dodge reactions |
| 3 | Swap | {{aa}} | Exchange two creatures' positions through space |
| 4 | Djura's Righteous Pressure | {{aa}} | Holy aura sears undead and fiends |
| 4 | Forceful Charge | {{aa}} | Charge in a line, battering everyone through |
| 4 | Left Hand of Judgment | {{a}} | Reaction: counter melee hits with free Strikes |
| 4 | Mark of Protection | {{aa}} | Swap in to absorb a marked ally's damage |
| 4 | Right Hand of Judgment | {{a}} | Missed attacks bank charges boosting damage rolls |
| 5 | Djura's Divine Razor | {{a}} | Reality-cutting edge: force damage, transferable curse |
| 5 | Oblivion | {{aa}} | Void-and-force burst crushes everything nearby |
| 6 | Fault Line | {{aa}} | Rupture the earth in a devastating line |
| 6 | Kosmoturgist's Armor | {{aa}} | Hardened-air shell grants broad resistance |
| 6 | Summon Heart | {{aa}} | Gravitationally crush a creature's living core |
| 6 | Weight of the World | {{aa}} | Crushing weight slows and debilitates creatures |
| 7 | Forceful Onslaught | {{aa}} | Empower a creature's might and blows |
| 7 | Gravity Anvil | {{aa}} | Compressed-gravity anvil crushes one target |
| 7 | Kosmoturgist's Weapon | {{aa}} | Sustained floating force weapon attacks foes |
| 7 | Raise Island | {{aa}} | Levitate a hundred-foot slab of rock |
| 8 | Carnage | {{aa}} | Teleport far, then Strike everyone in reach |
| 8 | Hypercompression | {{aa}} | Dark gravity orb drags and crushes creatures |
| 9 | Djura's Divine Protection | {{aa}} | Eight allies gain broad damage resistance |
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Attraction}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: self
**Area** :: 15-foot emanation
**Defense** :: basic Fortitude
}}

You concentrate gravitational force around your body, pulling nearby creatures violently toward you. Each creature in the area must attempt a Fortitude save against your spell DC, taking 2d6 bludgeoning damage on a failure. Forced movement from this spell doesn't trigger reactions, and a pulled creature stops early if it would enter your space or be blocked by a solid obstruction.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage but is not pulled.

**Failure** The creature takes full damage and is pulled up to 10 feet toward you.

**Critical Failure** The creature takes double damage and is pulled up to 20 feet toward you.

{{postamble
**Heightened (+1)** :: The damage increases by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Disrupt Movement}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: 60 feet
**Targets** :: up to 3 creatures
**Defense** :: Reflex
**Duration** :: 1 minute
}}

You send ripples of contracted space toward up to three creatures you can see within range. Each target must attempt a Reflex save against your spell DC.

**Success** The creature is unaffected.

**Failure** The creature's Speed is halved and it takes a -1 circumstance penalty to Reflex saves and Acrobatics checks for 1 minute. At the end of each of its turns, the creature can attempt a new Reflex save against your spell DC to end the effect on itself.

**Critical Failure** As failure, but the Speed reduction is to 0 and the circumstance penalty is -2.
}}

{{ruleBlock
{{preamble
{{title Distorted Mark}} {{aa}} {{spacer}} {{kind Cantrip}} {{level 1}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Attack}}{{trait Cantrip}}{{trait Concentrate}}{{trait Manipulate}}{{trait Sonic}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: melee
**Targets** :: 1 creature
**Duration** :: until the start of your next turn
}}

Make a melee weapon Strike as part of Casting the Spell; if the weapon Strike misses, the spell fails. On a hit, the Strike deals its normal damage and the space around the target becomes slightly distorted, marking it until the start of your next turn. While the mark persists, the next time the target takes damage from a melee Strike by a creature other than you, the mark decompresses with a thunderous crack, dealing 1d4 sonic damage to the target.

{{postamble
**Heightened (+2)** :: The decompression damage increases by 1d4.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Reposition}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Fortitude
}}

You twist the fabric of space around a creature within range, teleporting it up to 10 feet to an unoccupied space you can see. The movement can pass through the spaces of other creatures but cannot pass through solid obstructions. The movement does not trigger reactions. If the target is unwilling or hostile, it can attempt a Fortitude save to resist.

**Success** The hostile creature is unaffected.

**Failure** The creature is teleported up to 10 feet to a space you choose.

**Critical Failure** The creature is teleported up to 20 feet to a space you choose, and is Off-Guard until the end of its next turn.

{{postamble
**Heightened (+2)** :: You can target 1 additional creature.
}}
}}

{{ruleBlock
{{preamble
{{title Retributive Force}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: self
**Targets** :: you
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

Retributive energy flows through your weapon, ready to rebound. For the duration, the first time on your turn that you hit with a melee Strike, that Strike deals 1d6 extra force damage. In addition, when a creature within melee reach hits you with a melee Strike, that creature must attempt a Fortitude save against your spell DC. Any resulting movement is instantaneous and does not trigger reactions.

**Success** The striking creature is unaffected.

**Failure** The striking creature is launched 5 feet away from you and falls Prone.

**Critical Failure** The striking creature is launched 10 feet away from you and falls Prone.

{{postamble
**Heightened (+1)** :: The extra force damage on your Strikes increases by 1d4.
}}
}}

{{ruleBlock
{{preamble
{{title Compressive Weapon}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: 30 feet
**Targets** :: 1 creature
**Duration** :: 1 minute
}}

You compress the intervening space between yourself and a target creature, creating a spatial shortcut through which your weapon's reach always finds the target. Choose a weapon you are wielding when you Cast this Spell. For the duration, you can make Strikes with that weapon against the designated target as if the target were within the weapon's normal reach, regardless of its actual distance from you.

{{postamble
**Heightened (+1)** :: The range of the compressive reach increases by 10 feet.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Propagating Blast}} {{a}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, occult
**Requirements** :: You are wielding or holding a melee weapon
**Range** :: 30 feet
**Area** :: 30-foot line
**Defense** :: Reflex
}}

You channel violent force through your melee weapon and launch a pulsing bolt that tears a line through space. The bolt travels in a 5-foot-wide, 30-foot-long line originating from your space, passing through all creatures in the area.

Each creature in the line must attempt a Reflex save against your spell DC. The first creature to fail takes damage from a successful melee Strike with the weapon used to cast this spell, plus an additional 2d8 force damage; this does not consume an additional action.

{{postamble
**Heightened (+1)** :: The force damage increases by 1d8.
}}
}}

{{ruleBlock
{{preamble
{{title Bodydouble}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Illusion}}{{trait Manipulate}}{{trait Teleportation}}{{trait Visual}}
}}

{{definitions
**Traditions** :: arcane, divine, occult
**Range** :: self
**Targets** :: you
**Duration** :: sustained up to 1 minute
}}

You fold space around yourself, creating a flickering double that exists simultaneously where you stand and where you project it. The double occupies the same space as you when the spell is cast. The double has no physical presence and cannot be attacked, damaged, or interacted with by creatures. It appears only at the moment of an attack or spell cast, visible as a brief spatial shimmer.

When you Sustain this spell, you can shift the double to any point within 20 feet of you instead; the double remains projected until the start of your next turn unless you return it sooner. When you make a Strike or Cast a Spell with a range other than self, you may use the double's current location as the origin point for that action.

{{postamble
**Heightened (5th)** :: You can project the double up to 40 feet away.
**Heightened (7th)** :: You can maintain two doubles simultaneously.
}}
}}

{{ruleBlock
{{preamble
{{title Flutterstep}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, divine, occult
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You gain better control of the eddies in the space around you, letting you find small shortcuts from place to place. For the duration of the spell, you gain the following actions:

**Flutter Step** {{a}} You Stride; this movement doesn't trigger reactive strikes.

**Spatial Dodge** {{r}} **Trigger** A creature targets you with an attack roll. **Effect** Attempt a DC 11 flat check. On a success, you teleport 5 feet to an unoccupied space and the attack misses automatically. On a failure, the attack is resolved normally, then you teleport 5 feet.
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Swap}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: 60 feet
**Targets** :: 2 creatures
**Defense** :: Fortitude
}}

You twist the fabric of space, swapping the positions of two creatures both within range. If both targets are willing, no save is required and the swap happens automatically. If either target is unwilling, that creature must attempt a Fortitude save.

**Success** The unwilling creature resists; neither creature is moved.

**Failure** Both creatures are instantly transposed to each other's positions. The teleportation does not provoke reactions. Each creature retains its current facing and momentum.

**Critical Failure** As failure. Additionally, the unwilling creature is Off-Guard until the start of its next turn as it reorients.

{{postamble
**Heightened (+1)** :: You can target 1 additional creature with this spell. You choose how the targets exchange positions.
}}
}}

{{ruleBlock
{{preamble
{{title Djura's Righteous Pressure}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Kosmoturgy}}{{trait Aura}}{{trait Concentrate}}{{trait Holy}}{{trait Manipulate}}{{trait Spirit}}
}}

{{definitions
**Traditions** :: divine
**Range** :: self
**Area** :: 30-foot emanation
**Defense** :: Fortitude
**Duration** :: sustained up to 1 minute
}}

You radiate a great holy pressure that is anathema to undead and fiends. Any undead or fiend that starts its turn in the aura or enters it must immediately attempt a Fortitude save, taking 2d6 spirit damage on a failure.

**Critical Success** The creature is unaffected and not pushed.

**Success** The creature takes half spirit damage but is not pushed.

**Failure** The creature takes full spirit damage and is pushed 5 feet directly away from you. It cannot willingly move back into the aura until the start of its next turn.

**Critical Failure** The creature takes double spirit damage and is pushed 10 feet directly away from you. It cannot willingly move back into the aura until the start of its next turn.

{{postamble
**Heightened (+1)** :: The damage increases by 1d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Forceful Charge}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Move}}
}}

{{definitions
**Traditions** :: divine
**Range** :: self
**Defense** :: basic Reflex
}}

Cosmic force propels you forward at extreme speed in a straight line. When you Cast this Spell, you Stride up to your full Speed in a straight line. You can move through the spaces of creatures during this movement. Each creature whose space you move through must attempt a basic Reflex save against your spell DC, taking 4d6 bludgeoning damage.

You ignore difficult terrain during this Stride and do not trigger Reactive Strikes from creatures you move through during the Stride.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage and is knocked Off-Guard until the end of your next turn.

**Failure** The creature takes full damage, is knocked Prone, and becomes Off-Guard until the end of your next turn.

**Critical Failure** The creature takes double damage, is knocked Prone, and becomes Off-Guard until the end of your next turn.

{{postamble
**Heightened (+1)** :: The damage increases by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Left Hand of Judgment}} {{a}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Fortune}}
}}

{{definitions
**Traditions** :: divine
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You channel a subtle gravitational pull through your left hand, bending the forces of momentum against those who strike you. For the duration of this spell, you gain the following reaction:

**Gravitational Counter** {{r}} **Trigger** A creature within your reach successfully hits you with a melee attack. **Effect** The attacker's force pulls them off-balance, and they are Off-Guard against the triggering Strike. You may immediately make one melee Strike against the triggering creature. This Strike doesn't use or contribute to your multiple attack penalty.
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Mark of Protection}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 8 hours
}}

You press your hand against a willing ally and inscribe an invisible protective mark upon them, binding your fate to theirs. For the duration, whenever the marked creature would take damage from a single source, you may use the following reaction:

**Interpose** {{r}} **Trigger** The marked creature you can see within 120 feet would take damage from a source that targets only them or includes them in its targets. **Effect** You instantly swap positions with the marked creature. You take the triggering damage instead of the marked creature. If this damage would reduce you to 0 Hit Points, you are instead reduced to 1 Hit Point and the Mark of Protection immediately ends.

You can only have one Mark of Protection active at a time. Casting this spell while a Mark is already active on another creature ends the previous Mark.

{{postamble
**Heightened (6th)** :: You can mark up to 2 willing creatures simultaneously with a single casting. When the Interpose reaction triggers, you choose which marked creature to swap with, though you can only intercept one at a time and take the damage once regardless of how many marks are active.
**Heightened (8th)** :: When you intercept damage for a marked creature, you gain resistance equal to your level to the intercepted damage type until the end of the current round. This applies only to the intercepted strike, not to ongoing damage.
}}
}}

{{ruleBlock
{{preamble
{{title Right Hand of Judgment}} {{a}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Fortune}}
}}

{{definitions
**Traditions** :: divine
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You channel kosmoturgy through your right hand, siphoning the kinetic force of incoming blows and storing it as a cosmic charge that you can spend to devastate your enemies. For the duration, once per round when a creature's attack roll against you fails, you gain 1 charge. You can hold a maximum of 3 charges at one time. Charges dissipate when the spell ends. When you successfully make a Strike, before you roll damage you may expend 1 charge to grant that Strike's damage roll a fortune effect: you roll the damage dice twice and take the higher result.
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Djura's Divine Razor}} {{a}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Curse}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine
**Range** :: touch
**Targets** :: 1 melee weapon you are wielding
**Duration** :: 1 minute
}}

You whisper a divine edge into your weapon, sharpening it to cut the fabric of reality. The first time you hit a creature with a melee Strike using the infused weapon this turn, you deal an additional 3d10 force damage. That creature is also afflicted by a lingering cosmic curse: for the duration of the spell, whenever you hit the cursed creature with a melee Strike, it takes 2d6 additional force damage. The curse ends when the spell ends or when the creature succeeds at a Will saving throw against your spell DC, attempting this save at the end of each of its turns. Only one creature can be cursed at a time; a new hit against a different creature transfers the curse.

While the curse lasts, your melee Strikes with the infused weapon can reach the cursed creature anywhere within 60 feet; these Strikes ignore cover and concealment.

{{postamble
**Heightened (+1)** :: The initial bonus damage increases by 1d10, and the per-hit curse damage increases by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Oblivion}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: self
**Area** :: 40-foot emanation
**Defense** :: basic Reflex
}}

You rapidly compress and expand the space around you, exerting extreme force on surrounding creatures. Each creature in the emanation, including you, must attempt a basic Reflex save against 6d6 void damage and 6d6 bludgeoning damage from the spatial shockwave.

**Optional sacrifice.** Before rolling damage, you may choose to take an additional 10 void damage yourself, ignoring your own resistance or immunity to void damage. If you do, you select a number of creatures in the area up to your spellcasting ability modifier, with a minimum of 1; you can choose yourself. Each chosen creature improves the degree of success of its saving throw against this spell by one step.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage.

**Failure** The creature takes full damage.

**Critical Failure** The creature takes double damage and is knocked Prone.

{{postamble
**Heightened (+1)** :: Both the void damage and the bludgeoning damage each increase by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Fault Line}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Earth}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, primal
**Range** :: 120 feet
**Area** :: 60-foot line
**Defense** :: basic Reflex
}}

You rupture the ground along a line, splitting the earth and hurling debris in a shockwave of bludgeoning force. Each creature in the affected line takes 8d10 bludgeoning damage from the seismic upheaval. All spaces in the line become difficult terrain, which persist permanently.

**Critical Success** The creature takes no damage.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and is knocked Prone.

**Critical Failure** The creature takes double damage and is knocked Prone.

{{postamble
**Heightened (+1)** :: The damage increases by 2d10 and the line increases in length by 10 feet.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Kosmoturgist's Armor}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 10 minutes
}}

You compress the ambient air around a willing creature you touch, hardening it into a near-solid shell of force-locked atmosphere. For the duration, the target gains resistance 10 to bludgeoning, piercing, slashing, and force damage. You cannot have this spell active on more than one creature at a time; casting it again ends the previous casting.
}}

{{ruleBlock
{{preamble
{{title Summon Heart}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Death}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 60 feet
**Targets** :: 1 living creature
**Defense** :: basic Fortitude
}}

You exert a crushing gravitational pull on a living creature's vital core, compressing and tearing inward. The target must attempt a basic Fortitude save against 11d10 void damage. If this damage reduces the target to 0 Hit Points, it is immediately slain; its heart (or functional equivalent) is ripped free and appears in your free hand. This is a death effect.

{{postamble
**Heightened (+1)** :: The damage increases by 1d10.
}}
}}

{{ruleBlock
{{preamble
{{title Weight of the World}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 120 feet
**Area** :: 60-foot burst
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

You call down the weight of existence upon those around a chosen point. Each creature in the area must attempt a Fortitude saving throw.

**Critical Success** The creature is unaffected.

**Success** The creature's Speed is reduced by 10 feet for 1 round.

**Failure** The creature is Slowed 1 for 1 minute and becomes Enfeebled 2 and Clumsy 2. At the end of each of its turns, the affected creature can attempt a new Fortitude save; on a success, the effect ends.

**Critical Failure** As failure, but the creature is Slowed 2 for 1 minute and is Enfeebled 3 and Clumsy 3 instead.

{{postamble
**Heightened (+2)** :: The burst radius increases by 10 feet.
}}
}}

{{ruleBlock
{{preamble
{{title Forceful Onslaught}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}{{trait Polymorph}}
}}

{{definitions
**Traditions** :: divine, primal
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 1 minute
}}

You infuse a creature with explosive gravitational momentum, pressing beyond the limits of ordinary physiology. For the duration, the target gains a +2 status bonus to Athletics checks and Fortitude saving throws. The target deals an additional 2d6 force damage on all weapon Strikes. At the start of each of the target's turns, it gains 10 temporary Hit Points. Finally, if the target is reduced to 0 Hit Points, it gains the Dying condition as normal, but it doesn't fall Unconscious until the start of its next turn and can act normally until then. It attempts recovery checks as normal, and it can't be stabilized by any means while it remains conscious this way.
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Gravity Anvil}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Force}}{{trait Incapacitation}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: 120 feet
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: varies
}}

You conjure an anvil of pure compressed gravity and slam it down on a single target you can see within range. The target must attempt a Fortitude save, taking 10d10 force damage on a failure.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and is Stunned 1.

**Critical Failure** The creature takes double damage and is Slowed 1 until it succeeds at a Fortitude save, which it can attempt at the end of each of its turns.

{{postamble
**Heightened (+1)** :: The damage on a failure increases by 1d10.
}}
}}

{{ruleBlock
{{preamble
{{title Kosmoturgist's Weapon}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Attack}}{{trait Concentrate}}{{trait Force}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine
**Range** :: 60 feet
**Defense** :: basic Reflex
**Duration** :: sustained up to 1 minute
}}

You compress a volume of space into a floating ethereal weapon of force that persists for the duration. On the round you cast the spell, and when you Sustain the Spell on subsequent turns, you can move the weapon up to 30 feet and choose one mode.

**Attack** The weapon makes a melee spell attack roll. On a hit, the struck creature takes 3d10+8 force damage (double damage on a critical hit).

**Defend** The weapon takes position adjacent to a creature of your choice within its reach, granting that creature lesser cover until the start of your next turn. Until the start of your next turn, the first hostile creature that moves to be adjacent to the protected creature is attacked by the weapon as in Attack mode.

**Control** The weapon spins rapidly. Each creature in or adjacent to the weapon's space must attempt a basic Reflex save; on a failure they take 4d10 force damage.

You cannot have more than one Kosmoturgist's Weapon active at a time.

{{postamble
**Heightened (+1)** :: Attack, Defend, and Control mode damage each increase by 1d10.
}}
}}

{{ruleBlock
{{preamble
{{title Raise Island}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Earth}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, primal
**Range** :: 300 feet
**Defense** :: Reflex
**Duration** :: permanent
}}

You rip a massive slab of bare rock from the ground and levitate it 10 feet above the terrain. The slab is 100 feet to a side and 10 feet thick; creatures or objects standing on the ground where it rises must succeed at a Reflex save against your spell DC or be carried aloft. The slab has AC 10, Hardness 14, and 300 HP per 10×10-foot section. The effect is permanent; the slab remains floating until destroyed.

**Command Slab** {{aa}} (concentrate, manipulate) **Effect** The slab moves up to 10 feet in the direction you specify, continuing in that direction each round at the same speed until you command it to stop or it reaches a barrier.

{{postamble
**Heightened (9th)** :: The slab is 200 feet to a side and can be commanded to move at 20 feet per round.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Carnage}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Force}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, divine
**Range** :: self
**Targets** :: all creatures in your reach after teleporting
**Defense** :: basic Fortitude
**Duration** :: sustained up to 1 minute
}}

You tear open the fabric of space and fling yourself across the battlefield. When you Cast this Spell, you teleport up to 120 feet to an unoccupied space you can see, then make a melee Strike against each creature within your reach. Roll one attack roll and apply it to every target; these Strikes count as a single attack for your multiple attack penalty. A creature you hit takes an additional 6d12 force damage.

On your subsequent turns, you can Sustain the spell to continue your deadly assault. Each time you Sustain it, the assault has a different effect:

**Second Sustain** You teleport up to 60 feet, then make a melee Strike against each creature in a 20-foot cone, rolling once and applying the result to all of them. Each creature you hit is knocked Prone and takes an additional 6d12 force damage.

**Third Sustain** You teleport up to 30 feet, then make a melee Strike against one creature within your reach. If the target is above half its maximum Hit Points, the Strike deals an additional 6d12 force damage. If you hit, the target is Paralyzed until the end of your next turn.

**Fourth Sustain** You teleport up to 60 feet into the air and descend, smashing into the ground at a point you can see within 120 feet of where you started. You take no falling damage. Each creature within 30 feet of you must attempt a basic Fortitude save against 6d12 force damage. You then make a melee Strike against one creature within your reach; if you hit, the target takes an additional 8d12 force damage.
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{ruleBlock
{{preamble
{{title Hypercompression}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Darkness}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, primal
**Range** :: 120 feet
**Area** :: 30-foot emanation
**Defense** :: basic Fortitude
**Duration** :: sustained up to 1 minute
}}

You condense gravity into a hyper-dense orb at a point you can see within range. The orb fills a 10-foot emanation with absolute darkness that no light, mundane or magical, can pierce. The area within 30 feet of the orb counts as difficult terrain for any creature moving away from the orb.

When a creature comes within 30 feet of the orb for the first time on a turn or starts its turn there, it must attempt a Fortitude save or be pulled 10 feet toward the orb.

When a creature comes within 5 feet of the orb for the first time on a turn or starts its turn there, the crushing gravity deals 8d10 bludgeoning damage (basic Fortitude save). On a critical failure, the creature is also Grabbed (DC equal to your spell DC to Escape).

You can move the orb up to 20 feet as a free action when you Sustain the Spell. The orb's movement can trigger its effects: if the orb moves to within 30 feet or 5 feet of a creature, that creature is treated as having come within that distance of the orb. Unsecured objects entirely within the area are pulled toward the orb, and small or smaller unsecured nonmagical objects within 5 feet of the orb are automatically destroyed at the end of each of your turns.

**Critical Success** The creature takes no damage and is not pulled.

**Success** The creature takes half damage and is not pulled.

**Failure** The creature takes full damage and, if within 30 ft, is pulled 10 feet toward the orb.

**Critical Failure** The creature takes double damage, is pulled 10 feet toward the orb, and is Grabbed (Escape DC = your spell DC).

{{postamble
**Heightened (+1)** :: The damage at 5 feet increases by 1d10.
}}
}}

{{ruleBlock
{{preamble
{{title Djura's Divine Protection}} {{aa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,unique Kosmoturgy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine
**Range** :: 30 feet
**Targets** :: up to 8 willing creatures
**Duration** :: 10 minutes
}}

You grant up to 8 willing creatures within range a hardened layer of air compressed to the point of becoming solid around their bodies. For the duration, each target gains resistance 10 to bludgeoning, piercing, slashing, and force damage. Additionally, each target gains a +2 status bonus to recovery checks while Dying.

{{postamble
**Heightened (+1)** :: The resistance increases by 5.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 4 | Kosmoturgy}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 5
# Memetics
___
}}

You have had a song stuck in your head. Consider, for a moment, what that sentence actually describes: a thing made of nothing, caught like a cold, living in your mind without paying rent, and leaving only when *it* decides to. Memetics is the school that takes this everyday haunting seriously. It is the magic of minds and of the ideas that inhabit them -- implanting memories and erasing them, seeding compulsions, prying truth out of thoughts that would rather keep it. Its gentlest workings are clerical conveniences. Its harshest linger as curses that rewrite how a mind works until someone with sufficient skill pries them back out.

The school's history runs through Færrin's worst neighborhoods. In the dark ages the old cabals -- the Pale Lantern Society among them, in its lean and secretive years -- traded memetic techniques alongside necromantic ones, on the sensible grounds that the mind is just one more thing that can be made to keep working after it should have stopped. The firmament's opening gentrified the craft. Today the cold war that replaced Færrin's hot ones is fought in screamsheet editorials, radio jingles, and lovingly engineered rumors, and memetics is that war's artillery. Every major Org maintains what its ledgers call a *communications directorate*. The people who work in them have, without exception, excellent handwriting and alarming eyes.

It must be said that most memetic practice is friendly, even mundane. Clerks duplicate fifty pages with a touch and un-write them just as cleanly. Diplomats hear every language in a room at once. Distant lovers and distant handlers alike keep telepathic threads humming across the continent, and a socialite with the right training simply *knows*, on a handshake, which cousin matters. The school makes Færrin's paperwork move, and it would be a duller, slower planet without it.

But the chapter you are about to read has a locked drawer, and honesty requires opening it. There are workings here that seat a listening worm beneath the skin of an unsuspecting ear; that seal a topic inside a mind so thoroughly the tongue rebels at approaching it; that empty a person of their own name and let them walk on, smiling, unencumbered. The Scale prosecutes the worst of these vigorously, the Church preaches against them beautifully, and both institutions, according to persistent and well-engineered rumor, retain specialists. The reader is invited to notice how comfortable that sentence was to read. That comfort is the school working as intended.

{{descriptive
##### On Reading This Chapter
Printed matter cannot cast spells, and this chapter is inert ink -- mostly. But ideas are the medium of this school, and ideas travel by exactly the route you are using now. Should any phrase from the following pages recur to you unbidden for more than three days, hum persistently, or begin to feel *load-bearing*, the compilers recommend a licensed practitioner, a Church confessor, or a genuinely absorbing hobby. This notice is a formality. Almost always, it is a formality.
}}

<!-- ART SLOT [ch5-memetics]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a communications-directorate office at night — pinboard of screamsheet clippings connected by golden thread, one thread leading into a listener's ear -->

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{wide,vol2SpellTable
##### Memetics Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Charming Memory | {{aa}} | Implanted fond memories improve your charm |
| 1 | Copy | 1 minute | Duplicate fifty pages perfectly onto blanks |
| 1 | Erase | {{aa}} | Erase a hundred pages without a trace |
| 1 | Flashback | 1 minute | Immerse a mind in one recent memory |
| 2 | Acupuncture | {{aa}} | Needle volley wounds and briefly blocks healing |
| 2 | Blithering Gibberish | {{aa}} | Reduce speech and spellcasting to babble |
| 2 | Forensic Analysis | {{a}} | Catalog a creature's statistics or secrets |
| 2 | Inquisition | {{aa}} | Interrogate the echo of a sleeping mind |
| 2 | Talk the Talk | {{aa}} | Instantly know a stranger's social standing |
| 3 | Arcane Tattoo | 10 minutes | Stored one-use tattoo grants a chosen boon |
| 3 | Artist's Rendition | {{aa}} | Make a drawing into the real object |
| 3 | Compression | {{aa}} | Flatten a willing creature into two dimensions |
| 3 | Earworm | {{aa}} | Hidden worm relays everything the target hears |
| 3 | Illusory Illusion | {{aa}} | Convince minds a real threat is illusion |
| 3 | Taboo | {{aa}} | Curse seals away lying or one topic |
| 4 | Dead Ringer | {{r}} | Reaction: vanish behind a dying illusory double |
| 4 | Farsight | 1 minute | Scry remote areas through placed sigils |
| 4 | Haunt | {{aa}} | Tether reveals a target's direction and distance |
| 4 | Laixa's Expert Intuition | {{aa}} | Treat lie-detection rolls as 15 |
| 4 | Mental Balance | 10 minutes | Emotional detachment shields against mental effects |
| 5 | Cone of Silence | {{aa}} | Cone where sound cannot exist |
| 5 | Connection | 1 minute | Long-range telepathy with a known friend |
| 5 | Fugue | {{aa}} | Strip a creature of its identity |
| 5 | Oddly Satisfying | {{aa}} | Overwhelming contentment slows and pacifies foes |
| 5 | Overhaul | 3 hours | Hours-long ritual rebuilds a humanoid's ancestry |
| 6 | Mass Fluency | {{aa}} | Four creatures understand every language |
| 7 | Bound Minds | 1 hour | Hour-long rite links two minds anywhere |
| 7 | Hellforging | 24 hours | Day-long forging binds will into a titan |
| 8 | Touch of Madness | {{aa}} | Curse floods a mind with contradictory impulses |
| 9 | Cerebral Disruption | {{aa}} | Permanent curse rewires and diminishes minds |
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Charming Memory}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Emotion}}{{trait Illusion}}{{trait Manipulate}}{{trait Mental}}{{trait Subtle}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Targets** :: you
**Duration** :: 1 hour
}}

You plant temporary, false, pleasant memories of yourself in the minds of nearby creatures, endearing yourself to them. For the duration, you gain a +1 status bonus to Deception, Diplomacy, and Performance checks. This spell has no effect in combat.

{{postamble
**Heightened (4th)** :: The status bonus increases to +2.
**Heightened (7th)** :: The status bonus increases to +3 and also applies to Intimidation checks.
}}
}}

{{ruleBlock
{{preamble
{{title Copy}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Cast** :: 1 minute
**Requirements** :: You have blank pages or surfaces sufficient to hold the copied material
**Range** :: touch
**Targets** :: 1 written or drawn document
}}

You touch a written or drawn document and produce a perfect duplicate onto blank pages or a blank surface you supply. You can copy up to 50 pages of text or an equivalent area of drawn material in one casting. Magical writing, including spellbook pages, scrolls, and glyphs, can be copied, but the copy is mundane; it does not retain magical properties. The copy is indistinguishable from the original to mundane inspection but can be identified as a copy with a successful Society check against your spell DC.

{{postamble
**Heightened (3rd)** :: You can copy up to 250 pages of text, and the copy retains any non-magical illustrations or illuminations with perfect fidelity.
}}
}}

{{ruleBlock
{{preamble
{{title Erase}} {{aa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 written or inscribed object or surface
}}

You touch an object or surface bearing writing, drawing, or inscription and erase it entirely. The writing vanishes as if it had never been made; the underlying object or surface is completely unharmed. You can erase up to 100 pages of text or a surface area of up to 50 square feet in one casting. Mundane writing is erased automatically. Magical writing, including glyphs, sigils, and spellbook pages, is also erased; if the writing was a prepared magical effect, erasing it counteracts the effect at the spell's rank. The object or surface appears to have never been written on to all mundane inspection.

{{postamble
**Heightened (3rd)** :: You can erase magical writing from prepared scrolls and formula books; a magical scroll erased this way is destroyed without activating.
**Heightened (5th)** :: You can erase runes and property runes inscribed on weapons and armor; each rune erased is permanently destroyed.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Flashback}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Cast** :: 1 minute
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: sustained up to 10 minutes
}}

You touch a willing creature and guide its mind back to a specific memory it experienced within the last 24 hours. While you sustain the spell, the target relives that memory in vivid detail, becoming Paralyzed as its attention fully occupies the recalled moment. It is aware of its surroundings as if from far away. You and up to 5 additional willing creatures you designate may share in observing the memory, perceiving it as if through the target's senses, including sight, hearing, and any special senses the target possessed at the time. While sharing the memory, you and any observers are Dazzled but are otherwise free to act. The spell ends immediately if you stop sustaining it.

{{postamble
**Heightened (2nd)** :: The memory window extends to 1 week.
**Heightened (3rd)** :: The memory window extends to 1 month.
**Heightened (4th)** :: The memory window extends to 1 year.
**Heightened (5th)** :: The target can revisit any memory from any time in its past.
}}
}}

{{ruleBlock
{{preamble
{{title Acupuncture}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Memetics}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature
**Duration** :: 1 round
}}

You summon a cluster of fine arcane needles and drive them into a target's pressure points from range. Make a spell attack roll against the target. On a hit, the target takes 5d6 piercing damage and cannot regain HP until the start of your next turn. This suppresses all healing, including fast healing, regeneration, and healing spells. Additionally, on a hit you gain a single flash of insight about the target's resistances; you learn one of the following (your choice): a damage vulnerability, a damage resistance, or a damage immunity the target possesses. On a critical hit, the information-gathering grants two items from the list instead of one.

{{postamble
**Heightened (+1)** :: The piercing damage increases by 2d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Blithering Gibberish}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Linguistic}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 minute
}}

You partially occlude the mental faculties of a creature you can see within range, reducing its speech and magical articulation to incoherent babble. The target must attempt a Will save against your spell DC.

**Success** The target is unaffected.

**Failure** The target is Stupefied 1 and cannot produce intelligible speech or cast spells with the linguistic trait for the duration. At the end of each of its turns, the target can attempt a new Will save to end the effect; a successful save ends it.

**Critical Failure** The target is Stupefied 2 and cannot produce intelligible speech or Cast a Spell that requires speech for the duration. At the end of each of its turns the target can attempt a new Will save, with the DC increased by 2, to end the effect.

{{postamble
**Heightened (+2)** :: You can target two additional creatures.
}}
}}

{{ruleBlock
{{preamble
{{title Forensic Analysis}} {{a}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 60 feet
**Targets** :: 1 creature
**Defense** :: Will
}}

You translate a sliver of a creature's soul into readable text, inscribing it into a magical Compendium of Statistics and Secrets that you conjure on the first casting. The Compendium materializes as a small, floating tome visible only to you; it persists indefinitely but contains no information until you cast this spell. The Compendium is a purely mental construct; it is destroyed if you die or prepare new spells. On subsequent castings you choose one of two modes.

Statistics Mode: You learn one of the following about the target: its creature type, one damage resistance or immunity, one damage weakness, its highest or lowest saving throw modifier (your choice), or the approximate level of its greatest or weakest ability score. The result is recorded in the Compendium under the creature's entry.

Secrets Mode: The target's Compendium entry gains a one-word descriptor of its current mood, which updates on its own while the creature is within 60 feet of you. The target must attempt a Will saving throw. Regardless of the outcome, you cannot target the same creature in Secrets Mode again for 24 hours.

**Success** The target is unaffected and immediately knows you attempted to read its mind.

**Failure** You learn one secret, a single yes-or-no answer, from the target's psyche, recorded in the Compendium. The target does not know the question was asked.

**Critical Failure** You learn two secrets, each a yes-or-no answer, from the target's psyche, recorded in the Compendium. The target does not know the questions were asked.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Inquisition}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Mental}}{{trait Subtle}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 unconscious or sleeping creature
**Defense** :: Will
**Duration** :: sustained up to 10 minutes
}}

You lay your hands on a sleeping or Unconscious creature and draw out a temporary echo of its mind, a ghostly impression that will answer your questions in the target's native language as long as you sustain the spell. The target's body remains motionless and unaware of the interrogation.

The target must attempt a Will saving throw with a –2 circumstance penalty.

**Critical Success** The echo does not form. The target wakes if it was sleeping and becomes aware an attempt was made to enter its mind.

**Success** The echo does not form. The target remains Unconscious and unaware.

**Failure** The echo forms and answers your questions for the duration. If a question would reveal information the target desperately wants to keep secret, the echo may attempt another Will save to resist answering that question.

**Critical Failure** The echo forms and answers all questions fully, with no secondary save granted for sensitive topics.
}}

{{ruleBlock
{{preamble
{{title Talk the Talk}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Subtle}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 creature
**Duration** :: 1 hour
}}

You touch a creature and are suddenly granted the ability to read them accurately in social situations. For the duration, you instinctively know basic public information about the target: their name, title, immediate family relationships, and publicly known interests, the sort of thing they would freely disclose in a casual public setting.

This grants you a +2 status bonus to Society and Diplomacy checks against the target.

When the spell ends, you forget any information that was granted to you magically at the start of the spell. Information you personally learned during the hour, such as names you heard people say aloud or secrets whispered in your presence, remains.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Arcane Tattoo}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Cast** :: 10 minutes
**Cost** :: special ink worth 15 gp (consumed)
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: permanent until activated
}}

You spend 10 minutes scribing a magical tattoo onto a willing creature's skin, binding a reservoir of arcane energy into the design. A creature can hold only one Arcane Tattoo at a time; scribing a new one immediately dissolves any previous one. The tattoo type determines its effect when activated.

The recipient can activate the tattoo as a single action. Once activated, the tattoo vanishes and the spell ends. The tattoo can be removed early by a dispel magic of rank 3 or higher, or by the recipient willingly choosing to dissolve it, requiring 1 minute of concentration.

Choose one of the following tattoo types when scribing:

**Red:** The recipient enters a battle frenzy. For 1 minute, they gain a +1 status bonus to melee attack rolls and a +2 status bonus to melee damage rolls, but all melee attack rolls against them gain a +1 circumstance bonus.

**Yellow:** The recipient's Strength score temporarily surges. They gain a +4 item bonus to Strength-based skill checks and Athletics for 10 minutes, and can lift and carry twice their normal bulk capacity.

**Green:** The recipient's movement quickens to supernatural speed. They gain a +20-foot status bonus to their Speed for 1 minute. Reactive Strikes against the recipient are made with a –2 circumstance penalty.

**Purple:** The recipient fades into the background. They gain a +3 status bonus to Stealth checks for 10 minutes, and can attempt to Hide even while observed, though the usual –2 penalty for observed creatures still applies.
}}

{{ruleBlock
{{preamble
{{title Artist's Rendition}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Duration** :: permanent
}}

You touch a two-dimensional drawing or painting on a physical surface and speak a word of creation, causing the image to reconstitute itself as a real, three-dimensional object. The drawing must depict a mundane object or terrain feature and must cover no more than 25 square feet of surface. The resulting object is nonmagical and mundane in every respect.

The created object cannot have a value greater than 25 gp; if the drawing depicts something of greater worth, the result appears authentic at a glance but is obviously false paste or bone on close inspection. Doorways created through solid stone extend through at most 1 foot of stone, 3 feet of wood or dirt, 1 inch of common metal, or a thin sheet of lead, and a door created on a wall creates a functioning door into whatever space lies beyond. Pits extend 10 feet downward regardless of the physical depth of the surface they are drawn on. If the drawing depicts a source of energy, the creation deals 1d8 damage of the appropriate type to each creature within 5 feet when it forms, then immediately dissipates; it is not a sustained energy source.

The created object is permanent but behaves as any mundane object of its type.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Compression}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}{{trait Polymorph}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 8 hours
}}

You compress a willing creature into a two-dimensional representation of itself. For the duration, the target gains resistance 5 to physical damage from non-magical sources, can move across any flat, non-living surface in any direction, including walls and ceilings, at its normal Speed, and gains a +4 status bonus to Stealth checks. The target can also pass through any gap or opening that is at least as wide or as tall as the target, such as the gap under a closed door, and no longer requires food or drink, though it continues to age normally.

While compressed, the target can only use the Stride action or revert to its three-dimensional form. Reverting to 3D form requires 1 minute of sustained effort. The target can re-enter 2D form, which likewise requires 1 minute, and can dismiss this spell at any time.
}}

{{ruleBlock
{{preamble
{{title Earworm}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Memetics}}{{trait Auditory}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: 8 hours
}}

You implant a tiny worm woven from arcane thread beneath the skin of a creature, seating it near the creature's ear canal. The target must attempt a Fortitude saving throw.

**Critical Success** The worm fails to seat itself and dissolves. The target senses the attempt.

**Success** The worm dissolves harmlessly. The target feels a brief itching sensation but is unaware of the nature of the attempt.

**Failure** The worm seats itself. You hear all sounds the target hears for the duration, as long as you and the target are on the same plane of existence. The target is unaware of the eavesdropping. The worm dissolves at the end of the spell's duration. A creature that successfully uses the Seek action against your spell DC can feel the arcane thread and is then aware of the worm's presence.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Illusory Illusion}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Illusion}}{{trait Manipulate}}{{trait Mental}}{{trait Visual}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 500 feet
**Targets** :: 1 object, creature, or phenomenon you can see
**Defense** :: Will
**Duration** :: sustained up to 1 minute
}}

You subtly reframe the perceptions of creatures nearby, convincing their minds that a real object, creature, or phenomenon is actually just an illusion, and therefore harmless. You choose one object, creature, or ongoing phenomenon within range that is no larger than a 20-foot cube. Creatures within 120 feet of the chosen target must attempt a Will saving throw.

**Critical Success** The creature is unaffected and knows a mental trick was attempted.

**Success** The creature is unaffected.

**Failure** The creature believes the chosen target is an illusion for the duration. It treats the target as non-threatening: a creature affected this way will not willingly interact with or attack the chosen target, will walk through a wall or barrier it believes is illusory, and will disregard any harmful effects it believes the target is producing. The creature can attempt a new Will save at the end of each of its turns if it takes damage from the 'illusory' source.

**Critical Failure** As failure, and the creature is also Fascinated by the 'illusory' phenomenon for 1 round. It spends its first action moving toward or examining the chosen target.

{{postamble
**Heightened (+2)** :: The maximum size of the chosen target increases to a 40-foot cube, and the save DC for per-turn saves increases by 2.
}}
}}

{{ruleBlock
{{preamble
{{title Taboo}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Curse}}{{trait Linguistic}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 week
}}

You curse one creature you touch, sealing a forbidden topic inside their mind. Choose one taboo: either the act of lying, or a specific narrow topic, such as a particular witnessed event, a specific location, or a specific named individual. The GM has final say on whether the topic is sufficiently specific. The creature must attempt a Will save.

If the curse takes hold, whenever the target attempts to speak about the forbidden topic, its tongue swells grotesquely and protrudes from its mouth, rendering it unable to speak for 1d4 minutes. Removing it requires a successful counteract check against this spell's rank.

**Success** The creature is unaffected.

**Failure** The curse takes hold. The creature cannot speak about the forbidden topic; attempting to do so triggers the swollen-tongue effect.

**Critical Failure** As failure, and the creature is unaware of the specific trigger; it doesn't know what topic has been taboo'd until it triggers the effect for the first time.

{{postamble
**Heightened (+2)** :: You may target 1 additional creature with a single taboo each.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Dead Ringer}} {{r}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Illusion}}{{trait Manipulate}}{{trait Visual}}
}}

{{definitions
**Traditions** :: arcane, occult
**Trigger** :: You succeed at a saving throw or are missed by a Strike.
**Range** :: self
**Duration** :: 10 minutes
}}

You make your foes see what they want to see. You instantly turn invisible and an illusory duplicate appears in your exact position, apparently undergoing a horrific fate corresponding to the effect you just evaded, such as being struck down, poisoned, or burned. The illusion makes you appear to have died dramatically. The duplicate remains in place for the duration.

You remain invisible for the duration, or until you take a hostile action. Physical interaction with the duplicate reveals it to be an illusion, as objects and creatures pass through it. A creature that uses Seek to examine the duplicate can attempt a Perception check against your spell DC to discern it as an illusion; if the check succeeds, that creature can see through the duplicate.

When the invisibility ends, the duplicate also vanishes.
}}

{{ruleBlock
{{preamble
{{title Farsight}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Memetics}}{{trait Concentrate}}{{trait Detection}}{{trait Manipulate}}{{trait Scrying}}
}}

{{definitions
**Traditions** :: arcane, occult
**Cast** :: 1 minute
**Cost** :: sigils of seeing (100 gp per sigil in special ink) and a 250 gp magic circle (one-time construction cost)
**Range** :: planetary
**Targets** :: you
**Duration** :: 8 hours
}}

You empower a magic circle you previously constructed, linking it to sigils of seeing you have previously placed at remote locations. When you stand inside your empowered circle, you can choose to perceive the area around any linked sigil as if you were physically present at the sigil's location. You can see and hear the area as if using your normal senses. The remote perception functions only while you remain inside the circle. If you leave it, the link falls dormant until you return. You can switch between linked sigils by using a 1-action Interact activity while inside the circle.

The number of sigils you can link per casting equals your Intelligence modifier. Sigils can be on other planes of existence; the distance between circle and sigil is not a factor.

Each sigil must be drawn by you personally, physically present at its location; doing so requires 1 minute and 100 gp of special ink. The sigil is typically no more than an inch in diameter and fades from view once drawn, only reappearing while you are perceiving through it. The ink otherwise makes the sigil nearly invisible; it requires a DC 10 Perception check to notice while the sigil is active, or a Seek action using your spell DC to find it while inactive. Drawing a new circle requires 1 day and 250 gp — typically a flat design of a geometric shape roughly 5 feet in radius — while empowering a previously placed circle takes only 1 minute.

{{postamble
**Heightened (6th)** :: You can link one additional sigil per casting beyond your Intelligence modifier.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Haunt}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Detection}}{{trait Manipulate}}{{trait Mental}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 creature
**Duration** :: until your next daily preparations
}}

You bind your awareness to a creature you touch, weaving a psychic tether between your mind and theirs. For the duration, you always know the approximate direction and distance to the target creature and the target cannot be Hidden from you through mundane means. If the target is within 500 feet, you also know their exact location.

You may also sense which areas fall within the target's line of sight, gaining a vague impression of what the target can perceive, not detailed vision but awareness of open space versus blocked space from the target's vantage point.

Once per round, you can spend a single action, which has the teleportation trait, to teleport to any unoccupied space within 30 feet of the target, provided that space is not currently within the target's line of sight and you are on the same plane as the target. If the destination is occupied or solid, the teleportation fails.
}}

{{ruleBlock
{{preamble
{{title Laixa's Expert Intuition}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Detection}}{{trait Fortune}}{{trait Mental}}
}}

{{definitions
**Traditions** :: occult
**Range** :: self
**Targets** :: you
**Duration** :: 1 hour
}}

For the duration, when you attempt a Sense Motive check to detect a lie, you can replace the result you roll with a 15.
}}

{{ruleBlock
{{preamble
{{title Mental Balance}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Emotion}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Cast** :: 10 minutes
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 8 hours
}}

You temporarily remove all of the target's emotional attachments or biases.

For the duration, the target gains a +2 status bonus to saving throws against emotion, fear, and mental spells and effects. The target automatically succeeds at Perception checks to notice memetic effects or illusions that target its emotions. The target is temporarily immune to the Fascinated and Controlled conditions.

The target cannot show favoritism or make decisions based on personal loyalty, emotion, or preference; all its decisions must follow the letter of the law it is bound by, and cannot be compelled by magically-imposed emotion to act against its rational conclusions.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Cone of Silence}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Memetics}}{{trait Auditory}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: self
**Area** :: 60-foot cone
**Duration** :: sustained up to 1 minute
}}

You stop all vibration from propagating through a cone-shaped volume of air that extends from your eyes; no sound can enter, exit, or propagate through the affected area.

Each creature fully within the cone is Deafened. The cone follows your line of sight as you turn; creatures that leave the cone are no longer deafened by the spell. The cone extends in the direction you are facing.
}}

{{ruleBlock
{{preamble
{{title Connection}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}{{trait Mental}}{{trait Subtle}}
}}

{{definitions
**Traditions** :: arcane, divine, occult
**Cast** :: 1 minute
**Range** :: planetary
**Targets** :: 1 willing creature you know personally
**Duration** :: 10 minutes
}}

You open a telepathic connection to a willing creature you know personally. For the duration, you and the target can exchange thoughts at the speed of conversation; each side recognizes the other as the sender if you already know each other, and the exchange is silent and invisible to onlookers. The connection works at any distance on the same world. If the target is on a different world than you, the spell has a 5% chance of failing to connect, wasting the spell slot.

{{postamble
**Heightened (7th)** :: You can include up to 3 willing creatures you know in the connection; any participant can communicate with any other.
**Heightened (8th)** :: Duration becomes 1 hour and the interhorizon failure chance drops to 1%.
**Heightened (9th)** :: You can include up to 8 willing creatures.
}}
}}

{{ruleBlock
{{preamble
{{title Fugue}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 8 hours
}}

Your touch causes the target to forget its identity and purpose. The target retains all physical abilities, skills, and spell slots, but cannot remember who they are, their companions, their mission, or any details of their life before this moment.

**Critical Success** The creature is unaffected.

**Success** The creature is Confused about the current situation for 1 round as the haze briefly washes over it.

**Failure** The creature loses all memory of its identity and recent past for the duration. A hostile creature affected this way forgets why it was fighting and becomes indifferent to the caster and the caster's allies for 1 minute. It treats its allies as strangers. A creature under this effect can attempt a new Will saving throw at the end of each hour; on a success, the effect ends.

**Critical Failure** As failure, but the creature forgets its identity for the full duration with no hourly saves. It also takes a –2 status penalty to attack rolls and skill checks while the fugue persists, as its actions feel detached and purposeless.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Oddly Satisfying}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Emotion}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 minute
}}

You flood the target's mind with overwhelming feelings of contentment and satisfaction, a soothing psychic tide that makes action feel unnecessary. The target must attempt a Will saving throw.

**Critical Success** The creature is unaffected.

**Success** The creature is Slowed 1 until the end of its next turn, as the wave of contentment briefly washes over it.

**Failure** The creature is overwhelmed by satisfaction. For the duration, it is Slowed 1, takes a –2 status penalty to attack rolls and skill checks, and must succeed at a DC 5 flat check to use any action that would harm or threaten the caster or the caster's allies. At the end of each of its turns, the creature can attempt a new Will saving throw; on a success, the effect ends.

**Critical Failure** As failure, but the creature is Slowed 2, the flat check DC to act aggressively increases to 10, and it must succeed at its per-turn Will save twice to break free.
}}

{{ruleBlock
{{preamble
{{title Overhaul}} {{spacer}} {{kind Ritual}} {{level 5}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Memetics}}{{trait Polymorph}}
}}

{{definitions
**Cast** :: 3 hours
**Cost** :: a drafting table and 1,000 gp worth of metallic inks, which the spell consumes
**Secondary Casters** :: 1
**Primary Check** :: Arcana (expert) or Occultism (expert)
**Secondary Checks** :: Medicine
**Range** :: touch
**Targets** :: 1 living humanoid creature
**Duration** :: permanent
}}

Over the course of three hours of painstaking work, you deconstruct and rebuild the physical form of a living humanoid creature, who must remain within your reach throughout the casting. An unwilling creature resists the working in stages: it attempts a Reflex save at the end of the first hour, a Will save at the end of the second, and a Fortitude save at the end of the third. If any of these saves succeeds, the ritual ends with no effect and the partially-begun transformation is reversed harmlessly. A willing creature may forgo these saves.

If the target does not resist, the outcome depends on your primary check. The transformed creature retains all of its abilities, class features, proficiencies, and memories, but its ancestry traits, ability boosts, and ancestry feats change to match its new form. Appearance features such as height, weight, age, and coloration are under the caster's direction.

This is a permanent polymorph, treated as a curse. Removing it requires a successful counteract check against this spell's rank, or it can be undone by casting Overhaul again.

**Critical Success** The transformation is flawless. You choose the creature's new ancestry from the humanoid ancestries available in the setting.

**Success** The creature's ancestry changes to a randomly determined humanoid ancestry from those available in the setting.

**Failure** The ritual fails with no effect.

**Critical Failure** The ritual fails violently partway through; the creature takes 2d10 void damage from the stress of partial restructuring.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Mass Fluency}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Linguistic}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: up to 4 willing creatures
**Duration** :: 1 week
}}

You grant the ability to understand any language to up to four willing creatures, touching each in turn as part of the casting. For the duration, each target can understand any language they read or hear. In addition, each target can speak in any language they understand through this spell as long as they are physically capable of speech.

{{postamble
**Heightened (+1)** :: You can affect one additional willing creature.
}}
}}

{{ruleBlock
{{preamble
{{title Bound Minds}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Cast** :: 1 hour
**Cost** :: two halves of a locket or necklace (consumed)
**Range** :: touch
**Targets** :: 2 willing creatures (including you or not)
**Duration** :: 1 year
}}

You spend an hour inscribing a memetic link between two willing creatures who each hold half of a shared token. Upon completion, the two creatures are mentally linked for the duration. Each linked creature is always aware of the other's precise location, accurate enough to navigate directly to the other even while blindfolded, through walls, or across planes. Each linked creature continuously senses the other's general physical condition, from healthy to injured to grievously Wounded or Dying, and general emotional state, such as calm, Frightened, joyful, or enraged. This awareness does not convey sensory information about surroundings. A creature can be under only one Bound Minds link at a time; casting this spell while an existing link is active breaks the previous link.

{{postamble
**Heightened (9th)** :: The duration becomes unlimited; the link lasts permanently until counteracted or willingly ended by both linked creatures.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Hellforging}} {{spacer}} {{kind Ritual}} {{level 7}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Memetics}}
}}

{{definitions
**Cast** :: 24 hours
**Cost** :: a complete mechanical body worth 50,000 gp containing a core of refined Phlogiston (consumed)
**Secondary Casters** :: 1
**Primary Check** :: Arcana (master) or Occultism (master)
**Secondary Checks** :: Crafting
**Range** :: touch
**Targets** :: 1 inert constructed body
**Duration** :: permanent
}}

You spend 24 hours inscribing an arcane contract into the core of a prepared mechanical body, binding a sliver of extraplanar will to animate it. The resulting Hellforged Titan uses an appropriate construct stat block with a level set by the Creature Creation Rituals table for the rank at which you perform Hellforging: level 10 at rank 7, level 14 at rank 9, level 16 at rank 10.

**Critical Success** The contract takes flawlessly. The construct animates at the higher creature level the table allows for the ritual's rank—11 at rank 7, 15 at rank 9, 17 at rank 10. It is friendly toward you but is not under your control; it has its own will and motivations shaped by the contract you inscribed.

**Success** As critical success, except the construct's level is the lower value for the ritual's rank.

**Failure** The inscription fails to take, and uncontrolled energies surge through you: you take 3d10 mental damage and 2d10 void damage. The core and the mechanical body are unharmed.

**Critical Failure** As failure, and the core shatters, rendering the mechanical body unusable.

If you perform Hellforging at 9th rank or higher, you may also write one binding clause into the contract on a success or critical success, compelling the construct to follow one standing order, excluding combat-suicidal orders.
}}

{{ruleBlock
{{preamble
{{title Touch of Madness}} {{aa}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Curse}}{{trait Incapacitation}}{{trait Linguistic}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: 120 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: varies (permanent until counteracted)
}}

You overwhelm a creature's mind with a cascade of contradictory impulses. The target must attempt a Will save. On a failure, the target is afflicted with the Fractures of Madness curse: it becomes Stupefied 4, cannot Cast Spells, and treats all non-hostile creatures as friendly, following the last spoken order given to it unless compliance would cause self-harm. Removing it requires a successful counteract check against this spell's rank. The target may attempt a new Will save to end the curse at each monthly interval.

**Critical Success** The target is unaffected.

**Success** The target is Stupefied 2 for 1 minute (no curse).

**Failure** The target is afflicted with the Fractures of Madness curse, as described above.

**Critical Failure** As failure, and the target is Confused for 1 round before the longer-term curse takes hold.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{ruleBlock
{{preamble
{{title Cerebral Disruption}} {{aa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,unique Memetics}}{{trait Concentrate}}{{trait Curse}}{{trait Emotion}}{{trait Fear}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: varies (permanent until counteracted)
}}

You reach into the target's mind and rewire its cognitive architecture, leaving it permanently diminished. The target must attempt a Will save.

The curse persists indefinitely; removing it or the permanent Stupefied condition requires a successful counteract check against this spell's rank.

| d6 | Curse Effect | Effect |
|:---:|:---:|:---:|
| 1 | Haunting Presence | The target is Frightened 2 whenever it can perceive you. |
| 2 | Phobia | The target develops a severe phobia and is Frightened 2 in the presence of a common object the GM names. |
| 3 | Shattered Intellect | The target automatically critically fails Intelligence-based skill checks. |
| 4 | Lingering Confusion | The target is Confused for 1 minute, then must save against your spell DC each day or be Confused for 1 round. |
| 5 | Amnesia | The target cannot Recall Knowledge or use class abilities that require memory of its training. |
| 6 | Regression | The target undergoes childlike mental regression, and the GM controls its non-combat social behavior. |

**Critical Success** The target is unaffected.

**Success** The target becomes Stupefied 2 for 1 minute.

**Failure** The target becomes Stupefied 4 permanently and is afflicted with one curse effect from the Cerebral Disruption table, rolled on a d6 or chosen thematically by the GM.

**Critical Failure** As failure, and the target is Confused for 1 round.
}}

{{pageNumber,auto}}
{{footnote Chapter 5 | Memetics}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 6
# Mercuromancy
___
}}

Everyone on Færrin gambles. The farmer gambles on rain, the Org on quarterly returns, the pilgrim on the afterlife, and all of them at rather worse odds than they imagine. Mercuromancy is the school for people who checked the odds and found them negotiable. It bends fate and probability the way other schools bend fire or stone -- rigging games of chance, banking good fortune before the dice fall, and cursing rivals with the sort of luck that follows a person up stairwells. Where the rest of the Liturgy asks *what can be done*, mercuromancy asks the older, ruder question: *what are the chances?* -- and then answers it personally.

Its natural habitats are anywhere probability changes hands. The card rooms of Lorandris and the resort casinos of Austrene employ house mercuromancers the way banks employ guards, and for symmetrical reasons; the actuarial floors of Amber Call pay handsomely for casters who can read a life's variance off a handshake. Hildebrant Corp. is run, famously, by a fortune dragon, and while its engineers will insist at length that their airframes fly on lift and mathematics, one notes that the mathematics have never once been unlucky. Among ordinary folk the school operates at retail: a tugged coin-flip here, three stars of banked fortune orbiting a bride's head there, a friendly game that stops being friendly the moment somebody's dice begin alternating twenties and ones with liturgical regularity.

Practitioners describe their craft as accountancy. Fortune, they insist, is not created or destroyed; it is *moved*, and every blessing is a debit against somewhere. The school's twin currencies make this literal. Ruin and Preservation -- misfortune and fortune rendered dense enough to handle -- are fate as a commodity: a caster may summon a swirling sliver of Ruin and mail it, more or less, to an enemy, while masters collapse whole rooms into pure Preservation, a zone where every die lands on its median and nothing interesting is permitted to occur. Slivers and slices of the stuff trade quietly between practitioners at prices that are themselves a form of gambling. The reader is asked to remember these two currencies. They will reappear, intertwined, in this book's final chapter, as the purchase price of the most expensive working ever codified.

For all its green-felt reputation, the school keeps one working that silences every card room it is mentioned in. A mercuromancer may kneel beside the body of someone they loved and re-deal the hand -- offering fate an exchange, their own vitality against the departed's. The masters call it the only honest wager in the canon: stakes on the table, no house edge, and the caster plays it knowing exactly what the cards cost.

{{note
##### House Rules — The Gilded Wheel, Austrene (posted at every table)
The Wheel welcomes all patrons and their money. Be advised: fate-work at the tables is detected by our floor staff, whose luck is better than yours, professionally. Workings upon dice, wheels, cards, dealers, or *other patrons' composure* void all winnings and the management's patience. First offense: forfeiture. Second offense: the mountain road, at night, in whatever weather your fortune deserves. The Wheel thanks you, and reminds you that the house does not cheat. The house has never needed to.
}}

<!-- ART SLOT [ch6-mercuromancy]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a card table mid-hand — a gambler with three sparkling stars orbiting her head, opposite a rival whose cards are quietly catching iridescent rot -->

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{wide,vol2SpellTable
##### Mercuromancy Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Gambler's Trick | {{a}} | Cantrip nudges one minor chance event |
| 2 | Lockstep Fate | {{aa}} | Bank your bad roll; a foe inherits it |
| 2 | Lucky Ward | {{aa}} | Aura: allies' attacks blessed, foes' fortune soured |
| 2 | Take Me Instead | 1 minute | Revive the dead, taking their place dying |
| 3 | Lucky Stars | {{aa}} | Three charges buy rerolls or foil attackers |
| 3 | Pendulum | {{aa}} | Fix a foe's rolls to alternating extremes |
| 3 | Rearrange Fate | {{aa}} | Roll two d20s now, spend them later |
| 4 | Awkward | {{aa}} | Will save or become obliviously Clumsy |
| 4 | Fumble | {{aa}} | Curse of persistent magical clumsiness |
| 5 | Charming | {{aa}} | All onlookers regard you as friendly |
| 5 | Gift of the Archmage | 1 minute | Lend a prepared spell to another creature |
| 5 | Let's Start a Fight | {{aa}} | Incite a crowd into a brawl |
| 6 | Healing Draught | {{aa}} | Bottle fills with potent healing potion |
| 6 | Sphere of Preservation | {{aa}} | Everyone inside rolls exact median dice |
| 7 | Do My Bidding | 10 minutes | Ten-minute speech bends a crowd's purpose |
| 7 | Sphere of Ruin | {{aa}} | Relentless sphere inflicts random ruinous effects |
| 8 | Reflective Defense | {{a}} | Resist 30 vs magic; fully-blocked damage rebounds |
| 9 | Extra Motivation | {{aa}} | Recover three expended spell slots instantly |
}}

{{ruleBlock
{{preamble
{{title Gambler's Trick}} {{a}} {{spacer}} {{kind Cantrip}} {{level 1}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Cantrip}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 30 feet
**Targets** :: 1 minor chance event within range
}}

You gently tug the threads of probability to nudge a single, minor act of chance in your favor. When you Cast this Spell, choose one minor random event actively occurring within range: a coin flip, a die roll in a game of chance or minor contest, a card draw from a shuffled deck, or an equivalent petty act of fortune. You choose the result of the event from among its possible outcomes.
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Lockstep Fate}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 30 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: sustained up to 1 minute
}}

You reach across the threads of fate and entangle your luck with that of one creature you can see. The target must attempt a Will save. On a failure, your fortunes are linked for the spell's duration.

While the link holds, when you roll any d20 (an attack roll, skill check, or saving throw) and dislike the result, you may choose to Hold the Roll, mentally noting the result. The next time the linked creature would roll any d20, it automatically uses your Held Roll as its result instead, and the Hold is discharged. You can hold only one roll at a time and can't replace a held roll with a different one.

The link ends when you discharge a held roll.

**Critical Success** The target is unaffected and immune to this spell for 24 hours.

**Success** The target is unaffected.

**Failure** The link forms for the duration.

**Critical Failure** The link forms and the first Held Roll you discharge is treated as a natural 1 for the target (regardless of what the roll actually was).
}}

{{ruleBlock
{{preamble
{{title Lucky Ward}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Aura}}{{trait Concentrate}}{{trait Emotion}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: self
**Area** :: 30-foot emanation
**Defense** :: Will
**Duration** :: sustained up to 1 minute
}}

You twist the threads of fate in a dome around yourself so that fortune favors your companions and turns its back on your foes. Allies in the emanation gain a +1 status bonus to attack rolls. Each enemy in the area when you Cast the Spell, and each enemy that enters or starts its turn in the area afterward, must attempt a Will save.

**Critical Success** The enemy is unaffected and is temporarily immune for 10 minutes.

**Success** The enemy is unaffected.

**Failure** The enemy takes a -1 status penalty to attack rolls while inside the emanation.

**Critical Failure** As failure, and the penalty also applies to the enemy's saving throws while inside the emanation.
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Take Me Instead}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Healing}}{{trait Vitality}}
}}

{{definitions
**Traditions** :: divine, occult
**Cast** :: 1 minute
**Range** :: touch
**Targets** :: the corpse of 1 creature that died within the last hour
**Duration** :: instantaneous
}}

You touch the corpse of a creature you knew well and make a solemn bargain with fate: you offer yourself in its place.

Attempt a DC 20 Diplomacy check. If the creature was a family member, a close companion, or a romantic partner, you gain a +4 circumstance bonus to this check.

On a success, the creature is restored to 1 HP and can act normally. You immediately fall Unconscious and begin making recovery checks as if you had reached 0 HP and the Dying condition (you immediately gain Dying 1). For the next 1 hour, you cannot benefit from healing effects, including potions, spells with the healing trait, or natural recovery. If you die while under this rider, no spell of rank 4 or lower can restore you to life.

On a failure, the corpse is unaffected. You take 2d8 void damage from the strain of the attempt.
}}

{{ruleBlock
{{preamble
{{title Lucky Stars}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

You pluck three small pockets of fate from the air, manifesting as sparkling stars orbiting your head. You have 3 star charges that persist for the duration.

Before you attempt an attack roll, skill check, Perception check, or saving throw, you can spend 1 star charge as a free action to roll an additional d20 and use the better result.

Whenever an attack roll is made against you, you can spend 1 star charge as a free action to roll a d20 and force the attacker to use the lower result (misfortune effect).

The stars fade when all charges are spent or the duration expires.
}}

{{ruleBlock
{{preamble
{{title Pendulum}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}{{trait Misfortune}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 minute
}}

You bend fate to move in perfectly predictable patterns. The target must attempt a Will save.

The oscillating fate sequence replaces the target's d20 rolls with a fixed pattern: the first roll is treated as 20, the second as 1, the third as 19, the fourth as 2, the fifth as 18, the sixth as 3, and so on, alternating between high and low results. The target still makes its roll visibly but replaces the result with the next number in the sequence.

**Success** The target is unaffected.

**Failure** The target's d20 rolls follow the oscillating fate sequence for 1 minute. The target is aware that something is wrong but cannot determine the pattern.

**Critical Failure** As failure, and the target doesn't realize the sequence is predictable until it has rolled at least twice.
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Rearrange Fate}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: 1 hour
}}

You grant a willing creature the ability to take control of their own immediate fate. The creature rolls two d20s and notes both results. For the next two d20 rolls the creature makes during the spell's duration, it must use those pre-rolled results, but it can choose which pre-rolled result applies to which roll.

A creature can only benefit from one casting of Rearrange Fate at a time.
}}

{{ruleBlock
{{preamble
{{title Awkward}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Emotion}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 30 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 minute
}}

You cause a creature to temporarily lose its social and physical confidence, making it obliviously Clumsy. The targeted creature must attempt a Will save. A creature affected by this spell doesn't notice it is performing poorly and cannot use abilities that would allow it to reroll or improve the affected checks.

**Success** The creature is unaffected.

**Failure** The creature is affected by awkwardness. It becomes Clumsy 1 and takes a –1 status penalty to Charisma-based skill checks. It also can't benefit from fortune effects on those rolls.

**Critical Failure** As failure, but the creature becomes Clumsy 2.
}}

{{ruleBlock
{{preamble
{{title Fumble}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Curse}}{{trait Fortune}}{{trait Manipulate}}{{trait Mental}}{{trait Misfortune}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 30 feet
**Targets** :: 1 creature
**Defense** :: Reflex
**Duration** :: sustained up to 1 minute
}}

You weave strands of misfortune around a target creature, cursing it with magical clumsiness. The target must attempt a Reflex save. The curse ends if the target rolls a critical success on any save or Acrobatics check required by this spell.

**Critical Success** The target is unaffected and is temporarily immune to Fumble for 24 hours.

**Success** The target is unaffected.

**Failure** The target is afflicted by stumbling clumsiness. Whenever the target uses a move action that moves it 15 or more feet, it must succeed at an Acrobatics check against your spell DC or fall Prone at the end of that movement.

**Critical Failure** As failure, but the target also becomes Clumsy 1 for the duration.
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Charming}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Emotion}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 30 feet
**Targets** :: all creatures in range that can see you
**Defense** :: Will
**Duration** :: 1 hour
}}

You twist fate to project an aura of irresistible charisma, bending the perceptions of every creature that can see you within 30 feet. Each affected creature must attempt a Will save. Creatures you or your companions are currently in combat with attempt this save with a +2 circumstance bonus.

A charmed creature regards you as a trusted, friendly acquaintance. It will not willingly harm you and will interpret your requests charitably, though it is not compelled to obey commands. Charmed creatures have no memory of being charmed at the end of the spell; the friendship simply fades away.

The charm ends early for an individual creature if you or your companions take a hostile action against that specific creature.

**Critical Success** The creature is unaffected and is temporarily immune to Charming for 24 hours.

**Success** The creature is unaffected.

**Failure** The creature is Fascinated by you for 1 round, then treats you as a friendly acquaintance for the remaining duration. The creature is not compelled to follow orders, only to regard you well.

**Critical Failure** As failure, but the creature is also Stupefied 1 for 1 hour. It must also succeed at a Will save against a DC 5 lower than your spell DC before taking any hostile action against you; on a failure, the hostile action fails.

{{postamble
**Heightened (7th)** :: The duration increases to 24 hours.
**Heightened (9th)** :: The charmed condition becomes more profound: charmed creatures also follow non-harmful requests as though from a trusted ally. Duration becomes 1 week.
}}
}}

{{ruleBlock
{{preamble
{{title Gift of the Archmage}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane
**Cast** :: 1 minute
**Cost** :: a palm-sized chunk of unrefined Faerock ore worth at least 500 gp, which is consumed
**Range** :: touch
**Targets** :: 1 willing creature
**Duration** :: until used or next daily preparations
}}

You compress one of your own prepared or known spells of rank 4 or lower into a shimmering arcane singularity and transfer it into a willing creature. The spell must be one you have prepared (if you prepare spells) or one you know (if you have a spell repertoire); it must be rank 4 or lower. You lose access to that spell until the gift is used or the duration ends: if you prepared the spell, the slot is expended; if you know it via a repertoire, you treat yourself as having one fewer spell slot of that rank for the duration.

The recipient gains the ability to cast the gifted spell exactly once, using your spell DC and spell attack modifier. The recipient must supply any material components or costs the spell normally requires. The recipient must use the gifted spell by the end of their next daily preparations or the gift fades unused.

{{postamble
**Heightened (+1)** :: The maximum rank of spell you can gift increases by 1.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Let's Start a Fight}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Auditory}}{{trait Concentrate}}{{trait Emotion}}{{trait Incapacitation}}{{trait Linguistic}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 60 feet
**Area** :: 30-foot burst
**Defense** :: Will
**Duration** :: 1 minute
}}

You channel fate's desire for chaos into a single provocative word or gesture, directing it at a crowd or group of at least 10 creatures within the burst. Each creature in the area must attempt a Will saving throw.

**Critical Success** The creature is unaffected and recognizes the magical attempt.

**Success** The creature is briefly irritated and takes a –1 status penalty to Will saving throws against emotion effects for 1 round.

**Failure** The creature is incited to aggression. For 1 minute, it must spend at least 1 action on its turn attacking the nearest creature with an improvised weapon, such as a tankard, plate, chair, or stool, or an unarmed Strike. Affected creatures don't draw weapons. If there is no valid target, this compulsion fades harmlessly that round.

**Critical Failure** As failure, and the creature immediately uses its reaction (if available) to Stride toward the nearest creature and make a Strike against it.
}}

{{ruleBlock
{{preamble
{{title Healing Draught}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Healing}}{{trait Manipulate}}{{trait Vitality}}
}}

{{definitions
**Traditions** :: divine, occult
**Requirements** :: You have a sealed, opaque glass bottle to hold the draught
**Range** :: touch
**Targets** :: 1 bottle held in hand
**Duration** :: 10 minutes
}}

You twist luck and life-force into the bottle you hold, creating a powerful healing draught that crystallizes fate into medicine. The bottle instantly fills with a shimmering, golden healing potion. Any creature that uses an Interact action to consume the potion during the spell's duration regains 6d8+30 HP, and the draught attempts to counteract one disease or one poison affecting the drinker, using your spellcasting modifier. Once consumed, the potion is gone; if not consumed by the end of the duration, the draught fades and the bottle is returned empty.

Only one Healing Draught can exist at a time from a given caster; casting this spell again while a previous draught exists causes the previous one to immediately fade.

{{postamble
**Heightened (+1)** :: The healing increases by 1d8+8.
}}
}}

{{ruleBlock
{{preamble
{{title Sphere of Preservation}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Aura}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: self
**Area** :: 30-foot emanation
**Duration** :: sustained up to 1 minute
}}

You collapse probabilistic variance in a sphere around you. While this spell is sustained, all creatures inside the 30-foot emanation treat random rolls as if they had rolled the median value on each die, rounding down.
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Do My Bidding}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Auditory}}{{trait Concentrate}}{{trait Emotion}}{{trait Incapacitation}}{{trait Linguistic}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Cast** :: 10 minutes
**Area** :: 60-foot emanation
**Defense** :: Will
**Duration** :: 8 hours
}}

You speak passionately for 10 minutes, rallying a crowd toward a specific, clearly articulated goal. All sentient creatures that can hear and understand you within 60 feet are potential targets. Each must attempt a Will save.

**Critical Success** The creature is unaffected and knows it was targeted by a spell.

**Success** The creature is unaffected.

**Failure** The creature is compelled to pursue the stated goal for the duration, provided you personally lead them and the instructions remain consistent with the stated goal. If you cease leading or give contradictory orders, the effect ends for that creature and it becomes hostile toward you. If the goal is achieved or the duration ends naturally, the creature does not realize it was subject to a magical compulsion.

**Critical Failure** As failure, and the creature is fanatically devoted: it will take personal risk, though not suicidal action, to achieve the goal and will not question the caster's leadership. It still does not realize the source of its compulsion when the effect ends.
}}

{{ruleBlock
{{preamble
{{title Sphere of Ruin}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: 120 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: sustained up to 1 minute
}}

You summon a swirling iridescent sliver of Ruin adjacent to you, and choose a creature you can see within range as its target. When you sustain this spell, the sphere moves up to 30 feet toward its current target, or you can redirect it to a new creature you can see, which it then pursues instead; it can fly and pass through solid objects and creatures, though it cannot end its movement inside a solid object. When the sphere occupies the same space as a creature for the first time on a turn, that creature must attempt a Will save against your spell DC.

**Critical Success** The creature is unaffected and is temporarily immune to this casting for 10 minutes.

**Success** The creature is unaffected.

**Failure** Roll 1d6 on the table below and apply the effect in the Failure column.

**Critical Failure** Roll 1d6 on the table below and apply the effect in the Critical Failure column.

| 1d6 | Failure | Critical Failure |
|:---:|:---:|:---:|
| 1–3 | The creature is Stunned 1. | The creature is Stunned 2. |
| 4–5 | The creature is Confused until the start of your next turn. | The creature is Confused for 1 round and must attempt a Will save at the start of its next turn to end the confusion. |
| 6 | The creature is Slowed 1 until the start of your next turn. | The creature Strides in a random direction using its full Speed and falls Prone at the destination. |
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{ruleBlock
{{preamble
{{title Reflective Defense}} {{a}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Force}}{{trait Fortune}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: self
**Targets** :: you
**Duration** :: until the start of your next turn
}}

As luck would have it, magic bounces off you. Until the start of your next turn, you gain resistance 30 to all damage from spells and magical effects. If any single source deals damage that you reduce to 0 with this resistance, you immediately deal force damage equal to the amount reduced to the source of that damage.
}}

{{ruleBlock
{{preamble
{{title Extra Motivation}} {{aa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,uncommon Uncommon}}{{trait,unique Mercuromancy}}{{trait Concentrate}}{{trait Fortune}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: divine, occult
**Range** :: self
**Targets** :: you
}}

You bend fate for a final surge of magical energy, recovering expended spells and resources. You recover up to 3 expended spell slots of rank 5 or lower. You may immediately prepare them as if you had just completed your daily preparations for those specific slots, provided the spells were already prepared in those slots or are in your repertoire.

When you cast this spell, you can also choose to deal void damage to yourself equal to half your current Hit Points; this damage ignores resistance and immunity and cannot be reduced in any way. If you do, you additionally recover the expended uses of up to 2 class abilities that normally recharge on a daily rest, chosen from abilities you have used since your last daily preparation. You can't choose this option if it would reduce you below 1 HP.

Once you Cast this Spell, you cannot Cast it again until your next daily preparation, even if you have an available rank-9 slot.
}}

{{pageNumber,auto}}
{{footnote Chapter 6 | Mercuromancy}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 7
# Planara
___
}}

For most of its history, Færrin had no elsewhere. One sphere, one sun, one sky, and beyond them nothing at all -- no heavens to petition, no hells to fear, not so much as a rumor of a neighbor. Then the firmament cracked, and Færrin discovered that it had been living, all along, in a crowded building with the door painted shut. Planara is the school of the opened door. It reaches across the planes: tearing portals between here and elsewhere, calling extraplanar servants into harness, and hauling the raw substance of other realities into this one by the fistful. Its greatest workings swap whole swaths of terrain between worlds. Its worst tear openings into places that were sealed for excellent reasons.

The elsewheres have names now, and the names do a great deal of work. There is the luminous between-space, whose solid light -- phlogiston, in the trade -- planarists skim off and burn like lamp-oil for the gods; there is the land of fae, exporter of bubbles and worse whimsy; there is the Fetid Maw, all corrosive dark and stygian chain; there is Nowhere, whose cold does not freeze so much as *conclude*; there are the tenebrific shades of Umberii, which can be worn; and beneath and around everything there is the Slip, the vast dark in which Færrin's whole crowded horizon floats like a lantern on black water. The Church, meanwhile, claims the school's brightest corner outright: its solar magisters channel the searing light of the Godhome through the firmament's cracks, and a caster ablaze with that borrowed dawn is the closest thing to an answered prayer most congregations will ever see.

Commerce, as always, arrived before doctrine. Every courier on the continent covets one of Patishvat's folded pockets, which carry fifty Bulk of cargo in no space at all and have revolutionized both freight and smuggling, occupations the Lorandrins consider adjacent. Summoners rent out tuning-fork servants by the day. Veltharan clans have begun, very quietly, to price out what it would cost to swap a played-out mining tract for the mineral-rich version of itself next door -- a working the school files under *terrain exchange* and everyone else files under *staggering hubris*.

Which leaves the door itself, and the school's standing embarrassment: portals do not always open where they are told. Every apprentice learns the figure -- one working in a hundred, roughly, opens onto somewhere else entirely -- and every apprentice learns of the masters' portal on the floor, the one that opens straight down into the Slip and closes afterward like a conscience. Belvedere keeps instruments trained on the firmament's thin places and publishes advisories that planarists read the way sailors read storm-glass. The school's own texts are unsentimental on the subject. The door is open, they say. It was always going to be opened. The only question left is manners.

{{descriptive
##### A Field Glossary of Elsewheres
**The Slip** :: The dark between and beneath the worlds. Færrin floats in it. Do not swim.
**The between-space** :: Luminous nothing separating realities; source of phlogiston, the light that burns.
**The Fetid Maw** :: Corrosion, chains, and appetite. Its imports are effective and unlovely.
**Nowhere** :: A cold that ends things. Visitors return as statuary, when they return.
**Umberii** :: Shadow deep enough to wear. Popular with people you will not see coming.
**The land of fae** :: Whimsy with a hide like tar. Wash thoroughly after contact.
}}

<!-- ART SLOT [ch7-planara]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: a planarist holding open a door-shaped portal on a freight dock, violet-white between-space light spilling across stacked cargo, dockworkers pointedly not looking inside -->

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{wide,vol2SpellTable
##### Planara Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 1 | Patishvat's Perfect Pocket | 1 minute | Anchored extraplanar pocket carries fifty Bulk weightlessly |
| 1 | Summon Servant | {{aaa}} | Bind a minor extraplanar servant creature |
| 2 | Extraplanar Pulse | {{aa}} | Vitality bolt that sickens its target |
| 2 | Planar Shield | {{aa}} | Four charges burst fire at melee attackers |
| 3 | Glimmerdust | {{aa}} | Glittering coat negates invisibility and concealment |
| 3 | Planar Pyre | {{aa}} | Phlogiston crystals impale with fire and piercing |
| 4 | Ashen Pack | {{aaa}} | Summon three ash wolves that harry foes |
| 4 | Bending Bolt | {{aa}} | Lightning line with one chosen right-angle bend |
| 4 | Bubble Bubble | {{aa}} | Fey bubble bursts, gooping and hampering creatures |
| 4 | Darkseeker's Aura | {{aa}} | Acid vapor burns attackers or focuses into blast |
| 4 | Excavation | 1 hour | Excavate ten-foot cubes each sustained round |
| 4 | Gallows | 10 minutes | The bound dead teleport to a chosen structure |
| 4 | Instant Exit | {{aa}} | Portal teleports entrants somewhere random nearby |
| 4 | Tag | {{a}} | Hot-potato charge detonates on unlucky carriers |
| 5 | Darkseeker's Restraint | {{aa}} | Stygian chains crush and restrain a foe |
| 5 | Falling Star | {{aa}} | Phlogiston shard falls and detonates violently |
| 6 | Extraplanar Beam | {{aa}} | Line of between-planes light, vitality damage |
| 6 | Solar Fury | {{aa}} | Blaze with sunlight of the Godhome |
| 6 | Solar Rebuke | {{r}} | Reaction: solar lance sears your attacker |
| 6 | Umbral Assimilation | {{aa}} | Recurring invisibility, greater darkvision, darkness bursts |
| 7 | Grey Frost | {{aa}} | Nowhere's cold: damage, restraint, icy petrification |
| 7 | Spawn Animated Spite | {{aa}} | Void bolt leaps from target to target |
| 8 | Move the Cosmic Wheel | 10 minutes | Swap terrain bubbles between two worlds |
| 9 | Eldritch Horror | {{aaa}} | Portal drops victims into the empty Slip |
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Patishvat's Perfect Pocket}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Extradimensional}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Cast** :: 1 minute
**Cost** :: a small velvet bag (consumed)
**Range** :: self
**Targets** :: you
**Duration** :: until dispelled
}}

You fold a small pocket of extraplanar space and anchor it to your person. The pocket can hold items of 3 Bulk or less, up to a combined 50 Bulk. The pocket and its contents don't count against the Bulk you carry. You can stow or retrieve a single held or worn item as a single action, which has the manipulate trait. Living creatures cannot be placed in the pocket.

The pocket is invisible to normal senses. A creature with truesight sees it as a faint opaque orb orbiting your head. If the spell is dispelled or you die, all contents are deposited in a pile in your space or the nearest unoccupied space.

{{postamble
**Heightened (3rd)** :: The pocket can hold items of 6 Bulk or less, up to a combined 100 Bulk.
}}
}}

{{ruleBlock
{{preamble
{{title Summon Servant}} {{aaa}} {{spacer}} {{kind Spell}} {{level 1}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Manipulate}}{{trait Summon}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 30 feet
**Duration** :: sustained up to 1 minute
}}

You strike a small metal tuning fork and bind a flicker of extraplanar spirit to your service. You summon a level −1 creature to an unoccupied space within range. Replace any physical damage on the chosen stat block's Strikes with force damage to represent the spirit's incorporeal nature. The servant lacks free will and follows only orders to attack and stride.

{{postamble
**Heightened (2nd)** :: The summoned spirit can be a level 1 creature.
**Heightened (3rd)** :: Level 2 creature.
**Heightened (4th)** :: Level 3 creature.
**Heightened (5th)** :: Level 5 creature.
**Heightened (6th)** :: Level 7 creature.
**Heightened (7th)** :: Level 9 creature.
**Heightened (8th)** :: Level 11 creature.
**Heightened (9th)** :: Level 13 creature.
**Heightened (10th)** :: Level 15 creature.
}}
}}

{{ruleBlock
{{preamble
{{title Extraplanar Pulse}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Planara}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}{{trait Vitality}}
}}

{{definitions
**Traditions** :: arcane, divine, occult, primal
**Range** :: 120 feet
**Targets** :: 1 creature
**Duration** :: 1 minute
}}

You hurl a ball of pulsing violet light harvested from the space between planes. Make a ranged spell attack roll against the target. On a hit, the target takes 4d6 vitality damage. Additionally, on a hit the target must attempt a Fortitude save against your spell DC; on a failure, the planar energy saturates the target, causing it to become Sickened 1 for 1 minute. On a critical failure of the Fortitude save, the target is Sickened 2. On a critical hit with the attack roll, the Fortitude save is made at a -2 status penalty.

{{postamble
**Heightened (+1)** :: The vitality damage increases by 2d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Planar Shield}} {{aa}} {{spacer}} {{kind Spell}} {{level 2}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Fire}}{{trait Light}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, occult, primal
**Range** :: self
**Targets** :: you
**Duration** :: until expended (up to 1 hour)
}}

You condense raw phlogiston, the luminous substance between planes, onto your shield or held weapon, forming a flickering shell of planar light. The spell stores 4 charges. While this spell is active, you gain the following reaction:

**Planar Burst** {{r}} **Trigger** You are hit by a melee attack while holding the imbued shield or weapon; **Effect** You expend a charge, releasing a burst of phlogiston that scorches attackers and nearby foes: each creature within 5 feet of you, including the attacker, takes 2d6 fire damage with no save.

When all 4 charges are expended, the spell ends.

{{postamble
**Heightened (+1)** :: The damage per charge increases by 1d6.
**Heightened (5th)** :: The number of charges increases to 6.
}}
}}

{{ruleBlock
{{preamble
{{title Glimmerdust}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Light}}{{trait Manipulate}}{{trait Visual}}
}}

{{definitions
**Traditions** :: arcane, divine, occult, primal
**Range** :: self
**Area** :: 30-foot cone
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

You hurl a cloud of tiny golden shards from the luminous spaces between planes in a 30-foot cone, covering all creatures and objects in the area with a persistent glittering coat.

A creature that starts its turn in the area, or that moves into the area, must attempt a Fortitude save against the results below. Coated creatures and objects cannot benefit from the invisible condition or similar concealment tied to their visibility. They shed light equivalent to a candle and are always visible, even if they would otherwise be Undetected. Attack rolls against coated creatures and objects do not suffer the miss chance from concealment due to invisibility or magical darkness.

Additionally, when a creature is first coated, it may be dazzled or blinded:

**Critical Success** The glitter fails to coat the creature; it is completely unaffected.

**Success** The creature is coated with glitter and cannot benefit from the invisible condition or concealment from invisibility or magical darkness, but is not dazzled.

**Failure** The creature is coated and is Dazzled for 1 minute. The creature attempts a Fortitude save at the end of each turn; on a success, the Dazzled condition ends (but the coating persists).

**Critical Failure** As failure, but the creature is Blinded instead of Dazzled.
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Planar Pyre}} {{aa}} {{spacer}} {{kind Spell}} {{level 3}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Fire}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 60 feet
**Targets** :: 1 creature or object
**Defense** :: basic Reflex
}}

You call forth shards of planar crystal coated in phlogiston from the ground around a target of your choosing. Crystalline spikes erupt upward, impaling the target. The target takes 3d8 fire damage and 3d8 piercing damage on a failed basic Reflex save.

Huge or larger creatures treat the result of their saving throw one degree of success better.

The spikes crumble to dust at the start of your next turn. If the target is slain by this spell, the spikes do not fade; they remain as mundane crystalline shards.

**Critical Success** The target is unaffected.

**Success** The target takes half damage and is not restrained.

**Failure** The target takes full damage and is Restrained until the start of your next turn.

**Critical Failure** The target takes double damage and is Restrained until the start of your next turn.

{{postamble
**Heightened (+1)** :: Both the fire damage and the piercing damage each increase by 1d8.
}}
}}

{{ruleBlock
{{preamble
{{title Ashen Pack}} {{aaa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Attack}}{{trait Concentrate}}{{trait Fire}}{{trait Manipulate}}{{trait Summon}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 30 feet
**Duration** :: 1 minute
}}

With a gesture, you draw upon deep planar heat to summon three spectral flaming wolves made of living ash into unoccupied spaces within 30 feet of you. The wolves act on your initiative. Once per round as a single action, you can Command one wolf to rush to a target within 60 feet of you. That wolf makes a melee spell attack roll against the target using your spell attack modifier. On a hit, the target takes 4d6 fire damage. On a critical hit, the target takes double damage and is also knocked Prone. After attacking, the wolf immediately returns to your space.

Each wolf has AC equal to your spell DC, 1 Hit Point, and is destroyed if it takes any damage or is blocked from returning to your space after attacking. The spell ends when all three wolves are lost.

{{postamble
**Heightened (+1)** :: The fire damage of each wolf's attack increases by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Bending Bolt}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Electricity}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, primal
**Range** :: self
**Area** :: 120-foot line
**Defense** :: basic Reflex
}}

A stroke of lightning blasts out from you in a 120-foot line, 5 feet wide. Each creature in the line must attempt a basic Reflex save, taking 8d6 electricity damage.

Before rolling, you may specify a single 90-degree inflection point anywhere along the line. The line changes direction at that point, allowing you to bend the bolt around corners, through doorways, or along irregular corridors. Each segment of the line must be at least 5 feet long. The total path length cannot exceed 120 feet regardless of the number of bends.

{{postamble
**Heightened (+1)** :: You can add one additional 90-degree inflection point to the line. Each inflection point must be at least 5 feet from the previous one. The damage also increases by 2d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Bubble Bubble}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 120 feet
**Area** :: 10-foot burst
**Defense** :: Reflex
**Duration** :: varies (see below)
}}

You summon a bubble from the land of fae that floats rapidly toward a point within range and detonates. All creatures within 10 feet of the point of impact must attempt a Reflex save. Creatures hit are covered with viscous fey goop.

A creature covered in bubble goop is Clumsy 1 and takes a –10-foot penalty to its Speeds. It cannot Cast a Spell with the manipulate trait. The goop remains until the creature uses a single Interact action to make an Athletics or Acrobatics check against your spell DC to scrape it off.

**Success** The creature is unaffected.

**Failure** The creature is covered in bubble goop until it scrapes it off as described above.

**Critical Failure** As failure, and the penalty worsens to Clumsy 2.

{{postamble
**Heightened (+2)** :: You can create one additional bubble, targeting a different 10-foot burst within range. Each bubble requires its own Reflex saves from creatures in that burst.
}}
}}

{{ruleBlock
{{preamble
{{title Darkseeker's Aura}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Acid}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: self
**Targets** :: you
**Duration** :: 1 minute
}}

A swirling mist of corrosive black vapor from the plane of the Fetid Maw engulfs your body. For the duration, any creature that hits you with a melee Strike takes 2d6 acid damage.

You can spend 2 actions to focus the vapor into a single corrosive burst against one creature within melee reach. Make a melee spell attack roll against that creature. On a hit, the target takes 8d6 acid damage. This attack ends the aura immediately.

{{postamble
**Heightened (+1)** :: The aura's retaliation damage increases by 1d6, and the focused attack damage increases by 2d6.
}}
}}

{{ruleBlock
{{preamble
{{title Excavation}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Earth}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, primal
**Cast** :: 1 hour
**Range** :: 50 feet
**Duration** :: sustained up to 1 hour
}}

You excavate terrain at a rapid rate. For the duration, once per round as part of Sustaining the spell, you can excavate a cube up to 10 feet on each side of earth, sand, unworked stone, or mud within range. The removed material is returned to Quarry. You can expand an existing hole or start a new one. This spell cannot affect artificially constructed stone or masonry.

You can also use this spell to tunnel through earth. If you create a tunnel longer than 10 feet, attempt a DC 7 flat check when you finish excavating it; on a failure, the tunnel collapses. The DC increases by 1 for every 5 feet of tunnel beyond 30 feet, and a braced or structurally supported tunnel never collapses. A creature standing above a space you excavate has time to step aside; it doesn't fall in and doesn't need to attempt a save.

{{postamble
**Heightened (+1)** :: The volume you can excavate each round increases by a 5-foot cube.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Gallows}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Planara}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Cast** :: 10 minutes
**Range** :: touch
**Targets** :: 1 creature
**Duration** :: 1 year
}}

You touch a creature and bind its death to a structure within your line of sight.

For the duration, if the target dies, its body is instantly teleported to the designated structure, which must be within 500 feet when you cast the spell and must be a fixed constructed object. The body arrives bound to the structure by stout ropes.

You can only have one Gallows binding active at a time; casting it again automatically ends the previous binding.
}}

{{ruleBlock
{{preamble
{{title Instant Exit}} {{aa}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 30 feet
**Duration** :: 1 round
}}

You rip open a shimmering, door-shaped portal on a flat surface you can see within range. Any creature that deliberately Strides or Steps through the portal during the duration (including you) is instantly teleported to a random unoccupied location within 1,000 feet. The destination is determined randomly the first time any creature passes through, and all subsequent creatures that pass through during the same casting arrive at the same location.

When the first creature passes through the portal, roll a d100. On a 1, the portal malfunctions and instead leads to a random plane as determined by the GM; this outcome applies to all creatures that pass through during the casting.
}}

{{ruleBlock
{{preamble
{{title Tag}} {{a}} {{spacer}} {{kind Spell}} {{level 4}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Fire}}{{trait Manipulate}}{{trait Mental}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: self
**Targets** :: you
**Defense** :: basic Fortitude
**Duration** :: special
}}

You draw volatile interplanar energy into your body; you glow brightly. You are now the Carrier.

As a single action that has the manipulate trait, you can transfer the charge to a creature within your reach by touching it, or as a reaction when you are hit by a melee attack, you can transfer the charge to the attacker. When transferred, roll a d10; if the result is equal to or less than the current Transfer Count, the charge detonates, and the carrier must attempt a basic Fortitude save against 5d8 fire damage and 5d8 mental damage. The Transfer Count starts at 1 and increases by 1 each time the charge is transferred to a new carrier. Each creature can only transfer the charge to a creature that was not the immediately prior carrier (no tagbacks).

If the current carrier ends their turn still holding the charge, the Transfer Count increases by 3.

The spell ends when the charge detonates or after 1 minute elapses with no detonation.

{{postamble
**Heightened (+2)** :: The damage on detonation increases by 1d8 fire and 1d8 mental.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Darkseeker's Restraint}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 90 feet
**Targets** :: 1 creature
**Defense** :: Will
**Duration** :: 1 minute
}}

You summon stygian binding chains from the bleak realm of the Fetid Maw to seize a creature you can see within range, dealing 3d8 bludgeoning damage. The target must attempt a Will save. While Restrained by the chains, the target automatically fails Reflex saves against your spells.

**Critical Success** The target is unaffected and is temporarily immune to Darkseeker's Restraint for 24 hours.

**Success** The target is not restrained, but is Grabbed by the chains for 1 round. It can attempt to Escape.

**Failure** The target is Grabbed and takes full damage. While Grabbed by the chains, the target takes full damage again at the start of each of its turns. The target can attempt a new Will save at the end of each of its turns; on a success it is freed.

**Critical Failure** The target is Restrained, not Grabbed, and takes double damage immediately.

{{postamble
**Heightened (+1)** :: The initial and per-turn damage increase by 1d8.
}}
}}

{{ruleBlock
{{preamble
{{title Falling Star}} {{aa}} {{spacer}} {{kind Spell}} {{level 5}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Light}}{{trait Manipulate}}{{trait Vitality}}
}}

{{definitions
**Traditions** :: divine, primal
**Range** :: 500 feet
**Area** :: 30-foot burst
**Defense** :: basic Reflex
}}

You draw a sliver of pure, solid phlogiston from a luminous plane and let it fall to a point you can see within range. Each creature in the area must attempt a basic Reflex save against the shard's detonation, taking 11d6 vitality damage. The detonation also creates bright light in a 100-foot emanation from the point of impact until the end of your next turn; this light counts as natural sunlight for the purpose of effects that depend on it.

{{postamble
**Heightened (+1)** :: The damage increases by 2d6.
}}
}}

{{ruleBlock
{{preamble
{{title Extraplanar Beam}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Light}}{{trait Manipulate}}{{trait Vitality}}
}}

{{definitions
**Traditions** :: divine, occult, primal
**Range** :: 120 feet
**Area** :: 120-foot line
**Defense** :: basic Reflex
}}

You fire a beam of pulsing violet-white light harvested from the space between planes.

Each creature in the line takes 6d12 vitality damage.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and is Dazzled until the start of your next turn.

**Critical Failure** The creature takes double damage and is Blinded until the start of your next turn.

{{postamble
**Heightened (+1)** :: The damage increases by 1d12.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Solar Fury}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Planara}}{{trait Aura}}{{trait Concentrate}}{{trait Fire}}{{trait Light}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, divine, primal
**Range** :: self
**Area** :: 20-foot emanation
**Defense** :: basic Reflex
**Duration** :: sustained up to 1 minute
}}

You become a conduit for the searing light of the Godhome, your body blazing with such intensity that you shed bright light in a 60-foot radius and dim light for a further 60 feet; this counts as sunlight. While Solar Fury is active, you gain immunity to fire damage. Each creature that begins its turn within the 20-foot emanation takes 4d6 fire damage (basic Reflex save).

{{postamble
**Heightened (+1)** :: The fire damage increases by 1d6.
}}
}}

{{ruleBlock
{{preamble
{{title Solar Rebuke}} {{r}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Fire}}{{trait Light}}
}}

{{definitions
**Traditions** :: divine, primal
**Trigger** :: A creature within 60 feet that you can see deals damage to you.
**Range** :: 60 feet
**Targets** :: 1 creature that damaged you this turn
**Defense** :: Will
}}

You call a searing lance of solar light from a crack in the firmament to strike down your attacker with 5d10 fire damage. The target must attempt a Will save against your spell DC.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and is Dazzled until the start of your next turn.

**Critical Failure** The creature takes double damage and is Blinded until the start of your next turn.

{{postamble
**Heightened (+1)** :: The damage increases by 1d10.
}}
}}

{{ruleBlock
{{preamble
{{title Umbral Assimilation}} {{aa}} {{spacer}} {{kind Spell}} {{level 6}}
}}

{{traits
{{trait,unique Planara}}{{trait Concentrate}}{{trait Darkness}}{{trait Illusion}}{{trait Manipulate}}{{trait Shadow}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: self
**Targets** :: you
**Duration** :: 10 minutes
}}

You draw upon the tenebrific shades of Umberii, wreathing yourself in swirling umbral energy. For the duration, you gain the following benefits. At the start of each of your turns, you become Undetected by any creature that relies on sight, functioning as the invisible condition; this ends immediately if you use a hostile action. You gain darkvision with a range of 120 feet, including the ability to see through magical darkness. You gain the following action.

**Umbral Eclipse** {{aa}} (concentrate, manipulate) **Frequency** once per minute; **Effect** You create a 15-foot-radius sphere of magical darkness centered on a point you can see within 60 feet. This darkness lasts until the end of your next turn.
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Grey Frost}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Planara}}{{trait Cold}}{{trait Concentrate}}{{trait Incapacitation}}{{trait Manipulate}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: touch
**Targets** :: 1 creature
**Defense** :: Fortitude
**Duration** :: 1 minute
}}

You channel the brutal cold of Nowhere into a creature you touch. The target must attempt a Fortitude save, taking 3d8 cold damage on a failure.

**Critical Success** The creature is unaffected.

**Success** The creature takes 5d8 cold damage.

**Failure** The creature takes full damage and is afflicted with Grey Frost at stage 1.

**Critical Failure** The creature takes double damage and is afflicted with Grey Frost at stage 2.

**Grey Frost**; **Saving Throw** Fortitude against your spell DC; **Maximum Duration** 1 minute; **Stage 1** Restrained as ice encases the creature's limbs and 3d8 cold damage (1 round); **Stage 2** Petrified as the creature becomes a statue of ice (1 round); **Stage 3** the creature is permanently Petrified, frozen solid. The ice outlasts the spell and remains until the creature is gradually thawed, and it stays frozen only while the ambient temperature remains below freezing. Escaping while Restrained at Stage 1 requires an Escape check against your spell DC and shatters the ice, ending the affliction outright; otherwise the affliction ends only if the spell itself ends, except once the creature reaches Stage 3.

{{postamble
**Heightened (+1)** :: The initial damage on a failure increases by 1d8, and Stage 1's per-round cold damage increases by 1d8.
}}
}}

{{ruleBlock
{{preamble
{{title Spawn Animated Spite}} {{aa}} {{spacer}} {{kind Spell}} {{level 7}}
}}

{{traits
{{trait,unique Planara}}{{trait Attack}}{{trait Concentrate}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: arcane, divine, occult, primal
**Range** :: 120 feet
**Targets** :: 1 creature, then chaining to additional creatures
}}

You crack a demon's finger bone and hurl an abyssal bolt of void energy at a creature you can see within range. Make a spell attack roll against the target. On a hit, the bolt deals 12d6 void damage. The bolt then leaps to another creature of your choice within 30 feet of the previous target that has not already been struck by this casting; make a new spell attack roll for each subsequent target. The chain continues until you miss or no eligible target remains within 30 feet of the last target struck.

{{postamble
**Heightened (+1)** :: The initial damage increases by 2d6.
}}
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Move the Cosmic Wheel}} {{spacer}} {{kind Spell}} {{level 8}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Planara}}{{trait Concentrate}}{{trait Manipulate}}{{trait Teleportation}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Cast** :: 10 minutes
**Requirements** :: You have a music box worth at least 250 gp attuned to the destination plane
**Range** :: 120 feet
**Area** :: 30-foot burst
**Defense** :: Reflex
**Duration** :: 8 hours
}}

You wind your music box and draw a bubble of another world of existence to the spot you designate within range. The magic creates a 30-foot-radius bubble at that point: the material within the bubble on your world swaps with a corresponding piece of the attuned world. Inanimate objects are cut off at the edge; ambulatory creatures from both worlds caught inside can attempt to escape.

Creatures from your world inside the bubble when it fully manifests must attempt a Reflex save. Creatures arriving from the other world into the bubble on your world do not attempt a save; the GM determines whether they are present, which has a 10% chance.

For the duration, the boundary of the bubble is permeable: creatures and effects can move freely across it, though world-dependent effects interact according to the physics of whichever side they are on. After 8 hours, both bubbles revert automatically to their original worlds.

**Success** The creature may freely choose to remain on its current world or enter the bubble.

**Failure** The creature is transported to the other world with the bubble.

**Critical Failure** The creature is transported to the other world and is Stunned 1 from the disorientation.
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{ruleBlock
{{preamble
{{title Eldritch Horror}} {{aaa}} {{spacer}} {{kind Spell}} {{level 9}}
}}

{{traits
{{trait,unique Planara}}{{trait Attack}}{{trait Concentrate}}{{trait Extradimensional}}{{trait Incapacitation}}{{trait Manipulate}}{{trait Void}}
}}

{{definitions
**Traditions** :: arcane, occult, primal
**Range** :: 120 feet
**Area** :: 10-foot burst
**Defense** :: Reflex
**Duration** :: sustained up to 1 minute
}}

You tear open a portal to Slip on the floor or ground at a point you can see within range. The portal is a 10-foot-radius circle. Creatures standing in the portal's space when it appears must attempt a Reflex save or be pulled through immediately; on a success they leap to the nearest safe space as the portal irises open.

Four alien tendrils emerge from the portal. Each round when you Cast the Spell and once a round when you Sustain it, each tendril attempts to grab one creature within 30 feet of the portal, chosen by you; make a spell attack roll for each tendril. A hit creature is Grabbed and is dragged 10 feet toward the portal. A tendril that already has a creature Grabbed drags it into the portal instead of making a new attack.

Creatures inside the portal are in Slip, removed from the plane where the portal was cast. At the start of each of their turns inside the portal, they must attempt a Fortitude save against your spell DC, taking 8d6 void damage on a failure.

A creature inside the portal can spend a single action to attempt an Athletics check or an Escape attempt against your spell DC; on a success, it climbs free and emerges in the nearest unoccupied space beside the portal. When the spell ends, all creatures still inside reappear in the nearest unoccupied spaces to where the portal stood, alive or dead.

**Critical Success** The creature inside the portal takes no damage this round.

**Success** The creature takes half damage.

**Failure** The creature takes full damage and becomes Drained 1, or increases its Drained value by 1 if it is already Drained, to a maximum of Drained 4.

**Critical Failure** As failure, and the creature is Stunned 1.
}}

{{pageNumber,auto}}
{{footnote Chapter 7 | Planara}}

\page

{{chapter,gradient,--color:#7c4848

## Chapter 8
# Seraphic
___
}}

Every canon must end, and the Liturgy ends here, at the school that stands above the other seven the way the firmament stands above the weather. Seraphic magic is not a body of technique. It has no apprentices, no journeymen, no retail applications, no second example. It is the revision of reality itself, and it is codified in this book for the same reason cartographers mark the edge of the map: not so that you will go there, but so that you will know, with precision, where *there* begins.

The school's sole known working is the Worldweaver ritual. Sixteen casters, each commanding magic of the ninth rank, form a ring around an eight-pointed star -- one point for each school of the Liturgy -- and at the center they place a sliver of Ruin and a slice of Preservation, intertwined, the twin currencies of fate spent in a single transaction. When the casting concludes, the cosmos resets to its beginning and history runs forward again, altered: each of the sixteen may amend one event -- a person unborn, a battle reversed, an incursion turned back at its origin -- and causality is left to settle the consequences across the whole re-run of creation. When the new present arrives, only the circle remembers that anything was ever otherwise. Sixteen changes. Sixteen witnesses. Everyone else simply lives in the result, and calls it history.

The archivists of Belvedere, who are professionally incapable of leaving a question alone, note the obvious: a ritual is codified because someone composed it, and compositions are rarely left unperformed. Nothing in any chancery on Færrin records a casting of Worldweaver. The archivists further note, in the smallest hand their discipline permits, that this is exactly what the record would show either way.

{{descriptive
##### On Precedent
Asked whether the world we stand in is a first draft, the Liturgy's compilers offer only this: examine history closely and you will find no seam -- no scar where a life was excised, no echo of a battle that went the other way. That is either the reassurance of an untouched creation, or the signature of sixteen very careful hands. The Church teaches the former. The Church would.
}}

<!-- ART SLOT [ch8-seraphic]: {{imageWrapper,chapterSidebarRight {{borderImage ![](URL) {top:0px,left:-90px,height:1000px,width:562px} }} }} — suggested subject: sixteen robed casters ringing an eight-pointed chalk star, the intertwined sliver of Ruin and slice of Preservation blazing at the center, the sky above them beginning to unspool into raw light -->

{{wide,vol2SpellTable
##### Seraphic Spells
| Rank | Spell | Actions | Summary |
|:---:|:---|:---:|:---|
| 10 | Worldweaver | 1 day | Sixteen casters rewind and rewrite creation |
}}

{{pageNumber,auto}}
{{footnote Chapter 8 | Seraphic}}

\page

{{ruleBlock
{{preamble
{{title Worldweaver}} {{spacer}} {{kind Ritual}} {{level 10}}
}}

{{traits
{{trait,rare Rare}}{{trait,unique Seraphic}}{{trait Mythic}}
}}

{{definitions
**Cast** :: 1 day
**Cost** :: a sliver of Ruin and a slice of Preservation, intertwined (consumed)
**Secondary Casters** :: 15
**Primary Check** :: Arcana (legendary), Nature (legendary), Occultism (legendary), or Religion (legendary)
**Secondary Checks** :: Arcana, Nature, Occultism, or Religion (each caster uses the skill of their own tradition)
**Requirements** :: You and all 15 secondary casters must each be able to cast rank-9 spells; all spell slots of all 16 casters are expended when the ritual completes
**Range** :: unlimited
**Duration** :: permanent (rewrites history)
}}

The most profound working of magic possible, Worldweaver requires the coordinated effort of sixteen spellcasters each capable of casting rank-9 spells. The casters form a ring around an eight-pointed star drawn in alchemical chalk on a level surface in a circle 30 feet in diameter. The intertwined sliver of Ruin and slice of Preservation are placed at the center and consumed when the ritual completes.

When the casting concludes, the cosmos resets entirely. The universe rewinds to before the current creation and runs forward again in continuous progression until it reaches the present moment. During this rewinding-and-progressing, each of the sixteen casters may alter one event in history. The change must be a single discrete event, such as 'this person is never born,' 'this battle's outcome is reversed,' 'this artifact is never created,' or 'this planar incursion is turned back at its origin.' There is no limit on the scope of any one change, but each caster may make only one change, and compound consequences of all changes resolve through the natural progression of causality in the new timeline.

All sixteen casters, by virtue of having cast the ritual, retain their memories of the previous timeline. No other being retains such memories unless specifically included as one caster's single change, such as 'this person remembers the prior timeline.'

Worldweaver cannot be counteracted by any effect of rank 9 or lower. A second casting of Worldweaver itself could alter or undo the changes from a prior casting.

**Critical Success** The reset is flawless; every caster's change takes exactly as intended, and causality settles cleanly around them.

**Success** The reset proceeds, but causality compounds in ways the casters didn't foresee; the GM determines side effects consistent with the changes made.

**Failure** The cosmos resists the working. Nothing happens; the components and all expended spell slots are still consumed.

**Critical Failure** The rewind occurs, but the changes take corrupted, ironic form; each alteration is fulfilled in a way its caster would never have chosen. The GM determines the full results.
}}

{{pageNumber,auto}}
{{footnote Chapter 8 | Seraphic}}
