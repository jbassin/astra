# Fleet re-sweep flag digest — 2026-07-25 (brief v3, lanes 1–8 + verifiers V1/V2)

Store edits applied in-partition: 423 findings recorded, 108 T5 keep-justifications, **128 lane flags + 31 verifier-delta flags = 159 stakeholder decisions** across 90 spells. Full detail in lane*.findings.json / verify*.findings.json.

## Orchestrator notes (cross-cutting)

- **T10 scope question:** lanes treated T10 as planes/settings/locations only, leaving D&D monster names plain (Bulette, Beholder, Hutijin, Bore Worm). **Beholder is WotC Product Identity (not in any SRD)** — publishing it in LotI2 on codex is a real IP exposure independent of the in-universe obfuscation conceit. Recommend ruling: monster names get the <name|alias> treatment too (or at minimum Beholder does).
- Alias pairs proposed: <Gehenna|…> ×2 (darkseeker pair), <Carceri|the Umbral Deep>, <Grey Waste|…>, <Far Realms|…> ×2, <Plane of Earth|…> ×2, <Elysium|…>, <Feywild|land of fae> (already in store).
- **Mass Fluency routing flip** comparables→ledger: a T2 deletion removed a spuriously-promoted @UUID Hidden ref — documented lens artifact, honest improvement, dice untouched.
- 9 lane flag-quotes no longer match post-edit text (overlapping applied edits clipped their spans) — concerns still live, quoted text stale; resolve from current store text when dealing cards.
- Structural gaps recorded by lanes (pre-existing, NOT repaired): heightening prose without structural fields on compressive-weapon, containment-orbs, djura-s-divine-razor, force-drumfire, grosteque-selfshape, excavation, swap, mass-fluency (adapter-known), let-s-start-a-fight (min-group-size not schema-representable).
- djura-s-righteous-pressure heightening.levels[6].damage reads 2d6 (same as base) vs body "increases by 2d6" — field type unconsumed by the scorer, needs a look.


## T6 — Translation divergences (dropped, invented, or substituted mechanics) (100)

- **chrysalis**: [verifier] invented flavor with no counterpart in the original prose
- **compression**: [verifier] invented duration: the 5e original's initial cast is 1 action (only REVERTING took 1 minute); this also contradicts the store's own 2-action cast time field
- **compression**: original fully incapacitates during reversion (no actions, no movement); store only blocks Stride and applies Slowed 1 — flattened mechanic, verify intentional.
- **compressive-weapon**: the 5e original grants advantage on your next two attack rolls only; store invented an entirely different mechanic (extended-reach Strikes for the whole duration) — too large a divergence for a translation-only fix, needs stakeholder review.
- **cone-of-decay**: the 5e original deals NO direct damage to living creatures (only gear destruction on a failed Con save); undead alone took Constitution drain. Store invented direct void damage to all creatures and replaced the undead Con-drain with flat bonus damage — verify intentional.
- **cone-of-silence**: the 5e original has no save at all — any creature/object in the cone is automatically deafened and thunder-immune. Store invented a full 4-degree save structure; verify intentional (not a required PF2e translation since auto-effects without saves are common).
- **copy**: entirely invented detection mechanic not present in the 5e original; verify intentional.
- **darkseeker-s-aura**: [verifier] invented flavor beyond the original's plain 'a hit... ends this spell'
- **darkseeker-s-aura**: the 5e original also grants the caster resistance to acid damage — omitted entirely here (flattened design).
- **dead-ringer**: invented illustrative examples not in the original, which ties the illusion strictly to 'whatever ailment you avoided' without listing generic examples.
- **deja-vu**: [verifier] original's trigger is specifically a creature 'being the target of an attack' — adding 'or effect' widens the trigger scope beyond the source
- **deja-vu**: original also forces the target to re-attempt (with disadvantage) any saving throw it succeeded against the original triggering attack, imposing the original effects on a new failure — this staged mechanic is entirely dropped in the store version.
- **distorted-mark**: [verifier] original just says 'the space around the target is slightly distorted' — 'destabilized spatial resonance' is invented jargon
- **distorted-mark**: the 5e original triggers on being hit by ANY attack (not melee-specific); store narrows the decompression trigger to melee Strikes only — verify intentional.
- **djura-s-divine-protection**: [verifier] original just says the air becomes 'solid' — 'density of tempered steel' is an invented specific simile
- **djura-s-divine-razor**: [verifier] invented flavor beyond the original's plain 'regardless of distance or obstacles'
- **djura-s-divine-razor**: [verifier] original's bonus applies only to 'the first time you hit... during this turn' — the store widens the window to any hit before the spell ends, a scope change
- **djura-s-divine-razor**: [verifier] original's curse has no escape mechanism at all (ends only when the spell ends) — this repeated-save escape clause is invented, and doesn't follow T3's one-sentence counteract-check convention for curse removal either
- **djura-s-divine-razor**: invented mechanic not present in the 5e original, which doesn't limit the curse to one creature or describe transfer behavior; verify intentional.
- **djura-s-divine-razor**: the 5e original allows attacking 'regardless of distance or obstacles' (unlimited range); store caps this at 60 feet — verify intentional.
- **do-my-bidding**: original: 'the spell ends and the crowd becomes hostile toward you' on the same trigger — the hostility consequence is dropped
- **eldritch-horror**: original restricts this escape attempt to 'at the end of their turn'; that timing restriction is dropped
- **elemental-sink**: original's higher-level text scaled Sustain duration (8hr/24hr) by slot, not damage; the store replaced that axis entirely with damage scaling — a necessary system adaptation but a genuine mechanic substitution worth stakeholder awareness
- **erase**: [verifier] original's plainer 'appears to have never been written on' — 'virgin' is an unnecessary register punch-up
- **extraplanar-beam**: [verifier] original's plainer 'You fire a beam of pulsing violet light harvested from the space between planes' — 'conduit'/'interplanar void' is an invented register punch-up
- **extraplanar-beam**: original blinds on any failed save for a full minute with a recurring Con-save recovery check; the store shrinks this to Dazzled/Blinded lasting only until the caster's next turn — a significant flattening
- **extraplanar-pulse**: [verifier] invented complexity with no counterpart in the original, which has a plain repeated-save recovery and no attack-crit interaction
- **farsight**: [verifier] original also describes the circle's physical form ('a flat design of a geometric shape with a 5-foot radius') and the sigil's size/behavior ('reappears when you are scrying through it... no more than an inch in diameter') — those descriptive/mechanical details are dropped
- **fast-forward**: original's curse also halves weapon-attack damage; that penalty axis has no equivalent anywhere in the store text and is dropped entirely
- **flashback**: original makes observers fully deaf and blind; the store downgrades this to Dazzled, a much lighter cost for the same shared-sense benefit
- **fluid-form**: [verifier] original explicitly transforms 'yourself and all items you are carrying' into liquid — the store's opening sentence drops the carried-items clause entirely, leaving gear's fate unstated
- **fluid-form**: original's two-branch mechanic (container shatters, or you're stuck in fluid form until released) is replaced entirely by an auto-expel/Slowed mechanic — a wholesale substitution, not a translation
- **focus-break**: [verifier] the store carries no Heightened block at all; the original's entire higher-level design ('DC increases by 1 per spell slot level above 5th') was dropped without translation, unlike every other spell in this set which preserves a heighten idiom
- **focus-break**: original's concentration spell only ever ended the sustained effect on a failed save — no Stunned/lockout penalty; the escalating Stunned tiers are invented content beyond translation, stakeholder call
- **forceful-onslaught**: original let the target keep fighting indefinitely at 0 HP until 3 failed death saves; store flattened this into a 1-round delay of unconsciousness — significant simplification of the staged/escalating original design
- **fugue**: original states 'a successful save negates the spell' entirely (full negation); store instead gives a partial Confused effect on Success — deviates from the original's binary pass/fail, stakeholder call
- **gallows**: heavily embellished vs the original's spare two-sentence description ('linked to a structure... teleported... bound by stout ropes'); consider restoring closer to source phrasing
- **gift-of-the-archmage**: original had a cancel-early option (caster suffers exhaustion to reclaim the spell), used the recipient's Intelligence modifier, and capped one gift per spell-slot-level; store dropped the cancel-early mechanic and the stone/sigil flavor entirely — flattened translation, stakeholder call on whether to restore
- **glimmerdust**: contradicts the degree-of-success table below (Critical Success says 'the glitter fails to coat the creature') — this sentence states unconditional coating while the table implies coating is Fortitude-save-gated; internal inconsistency introduced during translation, needs stakeholder clarification
- **grey-frost**: [verifier] invented flavor clause with no counterpart in the original, which only says the caster 'manifests the brutal cold of the Grey Waste in a creature you touch'
- **grey-frost**: [verifier] the original's progression is a repeated Con save each turn (one fail = instant petrification, three non-consecutive successes = spell ends) with the creature still saving even while petrified unless concentration is held the full minute; the store replaces this with a standard PF2e affliction stage-ladder (Escape-based stage 1, automatic stage 2→3 progression) that drops the original's asymmetric save-to-freeze/save-to-escape design entirely
- **haunt**: original grants unconditional, always-exact location awareness ('You always know where the creature is'); store weakens this to approximate-beyond-500-feet — a mechanic flattening/nerf vs the source, stakeholder call
- **healing-draught**: original bottle held 3 doses (affecting 3 creatures) and each heightened slot level added another dose; store version is single-dose-only with heightening only scaling the healing amount — significant flattening of the multi-dose design, stakeholder call
- **hellforging**: original allowed repeated in-casting retries (maintain the spell, re-rolling the save each turn, taking damage per failure) before the core shatters; store collapsed this into a single check with a plain retry-later option — flattened the original's multi-turn escalation into a single roll (a reasonable ritual idiom, but a mechanic deviation from source), stakeholder call. Damage-type translation (psychic/necrotic → mental/void) is correct Remaster vocabulary, not flagged.
- **hypercompression**: original also had unsecured objects fully within the area pulled into the orb; that half of the design is dropped entirely, not just this destruction clause.
- **hypercompression**: original had a two-tier escalating movement penalty (4 ft of movement per 1 ft within 10 ft, 2 ft per 1 ft within 30 ft); store flattened this to a single difficult-terrain band at 30 ft only.
- **illusory-illusion**: original granted the re-save via EITHER careful examination OR taking damage; store kept only the damage trigger and dropped the examination trigger.
- **incensed-bestial-rage**: original's design gave advantage on your own melee attacks in exchange for enemies also getting advantage against you; store dropped the offensive-advantage half entirely and substituted unrelated benefits (temp HP, Athletics) that aren't in the original at all.
- **inquisition**: original's secondary resistance save was rolled with disadvantage (harder to succeed, i.e. more likely to spill the secret); store flattened it to a neutral same-DC reroll, softening the original's escalating design.
- **jolt**: original granted EACH target both an attack and a 10-foot move automatically; store's base version only grants one or the other, reserving 'both' for the +9th heightened tier — a flattening of the base design into an upgrade path that wasn't in the original.
- **kosmoturgist-s-armor**: original specified 'one willing creature'; store's body prose drops the willing qualifier (the structural target field still says '1 willing creature', so this is a prose-only fidelity gap, not a mechanics change).
- **laixa-s-expert-intuition**: entire paragraph is invented content with no counterpart in the original, which was a single sentence ('you can replace the number you roll with a 15').
- **laixa-s-historical-tracker**: original's higher-level text only added revealed information (race, then name) with no duration scaling at all; the per-tier duration escalation (10 min to 1 hr to 8 hr) is a store invention not present in the original.
- **legend-killer**: voice check on a deliberately-redesigned spell (the mythic-vs-legendary-actions mechanics are an intentional PF2e-native redesign, not restored): the original's plain register ('You slow down the flow of time around a legendary creature, robbing it of the speed necessary to perform legendary actions') was replaced with more ornate, punched-up phrasing.
- **lucky-ward**: [verifier] original grants allies a bonus to BOTH attack rolls and saving throws (automatic, no save); store drops the saving-throw bonus for allies entirely, keeping only the attack-roll bonus
- **lucky-ward**: [verifier] original imposes an automatic (no-save) penalty to both attack rolls and saving throws on every enemy in the aura; store converts this into a resistible Will save that, on a mere failure, only penalizes attack rolls (saves are only penalized on critical failure) and allows full resistance/temporary immunity — a substantial restructuring beyond vocabulary translation
- **mark-of-protection**: the 5e original allowed marking multiple creatures simultaneously by expending an additional spell slot per target; the store flattened this to single-target-only baseline (with heightened tiers unlocking more) — a mechanical simplification of the original's design, not just a text issue, so flagging for stakeholder rather than unilaterally restoring multi-slot-casting.
- **mass-fluency**: embellished beyond the original's plain 'You grant up to four willing creatures the ability to understand any language they read or hear' — the touch-per-target mechanic is a necessary PF2e translation, but 'memetic language-matrix' is invented flavor; flagging since the school-flavor framing may be intentional across this book's memetics spells.
- **mental-balance**: embellished flavor addition not in the original's plain 'You temporarily remove all of a creature's emotional attachments or biases.'
- **mental-balance**: embellished rewrite of the original's plainer 'must follow the spirit and letter of the law, and the subject is incapable of showing favoritism.'
- **mental-balance**: invented content with no counterpart in the 5e original; flagging as a substantive addition beyond translation.
- **mental-balance**: invented mechanic not present in the 5e original at all, materially expanding the spell's power; flagging rather than unilaterally cutting since it may be a deliberate balance addition from an earlier round.
- **monstrous-copy-eye-stalks**: the 5e original was a d10/10-option table including a Paralyzing Ray and a Death Ray; the store dropped both, reducing to a d8/8-option table — a flattened/simplified design, flagging per the T6 doctrine on dropped staged mechanics.
- **monstrous-copy-shell**: the 5e original's Tarrasque-carapace spell only ever had the magic-deflection mechanic; the store invented two entirely new defensive benefits (AC bonus, physical resistance) with no counterpart in the original, substantially expanding the spell's scope. Flagging rather than cutting since these may be a deliberate earlier-round balance addition to give the spell baseline value at 9th rank.
- **monstrous-copy-tentacle**: the 5e original had two additional staged mechanics dropped entirely in translation: 'While you are grappling a creature with this whip, you can't use it to make attacks at other creatures' and 'If the target is Medium or smaller, it is also restrained until the grapple ends' — both are flattened/simplified out of the store version with no replacement.
- **move-the-cosmic-wheel**: minor: the original qualified the plane as one 'with which you are familiar, either through personal experience or intense study' — dropped in the store version. Low stakes but noted for completeness.
- **move-the-cosmic-wheel**: the 5e original had a staged edge-case dropped entirely: living creatures that don't fit inside the bubble are shunted outside of it before the swap occurs. The store's version has no equivalent for creatures that don't fit.
- **move-the-cosmic-wheel**: the original had a specific mechanic here (energy such as necrotic leaks across the boundary at no more than a foot or two per hour) that got generalized away into vague 'physics of whichever side' language — a flattened mechanic, not just a dropped worked example.
- **mystic-negation**: invented escalation axis (counteract radius growing 30→40→60 ft) with no counterpart in the 5e original, which only ever scaled the max negated spell rank. This is a substantive mechanical addition, not a text/prose issue, so flagging for a balance call rather than unilaterally deleting granted power. Note: the '3-counter burnout governor' clause elsewhere in the body is confirmed-deliberate settled design per brief and was not touched.
- **oblivion**: [verifier] original guarantees chosen creatures automatically succeed (full immunity); store only guarantees a one-step improvement, which can still leave a weak roll at mere 'success' (half damage) rather than immunity
- **overhaul**: the 5e original had an elaborate d100 ancestry table (19 weighted 5e race options) plus a Charisma (Persuasion) check to influence the result; the store dropped the entire table and the influence-check mechanic, replacing them with an abstracted 'setting ancestries' + degree-of-success system. Likely a necessary adaptation (the original's named 5e races don't map to this homebrew PF2e setting), but flagging per the T6 doctrine on dropped staged/tabular design for stakeholder visibility.
- **planar-pyre**: original's higher-level clause let the caster CHOOSE only one damage type (fire or piercing) to increase per slot level; store flattened this to both types always increasing. Design divergence — verify intentional.
- **reduce-resistivity**: wholly new resistance-reduction mechanic invented beyond the original, which only granted disadvantage on saves against magic — no resistance interaction at all. Verify intentional; also extended in the Critical Failure line ('all of the creature's resistances to damage are reduced by 5').
- **reflective-defense**: original grants full negation ('the damage is reduced to 0') with no cap; store capped it to Resistance 30 — a design simplification from absolute immunity to a bounded resistance. Verify intentional.
- **repetitious-trauma**: original had staged damage — 6d6 on the initial cast, 4d6 on each subsequent bonus-action re-save; store flattened this to a uniform 8d6 every round (with the base-cast/re-save mechanic itself correctly translated to PF2e's Sustain idiom). Verify the uniform-damage flattening is intentional.
- **reposition**: original's higher-level clause scaled additional TARGETS (1 per slot above 1st); store's heightening scales DISTANCE instead — a different scaling axis than the original. Verify intentional.
- **reset**: original's ally benefit was reroll TWICE and keep the better of the two new results (no save needed); store changed this to a single reroll compared against the creature's current value. Verify intentional simplification.
- **retributive-force**: original required only ONE save, at the moment of your own first retributive Strike; failing that single save then made every subsequent melee attack against you trigger the automatic launch for the rest of the duration. Store changed this to a fresh save required every time you're struck — a different design shape than the original's one-time gate. Verify intentional.
- **retributive-force**: original's higher-level scaling is 1d6 per slot level (matching the base die); store's increment is 1d4, a mismatched die size. Verify intentional.
- **revisit**: original's base spell allowed any location visited within the last HOUR; store nerfed the base window to 10 minutes and gated the original's full 1-hour range behind the 7th-rank Heightened tier. Verify this scope change is intentional.
- **right-hand-of-judgment**: original let you upgrade a successful hit into a critical hit outright; store substituted a weaker fortune-reroll-on-damage effect — a mechanic redesign beyond translation
- **right-hand-of-judgment**: original's charge trigger was taking the Dodge action (a proactive player choice); store substituted a reactive trigger off enemy misses — a substantive mechanic redesign, not a simple translation; needs stakeholder confirmation this was intentional
- **sapping-lightning**: [verifier] original mechanic is a PERMANENT loss of the creature's highest-level spell slot; store softens this to a temporary suppression that recovers by the end of the creature's next turn (per the Failure line) — a substantial severity change, not just vocabulary translation
- **sapping-lightning**: original permanently destroyed the creature's spell slot (lost until otherwise recovered); store's version only suppresses it until the end of the creature's next turn, a much softer effect — flag whether this severity drop was intended
- **shape-modify-armor**: original was flat ('increase the protection... decrease its speed'); store added invented imagery ('thick, rigid plates') beyond simple translation
- **shape-modify-severity**: original was flat ('increase the sharpness of your claws... blunt your senses'); store invented embellished imagery ('vicious, almost painful keenness') beyond translation
- **shape-modify-speed**: original was flat ('increase the speed... decrease its padding'); store invented imagery ('elongate and lighten the limbs', 'explosive mobility') beyond translation
- **spawn-abyssal-sprite**: original summons an actual sprite creature that attacks ('You summon an angry sprite from the depths of the Abyss to attack one creature'); store replaced the summon-and-attack conceit with a direct bolt-spell — the spell's own name 'Spawn Abyssal Sprite' no longer matches its mechanic
- **suspension**: original also specified that destroyed vines are immediately replaced with more vines — that durability clause is missing from the store version
- **suspension**: original guaranteed a harmless landing when the spell ends naturally ('the vines will harmlessly lower you to the ground'); store's version has no equivalent for natural expiration while airborne, only sudden departure past 30 ft
- **tag**: [verifier] original says 'glowing brightly'; store both reverses the intensity and adds ornamentation not present in the source
- **tag**: original forces an immediate self-directed roll (with +30% detonation chance) when you hold it a full round; store only bumps a counter for a future transfer with no immediate roll — the self-risk-if-you-sit-on-it design is altered
- **tag**: original has THREE delivery methods (transfer via your own successful melee attack, as an action, as a reaction when hit); store keeps only two, dropping the own-attack delivery mode
- **time-loop**: original teleports the target back to its prior-turn space UNCONDITIONALLY, with the save only gating the replay-compulsion; store makes the teleport itself conditional on failing the save — a structural change from the original's design (the immunity clause itself is separately settled per project note)
- **time-step**: [verifier] minor invented flavor turn of phrase; the original just says you disappear and reappear, with no 'tick of the clock' framing
- **time-step**: [verifier] original states only two protections (unaffected by events during the interval, unaware of them); store expands this into four enumerated clauses, including new claims (untargetable, undetectable) absent from the source — list-ification plus invented scope
- **touch-of-madness**: original deals 4d6 psychic damage unconditionally (regardless of save outcome) in addition to the Wisdom-save mind-break effect; the store conversion has no damage component at all (system.damage is empty) — a dropped mechanical layer
- **wall-of-time**: original specifies concrete wall dimensions and a straight-vs-circular shape choice (60 ft long/20 ft high/1 ft thick straight wall, or 20 ft diameter circular wall); the store version has no size/shape specification at all (structural area is also null) — a dropped mechanical component, confirmed by the file's own adapterWarnings fossil text naming the original dimensions
- **wall-of-time**: original's base mechanic (rank 5) imposes a slow-spell-equivalent effect on any creature that crosses, unconditionally; store invents a new action-tax/difficult-terrain mechanic for the base rank and defers the original's slow-equivalent effect entirely to the Heightened(7th) tier — a significant restructuring of the escalation design
- **weight-of-the-world**: original also inflicts a level of exhaustion specifically if the affected creature uses the Dash action — an escalating conditional penalty entirely absent from the store conversion

## T5 — Heightening: suspect tiers / collapse candidates / structural gaps (26)

- **compression**: [verifier] loosens a time limit — matches the brief's struck 'tiers relaxing a time limit' anti-pattern; candidate for removal
- **connection**: suspect: loosens duration and reduces the planar-miss chance — a limit-loosening tier matching the brief's flag-candidate bloat pattern.
- **connection**: suspect: pure cap increase (3→8) with no new capability — limit-loosening bloat pattern the brief calls out as a strike candidate.
- **djura-s-divine-protection**: ambiguous which resistance (physical bludgeoning/piercing/slashing, force, or both) this scales; also system.heightening is null despite this prose tier — needs clarification before it's a safe keep.
- **earworm**: pure duration+range extension (until next daily prep; range to 30 ft) with no new effect — matches the brief's struck 'relaxing a limit' bloat pattern, flag for stakeholder call
- **ebb-and-flow**: pure numeric bump (speed bonus +10, radius +10) with no new effect — suspect bloat, flag for stakeholder call
- **elemental-sink**: structural heightening.damage delta was '1d4', mismatched with this text's '3d4'; corrected the structural field to 3d4 to match the stated text (no text change)
- **farsight**: mixed tier: the '+1 sigil' portion matches the brief's struck limit-extension bloat pattern, while the free-action switch is a genuinely different effect — flag for stakeholder call rather than unilaterally splitting/collapsing
- **flashback**: four fixed tiers are almost purely a time-window ladder (1wk/1mo/1yr/any-time) matching the brief's struck 'relaxing a time limit' bloat pattern; the 3rd tier bundles a genuinely different whisper ability, complicating a clean collapse — flag for stakeholder call
- **gift-of-the-archmage**: two fixed tiers (7th/9th) apply the identical +2-to-max-rank operation — classic collapsible ladder; candidate for a single 'Heightened (+2)' flat line, flagged per T5's bespoke-tier-block guidance
- **lucky-ward**: pure numeric ladder (+1 base, then +2 at 6th, +3 at 9th, penalty mirroring) split across two fixed tiers with an irregular rank interval (base 2nd, +4 ranks to 6th, +3 more to 9th) — a strike candidate for collapsing into a flat (+N) idiom, but the irregular interval means a clean collapse would move the rank thresholds; stakeholder call rather than a mechanical text edit.
- **mental-balance**: the 6th-rank tier bundles a numeric micro-upgrade (+1 more status bonus, +Perception) with a limit-loosening clause — the loosening-a-restriction pattern was repeatedly struck as bloat elsewhere; flagging as a suspect tier rather than unilaterally cutting.
- **monstrous-copy-claws**: the 8th-rank tier is a pure numeric-only step (unlike the flanking 7th/9th tiers, which each also grant a distinct burrow-speed benefit) — a suspect bloat filler between two genuinely-different-effect tiers; flagging rather than collapsing since the die-type progression (2d12→3d10→3d12→4d12) doesn't reduce cleanly to a flat (+N) increment.
- **monstrous-copy-eye-stalks**: the 5e original's higher-level text was a clean linear '+1 ray per slot level above 7th' — exactly the flat (+N) idiom. The store instead fixed this into 8th/9th tiers AND bolted on an invented 'ray damage increases by 2d10' escalation not present in the original at all. Flagging both the non-idiomatic fixed-tier conversion (T5) and the invented damage-scaling axis (T6) together since untangling them safely needs a balance call.
- **monstrous-copy-tail**: two fixed tiers (8th: 3d12, 9th: 4d10) are a pure numeric-only ladder with no bundled qualitative change, matching the same non-idiomatic pattern as monstrous-copy-claws/tentacle; flagging rather than collapsing since the die-type alternation (3d10→3d12→4d10) doesn't reduce cleanly to a flat (+N) increment.
- **monstrous-copy-tentacle**: four fixed tiers (6th-9th) are a pure numeric-only damage ladder with no qualitative differences, the sibling spells' worst offender of this pattern (2d8→2d10→3d8→3d10→4d8); flagging rather than collapsing since the alternating die-type/count progression doesn't reduce cleanly to one flat (+N) increment.
- **mystic-negation**: the 5e original's higher-level text was a clean linear '+1 max negated rank per slot level above 5th' — the flat (+N) idiom. The store instead fixed this into 7th/9th tiers; flagging the non-idiomatic conversion alongside the T6 finding below since they're the same span.
- **planar-shield**: suspect bloat tier — matches the struck exemplar pattern of 'a tier extending a cap' (charge count is a numeric limit, not a qualitatively new effect); original's higher-level text only scaled damage, never charge count.
- **shape-modify-accuracy**: suspect tier block: the attack bonus scales +2/+3/+4 at ranks 3/5/7 (a clean +1-per-2-ranks interval) but the damage-penalty reduction (2d6→1d6) only shifts at the top tier, breaking a clean collapse — recommend stakeholder decide whether to collapse the bonus to an interval line and keep the damage-penalty change as a separate bespoke note, or leave both fixed
- **shape-modify-armor**: suspect tier block: the AC bonus scales cleanly (+2/+3/+4) but the Speed penalty changes mechanic type between tiers (base tier sets Speed to a flat 15 ft; higher tiers instead reduce Speed by a shrinking amount) — an inconsistent design pattern, flag for stakeholder
- **shape-modify-severity**: collapse candidate: damage bonus (2d6/3d6/4d6) and attack penalty (-2/-1/0) both scale by a clean flat amount every +2 ranks (3→5→7) — recommend collapsing to a single Heightened (+2) line per the Diamond Dust idiom instead of two fixed tiers
- **shape-modify-speed**: collapse candidate: Speed bonus (20/30/40 ft) and AC penalty (-2/-1/0) both scale by a clean flat amount every +2 ranks — recommend collapsing to a single Heightened (+2) line instead of two fixed tiers
- **temporal-discharge**: a duration-extending-to-a-cap clause riding on the damage (+N) line — matches the brief's flagged bloat pattern (tiers merely loosening a duration limit); candidate to strike, leaving Heightened (+1) as a pure damage bump
- **temporal-threshold**: extends/loosens a status-duration limit each rank riding on the damage (+N) line — matches the flagged bloat pattern; candidate to strike, leaving the tier as a pure damage bump
- **umbral-assimilation**: extends/loosens the darkness-persistence duration at a higher rank — matches the brief's flagged bloat pattern (tiers merely relaxing a time limit); candidate to strike or fold into base text
- **wall-of-time**: this tier reintroduces the original's base-rank slow-on-cross mechanic as a rank-7-only add-on; see the linked T6 finding — whether this stays a heightened tier depends on resolving the base-mechanic substitution

## T10 — Obfuscated proper nouns (alias pairs needed) (10)

- **darkseeker-s-aura**: Gehenna is D&D-cosmology proper noun; suggested in-world alias 'the Bleak Waste' (consistent with darkseeker-s-restraint's occurrence).
- **darkseeker-s-aura**: [verifier] Gehenna is a named D&D outer plane (from the original 5e text too) — needs a <Gehenna|alias> pair, e.g. <Gehenna|a plane of ceaseless corrosive torment>
- **darkseeker-s-restraint**: D&D-cosmology proper noun; suggested in-world alias 'the Bleak Waste' (consistent across the darkseeker spells).
- **eldritch-horror**: D&D-cosmology plane name; suggest <Far Realms|the Roiling Beyond>
- **eldritch-horror**: same D&D-cosmology plane name, second occurrence; suggest <Far Realms|the Roiling Beyond>
- **excavation**: D&D-cosmology plane name; suggest <Plane of Earth|the Deep Below>
- **excavation**: same D&D-cosmology plane name, second occurrence; suggest <Plane of Earth|the Deep Below>
- **grey-frost**: D&D-cosmology proper noun (the Grey Waste of Hades) appears plainly; suggest an in-world alias per the author's obfuscation conceit
- **solar-rebuke**: Elysium is a D&D-cosmology plane name; suggest <Elysium|the solar plane> to match solar-fury's own already-established paraphrase
- **umbral-assimilation**: named D&D outer plane (the Tarterian Depths of Carceri) appearing plainly; suggest <Carceri|the Umbral Deep, a nameless plane of shadow>

## T8 — 5e-residue condition mappings needing a call (7)

- **compression**: 'concentration' is 5e mechanic vocabulary that could be misread against PF2e's Sustain/concentrate trait; consider rewording (e.g. 'sustained effort').
- **cone-of-decay**: [verifier] original's undead penalty is a permanent Constitution-score loss (ability drain), which is exactly what PF2e's Drained condition models; converting it to flat bonus damage instead is a judgment call worth flagging rather than freelancing
- **fast-forward**: original also disadvantages Constitution-based checks/saves; per the brief's own mapping (Con-based → Drained) that should appear at base rank, but Drained is only added at Heightened(8th), leaving a gap at the base rank
- **fumble**: ad-hoc Dex-based penalty; T8's exemplar maps Dex-based rolls to Clumsy — this bespoke Reflex-only penalty should likely just be a Clumsy value instead
- **fumble**: heightened tier layers a separate Clumsy 1 on top of the ad-hoc Reflex penalty — same status-penalty type, doesn't stack, so the addition is partly redundant with the -3 Reflex penalty; consolidate onto Clumsy
- **gravity-anvil**: ad-hoc 'can't act' state closely matches the Paralyzed condition; consider a condition tag instead of bespoke text (flagged beyond T8's named exemplars per its own instruction)
- **weight-of-the-world**: original imposes disadvantage on both Strength- and Dexterity-based checks (plus attack rolls); store only captures Strength-based skill checks + attack rolls, dropping the Dexterity-based component — mapping to Enfeebled/Clumsy needs a stakeholder call rather than freelancing

## T2 — Defensive sentences (possibly load-bearing overrides) (5)

- **compressive-weapon**: possibly restates the general line-of-effect requirement for Strikes; the 'spatial shortcut' flavor may justify the clarification — stakeholder call.
- **flutterstep**: [verifier] restates the default 1-reaction-per-round rule; rank 7's 'twice per round' already carries the actual override, so the base line is a redundant restatement of a rules default
- **incensed-bestial-rage**: reads as defensive fencing around a Sustain-action interaction not in the original; could instead be a genuine override if the base polymorph normally allows Sustain-shifting — stakeholder call, not struck outright.
- **monstrous-copy-shell**: [verifier] possibly redundant with the default 1-reaction-per-round economy (as with flutterstep's 'once per round' line), though stat-block Frequency fields are also common official idiom — flagging for judgment
- **monstrous-copy-shell**: the first and third trigger clauses appear to duplicate the same condition (a ranged spell attack roll targeting you); looks like a leftover from translating the original's 'magic missile spell' trigger. Flagging for stakeholder disambiguation rather than guessing which clause to cut.

## T4 — Over-explanation judgment calls (3)

- **chrysalis**: four-part enumeration over-explains what 'completely cut off from external stimuli' already implies; original just says cut off from outside stimuli.
- **cone-of-silence**: largely re-derives paragraph 1's 'no sound can enter, exit, or propagate through the area' in creature-specific terms — possible over-explanation, but the auditory-action restriction may be mechanically load-bearing; stakeholder call.
- **lucky-ward**: [verifier] self-evident from 'each enemy...must attempt a Will save' — restates that each creature rolls its own save

## T1 — Explaining parentheticals (kept as load-bearing — promote-or-keep calls) (4)

- **grey-frost**: load-bearing exception clause left parenthetical in the Maximum Duration field; should be promoted to plain prose, but the affliction stat-block format is tight — stakeholder call on exact phrasing
- **grey-frost**: the Escape DC part is legitimate official affliction idiom, but 'successfully Escaping shatters the ice and ends the affliction' is load-bearing effect description bundled into the same parenthetical — should be promoted out, needs care given the tight affliction-block format
- **hypercompression**: [verifier] borderline worked-example parenthetical; could be promoted to plain prose ('...at the start of each of your turns as a free action when you Sustain the spell')
- **suspension**: edge-case parenthetical not in the original; unclear how casting occurs while unconscious — needs stakeholder clarification rather than a blind edit

## T3 — Official name-drop phrasing (2)

- **shape-modify-armor**: official PF2e feat name-drop used as a mechanical example; the clause is also logically odd (Dash has no Speed minimum) — recommend stakeholder review rather than a silent rewrite
- **touch-of-madness**: comparison-style condition reference ('as the X condition') rather than applying/tagging the condition directly or stating the mechanic plainly; flag rather than freelance the exact confusion-condition mapping

## T9 — Structure: table conversions (2)

- **sphere-of-ruin**: run-on d6-outcome prose should become a named table per T9, with the Critical Failure line referring to it instead of spelling out the roll inline
- **sphere-of-ruin**: run-on d6-outcome prose should become a named table per T9, with the Failure line referring to it instead of spelling out the roll inline

## Appendix — T5 keep record (informational, no decision needed)

- chrysalis: keep: fixed tier adds a qualitative effect (imperceptibility+detection DC), not a pure numeric ladder.
- compression: keep: two fixed heightened tiers (5th/7th) each add qualitatively distinct effects (locked-door passage, 1-act
- compressive-weapon: keep: already idiomatic single (+1) flat-increment line; base range (30 ft) stays stated in the 'spell ends' s
- cone-of-decay: keep: idiomatic single (+1d10) flat increment matching structural heightening; base (8d10) stated in body.
- cone-of-silence: keep: fixed tier changes the qualitative nature of a successful save (only Deafened-immunity, not silence-immu
- connection: keep: introduces a genuinely new capability (group communication), not a pure ladder.
- containment-orbs: keep: idiomatic single (+1 orb) flat increment. Note: system.heightening is null despite this prose tier — pre
- copy: keep: bundles a qualitative addition (illustration fidelity) with the page-count bump, not a pure numeric ladd
- darkseeker-s-aura: keep: already idiomatic single (+N) line with two flat increments matching structural heightening.damage; base
- darkseeker-s-restraint: keep: idiomatic single (+1d8) line matching structural heightening.damage for both damage instances; base (3d8
- dead-ringer: keep: qualitative single fixed tier (extends invisibility duration post-trigger), not a numeric ladder.
- deja-vu: keep: idiomatic single flat +6 increment to the damage cap; base cap (30) stated in body.
- disperse-magic: keep: bundles a qualitative addition (extends to an ally) with the numeric bump, not a pure ladder.
- disrupt-movement: keep: bundles a target-count increase with a qualitative crit-fail change (Immobilized replaces Speed 0), not 
- distorted-mark: keep: idiomatic single flat +1d4 line at interval 2, matching structural heightening; base (1d4) stated in bod
- divine-regression: keep: idiomatic single (+1d8) line matching structural heightening; base (3d8) stated in body.
- djura-s-divine-razor: keep: idiomatic single (+N) line, but note the per-hit curse damage (2d6 in body) has no structural damage/hei
- djura-s-righteous-pressure: keep: broadens target scope to evil humanoids (genuinely different effect) plus a flat damage bump, appropriat
- do-my-bidding: keep: unlocks autonomous pursuit without caster presence (genuinely different effect) bundled with a range bum
- earworm: keep: grants location tracking, a genuinely different effect, appropriately fixed
- ebb-and-flow: keep: adds Prone-on-crit-fail and extends the reaction benefit to late arrivals, genuinely different effects
- erase: keep: unlocks erasing scrolls/formula books, a genuinely different effect · keep: unlocks erasing runes/property runes, a genuinely different effect
- excavation: keep: already matches the preferred +N idiom (single value, the spell's own core mechanic, not a peripheral ca
- extraplanar-beam: keep: already matches the preferred +N idiom, structural interval matches text
- extraplanar-pulse: keep: already matches the preferred +N idiom, structural interval matches text
- falling-star: keep: already matches the preferred +N idiom, structural interval matches text
- fast-forward: keep: layers Drained onto the existing curse, a genuinely additive effect, not pure numeric bloat
- fault-line: keep: already matches the preferred +N idiom, both scaled values stated in body, structural matches
- festering-slick: keep: already matches the preferred +N idiom, structural interval matches text
- fluid-form: keep: multiple genuinely different additions (acid resistance, climb speed), not pure numeric bloat
- flutterstep: keep: fixed tiers (5th/7th) each bundle multiple distinct changes (distance, DC, uses/round, new free-action f
- force-drumfire: keep: idiom is a compliant flat +2 ladder; NOTE store JSON system.heightening is null despite this body text —
- forceful-charge: keep: single flat +1 tier scaling crit-failure damage matches the flat-increment idiom; base 4d6 stated in bod
- forceful-onslaught: keep: single named-level tier (9th) bundles a flat damage bump with further narrowing the death-avoidance mech
- forensic-analysis: keep: fixed tiers (4th/6th) unlock genuinely new capabilities (open-ended questions, simultaneous dual-mode ca
- fugue: keep: single tier unlocking a multi-target capability, not a numeric ladder
- fumble: keep: single named-level tier (6th) bundles a related penalty step-up with a new condition; not a repeating la
- gallows: keep: single named tier (6th) bundles a range/method change with a duration change — genuinely different effec
- glimmerdust: keep: flat +2 ladder matches the ideal idiom exactly; base 30-foot cone stated in body
- gravity-anvil: keep: flat +1 ladder matches the ideal idiom; base 10d10 stated in body
- grey-frost: keep: flat +1 ladder scaling two related base values (initial hit and Stage 1 recurring damage); both bases (3
- grosteque-selfshape: keep: multi-value flat +2 ladder (size/damage/temp-HP) is a reasonable bundled idiom; NOTE store JSON system.h
- haunt: keep: single named tier (6th) bundles a range increase with removing the line-of-sight restriction — genuinely
- healing-draught: keep: flat +1 ladder matches the ideal idiom; base 6d8+30 stated in body (note: original's heightening also ad
- hypercompression: keep: correct flat +1d10 idiom, base 8d10 stated in body.
- illusory-illusion: keep: matches the (+N) idiom bundling two scaled values in one clause, both stated in body.
- incensed-bestial-rage: keep: correct combined +2 idiom, base 2d6 damage / 20 temp HP stated in body.
- inquisition: keep: fixed tiers (4th/6th) grant qualitatively different targeting rules, not a pure numeric ladder.
- instant-exit: keep: fixed tiers add qualitatively different mechanics (choice of shared/separate destinations, directional c
- jolt: keep: fixed tiers add qualitatively different range/target-count and then unlock combined use, not a pure ladd
- kosmoturgist-s-armor: keep: flat +5 idiom is correct, base resistance 10 stated in body; the worked-example tail is separately struc
- laixa-s-expert-intuition: keep: fixed tier adds qualitatively different skills and a higher floor, not a pure numeric ladder.
- laixa-s-historical-tracker: keep: fixed tiers reveal qualitatively different information (race/type, then a proper name), not a pure ladde
- left-hand-of-judgment: keep: fixed tiers grant qualitatively different effects (trigger widening, then retargeting), not a pure ladde
- lend-time: keep: fixed tier offers a qualitatively different choice (more actions for one ally vs. more targets), not a p
- let-s-start-a-fight: keep: combined (+2) idiom bundling two scaled values, both stated in body. Note: the adapter flags this tier a
- lockstep-fate: keep: fixed tiers add qualitatively different mechanics (multi-hold, multi-target), not a pure ladder.
- lucky-stars: keep: correct flat +1-charge idiom, base 3 charges stated in body (the worked-example tail is separately struc
- lucky-ward: keep: voice matches the original's plain register closely enough. Per the prior review round, the dropped ally
- lyrr-s-chronomantic-shell: keep: correct flat +100-ft idiom, matches the original's own higher-level rule exactly, base 100-ft radius sta
- mark-of-protection: keep: both fixed tiers (6th: extra mark capacity, 8th: resistance) grant genuinely different effects, not a pu
- mass-fluency: keep: correct flat (+1) idiom once the T1 worked-example parenthetical is removed, base of 4 stated in body. N
- monstrous-copy-stinger: keep: already correct (+1) flat idiom, base poison damage (4d10) stated in body. Affliction stage structure is
- monstrous-copy-wail: keep: already correct (+1) flat idiom, base damage (8d8) stated in body.
- nightfall: keep: matches the 5e original's own non-linear, order-of-magnitude fixed-tier design (600 ft / 1 mile / 10 mil
- oblivion: keep: already correct (+1) flat idiom (both damage types +1d6), base (6d6/6d6) stated in body.
- oddly-satisfying: keep: single non-repeating tier that changes range and target count qualitatively — not a numeric ladder, corr
- patishvat-s-perfect-pocket: keep: single fixed 3rd-rank tier doubling capacity, not a bloat ladder; no collapse needed.
- pendulum: keep: already the correct flat idiom (interval +2 = +1 target), matches structural heightening.interval=2.
- phlogistic-shield: keep: single flat +1 idiom is correct once the worked-example parenthetical is struck (see T1).
- planar-pyre: keep: correct flat-idiom format matching structural interval heightening on both damage components.
- planar-shield: keep: flat idiom, directly matches original's per-level damage scaling.
- poisoned-backflow: keep: flat idiom, correct format. · keep: fixed tier adds a genuinely different trigger vector (Aid action), not merely loosening a numeric cap.
- preserve-foodstuffs: keep: single fixed tier bundles a genuinely different capability (multi-container targeting), not pure numeric
- propagating-blast: keep: settled structural (+1) damage-only heightening per prior round; correct flat idiom.
- raise-island: keep: fixed tier scales both size and speed, a genuine power increase appropriate for a rank 7->9 jump, not me
- rearrange-fate: keep: flat idiom, directly matches original's per-level additional-creature scaling.
- reduce-resistivity: keep: single flat (+2) idiom is correct once the worked-example parenthetical is struck (see T1).
- reflective-defense: keep: fixed tier broadens scope to all damage, a genuinely different qualitative effect, not pure numeric bloa
- repetitious-trauma: keep: flat idiom, correct format.
- reposition: keep: format is a correct flat idiom; the underlying axis-swap is separately flagged under T6.
- reset: keep: flat idiom, directly matches original's per-level additional-target scaling.
- retributive-force: keep: single flat-line idiom format is correct; the die-size content is separately flagged under T6.
- return-spell: keep candidate, but flag for verification: the base allows up to six total saves (three per party) with one re
- revisit: keep: single fixed 7th-rank milestone matches the store's established idiom for non-damage utility scaling; th
- rewind-and-playback: keep: flat (+1) increment matches the Diamond Dust idiom, and the scaled base value (3d8+24) is stated in the 
- right-hand-of-judgment: keep: the 6th/8th fixed tiers each grant a genuinely different effect (raised charge cap plus a new trigger; b
- sapping-lightning: keep: flat (+1) increment matches the Diamond Dust idiom, base damage (9d12) stated in body
- solar-fury: keep: flat (+1) increment matches the Diamond Dust idiom, base damage (4d6) stated in body
- solar-rebuke: keep: flat (+1) increment matches the Diamond Dust idiom, base damage (5d10) stated in body
- spawn-abyssal-sprite: keep: flat (+2) increment matches the Diamond Dust idiom, base damage (12d6) stated in body; scoped to the ini
- sphere-of-preservation: keep: fixed emanation-doubling tiers (8th/10th) match standard PF2e aura-heightening idiom
- summon-heart: keep: flat (+1) increment matches the Diamond Dust idiom, base damage (11d10) stated in body
- summon-servant: keep: standard PF2e summon-spell heightening idiom — the non-linear creature-level curve (1/2/3/5/7/9/11/13/15
- suspension: keep: single fixed tier (5th) grants a genuinely different, stronger version of the same effect, not bloat
- swap: keep: (+1) target-count idiom is fine, but note the structural heightening field is absent from system.heighte
- taboo: keep: qualitative either/or upgrade (extra taboo or target), not a numeric ladder value
- take-me-instead: keep: two fixed tiers each escalate three coupled real effects (DC, HP restored, rider severity) together, mir
- talk-the-talk: keep: single fixed tier expanding info scope + bonus together, a genuinely different tier not a repeating ladd
- thaumaturgic-inhibition: keep: genuinely different capability (self-affecting mobility) gated behind an upkeep cost, not a numeric ladd
- thaumaturgic-obstruction: keep: standard flat-increment area heightening idiom, no bloat
- time-loop: keep: single fixed jump (1 to 3 targets) at rank 8, not a repeating +N ladder
- time-step: keep: two genuinely different fixed-tier upgrades (skip-turn timing option; extended range + ally transport), 
- tunnel-vision: keep: single fixed tier escalating both values together, consistent with the deliberately-restored single-targ
- weight-of-the-world: keep: standard flat-increment area heightening idiom, no bloat
- zone-of-minimization: keep: two genuinely different fixed tiers (extending minimization to flat bonuses; area increase), not bloat o
