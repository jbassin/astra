/**
 * D29-13: the committed book→license table for AoN-only/journal-derived entities.
 * Foundry-derived entities read their license straight off `system.publication`
 * (`foundryEntities.ts`'s `deriveSourceAndEdition`) — this table exists ONLY for
 * content that has no in-source license field at all: AoN-only docs (which
 * include exactly the removed-from-Foundry legacy content, e.g. Magic
 * Missile / Produce Flame — verified, no pack file for either) and
 * journal-derived prose.
 *
 * ## Derivation method (data-driven, then hand-spot-checked — spec's prescribed
 * process)
 *
 * Every AoN doc carries a `primary_source` (book title) + `release_date`
 * (verified: 0 of 43,684 real docs miss either field). Aggregating
 * `primary_source → earliest release_date` across the full real snapshot
 * (`apps/codex/data/snapshots/aon/2026-07-13/`) yields 243 distinct books. The
 * classification rule applied to build the table below:
 *
 *   1. Title ends in "(Remastered)" (case-insensitive) → ORC, unconditionally.
 *   2. Else: `release_date >= REMASTER_CUTOVER_DATE` → ORC, else OGL.
 *
 * Rule 1 exists because of a REAL data anomaly this derivation caught: AoN's own
 * `release_date` for "Treasure Vault (Remastered)" is `2023-02-22` — identical
 * to the ORIGINAL "Treasure Vault"'s date, i.e. the field reflects the book's
 * original print date even for the remastered reissue, not the reissue's own
 * date (contrast "Guns & Gears (Remastered)" / "Dark Archives (Remastered)",
 * whose dates DO differ from their originals — the anomaly isn't systematic).
 * A pure date threshold would mislabel "Treasure Vault (Remastered)" OGL; the
 * title carries the correct signal AoN's own date field doesn't. Rule 1 is
 * checked first for exactly this reason.
 *
 * `REMASTER_CUTOVER_DATE` is Player Core/GM Core's real release date — both
 * read `release_date: "2023-11-15"` in the live data, the earliest
 * remaster-line release.
 *
 * ## Hand spot-check (spec gate C's own three cases + a broader sample; all
 * verified against the generated table and real-world PF2e publishing history)
 *
 *   - "Player Core" (2023-11-15)      → ORC  ✓ (gate C: remastered Player Core)
 *   - "Core Rulebook" (2019-08-01)    → OGL  ✓ (gate C: pre-remaster CRB)
 *   - "Core Rulebook" is Magic Missile's own `primary_source`               →
 *     `licenseForBook("Core Rulebook")` resolves OGL (gate C: AoN-only legacy
 *     spell resolves via the table — Magic Missile has no pack file at all).
 *   - "GM Core" (2023-11-15) → ORC; "Monster Core" (2024-03-27) → ORC
 *   - "Bestiary" (2019-08-01) → OGL; "Advanced Player's Guide" (2020-07-30) → OGL
 *   - "Treasure Vault" (2023-02-22, no suffix) → OGL; "Treasure Vault
 *     (Remastered)" (same 2023-02-22 date, title override) → ORC — the anomaly
 *     above, proving rule 1 is load-bearing, not decorative.
 *   - "War of Immortals" (2024-10-30) → ORC; "Kingmaker Adventure Path"
 *     (2022-10-26) → OGL
 *   - "Guns & Gears" (2021-10-13) → OGL vs. "Guns & Gears (Remastered)"
 *     (2025-02-18) → ORC — same base title, correctly split by edition.
 *
 * ## Extending this table
 *
 * A future `just codex-refresh` against a newer AoN snapshot may introduce a
 * `primary_source` book title not listed below — `licenseForBook` returns
 * `"unknown"` for it (report-counted at S4, per spec, NOT a hard fail). Extend
 * this table by re-running the same two-rule derivation against the new
 * snapshot's `primary_source`/`release_date` fields and hand-spot-checking the
 * new entries, mirroring the process above — don't just guess.
 */

import type { License } from "../src/schema/entity";

/** Player Core / GM Core's real release date — the remaster line's first
 * release. Also reused by `aonFacets.ts` for its own edition-derivation
 * fallback (same signal, single source of truth). */
export const REMASTER_CUTOVER_DATE = "2023-11-15";

/**
 * Strips the CRLF-garbage trailing whitespace found on 476 of the real
 * snapshot's `primary_source` values (e.g. `"Draconic Codex\r\n"` sitting
 * alongside 315 clean `"Draconic Codex"` docs for the exact same book — an ES
 * indexing artifact, not two different books) and collapses internal
 * whitespace, so a dirty and a clean spelling of the same title both resolve
 * to the same table entry. Exported so `aonFacets.ts` can produce the same
 * clean book name for `Source.book`/citation fields, not just for lookup.
 */
export function normalizeBookName(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Book (AoN `primary_source`, post-`normalizeBookName`) → license. Generated
 * once from the real `2026-07-13` AoN snapshot per the derivation method above,
 * then committed — this is NOT recomputed at ingest time. 243 entries: 91 ORC /
 * 152 OGL. Trailing comment on each line is the book's earliest observed
 * `release_date`, kept for future re-derivation/audit, not read by any code.
 */
export const BOOK_LICENSE: Readonly<Record<string, License>> = {
  "A Caroling Horse (Of Course. Of Course.)": "OGL", // 2021-01-01
  "A Few Flowers More": "OGL", // 2023-07-24
  "A Fistful of Flowers": "OGL", // 2022-07-25
  "Abomination Vaults Hardcover": "OGL", // 2022-05-25
  "Abomination Vaults Player's Guide": "OGL", // 2021-01-15
  "Absalom, City of Lost Omens": "OGL", // 2021-12-22
  "Advanced Player's Guide": "OGL", // 2020-07-30
  "Age of Ashes Player's Guide": "OGL", // 2019-08-01
  "Agents of Edgewatch Player's Guide": "OGL", // 2020-07-08
  "Ancestry Guide": "OGL", // 2021-02-24
  "Azarketi Ancestry Web Supplement": "OGL", // 2021-02-24
  "Battle of the Pantheons Winner Announcement": "OGL", // 2020-06-25
  "Battlecry!": "ORC", // 2025-07-31
  Bestiary: "OGL", // 2019-08-01
  "Bestiary 2": "OGL", // 2020-05-27
  "Bestiary 3": "OGL", // 2021-04-07
  "Blood Lords Player's Guide": "OGL", // 2022-06-29
  "Book of the Dead": "OGL", // 2022-04-27
  "Celebrating Hispanic Heritage Month": "OGL", // 2022-10-03
  "Character Guide": "OGL", // 2019-10-16
  "Claws of the Tyrant": "ORC", // 2025-04-02
  "Come One, Come All, to the Extinction Curse Player's Guide!": "OGL", // 2020-01-14
  "Core Rulebook": "OGL", // 2019-08-01
  "Crown of the Kobold King": "OGL", // 2022-10-26
  "Curtain Call Player's Guide": "ORC", // 2024-07-15
  "Dark Archive": "OGL", // 2022-07-27
  "Dark Archives (Remastered)": "ORC", // 2026-02-04
  "Divine Mysteries": "ORC", // 2025-01-30
  "Divine Mysteries Web Supplement": "ORC", // 2024-11-20
  "Draconic Codex": "ORC", // 2025-11-05
  "Extinction Curse Player's Guide": "OGL", // 2020-01-13
  Firebrands: "OGL", // 2023-03-29
  "Fists of the Ruby Phoenix Hardcover": "OGL", // 2023-01-25
  "Fists of the Ruby Phoenix Player's Guide": "OGL", // 2021-04-12
  "Foolish Housekeeping and Other Articles": "ORC", // 2025-04-01
  "Fools Aplenty": "ORC", // 2026-04-01
  "Friends in High Places": "OGL", // 2020-01-21
  "Gamemastery Guide": "OGL", // 2020-02-26
  "Gatewalkers (Hardcover)": "ORC", // 2025-07-02
  "Gatewalkers Player's Guide": "OGL", // 2023-01-04
  "Gatewalkers Player's Guide (Remastered)": "ORC", // 2025-07-02
  "GM Core": "ORC", // 2023-11-15
  "GM's Toolbox: Gravehall": "OGL", // 2020-12-23
  "GM's Toolkit: Secret Keeper's Mask": "OGL", // 2021-01-13
  "Gods & Magic": "OGL", // 2020-01-29
  "Gods & Magic - Web Supplement": "OGL", // 2020-01-29
  "Gods of the Expanse": "OGL", // 2021-07-16
  "Grand Bazaar": "OGL", // 2021-10-13
  "Guns & Gears": "OGL", // 2021-10-13
  "Guns & Gears (Remastered)": "ORC", // 2025-02-18
  "Hell's Destiny Player's Guide": "ORC", // 2026-06-03
  "Hellbreakers Players Guide": "ORC", // 2026-03-04
  "Hellfire Dispatches": "ORC", // 2026-04-01
  "High Seas": "ORC", // 2026-07-01
  Highhelm: "OGL", // 2023-06-28
  "Howl of the Wild": "ORC", // 2024-05-29
  "Impossible Lands": "OGL", // 2022-11-16
  "In Darkness": "OGL", // 2022-09-09
  "Kingmaker Adventure Path": "OGL", // 2022-10-26
  "Kingmaker Companion Guide": "OGL", // 2022-10-26
  "Knights of Lastwall": "OGL", // 2022-05-25
  Legends: "OGL", // 2020-07-30
  "Little Trouble in Big Absalom": "OGL", // 2020-07-25
  Malevolence: "OGL", // 2021-07-07
  "Monster Core": "ORC", // 2024-03-27
  "Monster Core 2": "ORC", // 2025-11-05
  "Monsters of Myth": "OGL", // 2021-12-22
  "Myth-Speakers Players Guide": "ORC", // 2025-07-16
  "Night of the Gray Death": "OGL", // 2021-10-13
  "No-Prep Character: Chea": "OGL", // 2021-02-19
  "No-Prep Character: Duhgik": "OGL", // 2020-07-17
  "No-Prep Character: Eleukas": "OGL", // 2021-01-20
  "No-Prep Character: Gristleburst": "OGL", // 2021-07-09
  "No-Prep Character: Lisavet": "OGL", // 2021-01-27
  "No-Prep Character: Morlibint": "OGL", // 2020-11-11
  "No-Prep Character: Pr’rall": "OGL", // 2020-07-10
  "No-Prep Character: Urok": "OGL", // 2021-02-12
  "No-Prep Character: Wendlyn": "OGL", // 2021-06-18
  "No-Prep Character: Zhang Yong": "OGL", // 2021-04-23
  "NPC Core": "ORC", // 2025-02-26
  "Organized Play Foundation": "OGL", // 2019-08-05
  "Outlaws of Alkenstar Player's Guide": "OGL", // 2022-03-28
  "Pathfinder #145: Hellknight Hill": "OGL", // 2019-08-01
  "Pathfinder #146: Cult of Cinders": "OGL", // 2019-09-01
  "Pathfinder #147: Tomorrow Must Burn": "OGL", // 2019-09-18
  "Pathfinder #148: Fires of the Haunted City": "OGL", // 2019-10-16
  "Pathfinder #149: Against the Scarlet Triad": "OGL", // 2019-11-13
  "Pathfinder #150: Broken Promises": "OGL", // 2019-12-12
  "Pathfinder #151: The Show Must Go On": "OGL", // 2020-01-30
  "Pathfinder #152: Legacy of the Lost God": "OGL", // 2020-02-26
  "Pathfinder #153: Life's Long Shadows": "OGL", // 2020-03-26
  "Pathfinder #154: Siege of the Dinosaurs": "OGL", // 2020-04-29
  "Pathfinder #155: Lord of the Black Sands": "OGL", // 2020-05-27
  "Pathfinder #156: The Apocalypse Prophet": "OGL", // 2020-06-24
  "Pathfinder #157: Devil at the Dreaming Palace": "OGL", // 2020-07-30
  "Pathfinder #158: Sixty Feet Under": "OGL", // 2020-08-26
  "Pathfinder #159: All or Nothing": "OGL", // 2020-09-15
  "Pathfinder #160: Assault on Hunting Lodge Seven": "OGL", // 2020-10-14
  "Pathfinder #161: Belly of the Black Whale": "OGL", // 2020-11-15
  "Pathfinder #162: Ruins of the Radiant Siege": "OGL", // 2020-12-15
  "Pathfinder #163: Ruins of Gauntlight": "OGL", // 2021-01-15
  "Pathfinder #164: Hands of the Devil": "OGL", // 2021-02-24
  "Pathfinder #165: Eyes of Empty Death": "OGL", // 2021-04-07
  "Pathfinder #166: Despair on Danger Island": "OGL", // 2021-07-07
  "Pathfinder #167: Ready? Fight!": "OGL", // 2021-07-07
  "Pathfinder #168: King of the Mountain": "OGL", // 2021-07-07
  "Pathfinder #169: Kindled Magic": "OGL", // 2021-08-05
  "Pathfinder #170: Spoken on the Song Wind": "OGL", // 2021-09-01
  "Pathfinder #171: Hurricane's Howl": "OGL", // 2021-10-13
  "Pathfinder #172: Secrets of the Temple City": "OGL", // 2021-10-13
  "Pathfinder #173: Doorway to the Red Star": "OGL", // 2021-11-10
  "Pathfinder #174: Shadows of the Ancients": "OGL", // 2022-03-30
  "Pathfinder #175: Broken Tusk Moon": "OGL", // 2022-01-26
  "Pathfinder #176: Lost Mammoth Valley": "OGL", // 2022-02-23
  "Pathfinder #177: Burning Tundra": "OGL", // 2022-03-30
  "Pathfinder #178: Punks in a Powderkeg": "OGL", // 2022-04-27
  "Pathfinder #179: Cradle of Quartz": "OGL", // 2022-05-25
  "Pathfinder #180: The Smoking Gun": "OGL", // 2022-06-29
  "Pathfinder #181: Zombie Feast": "OGL", // 2022-07-27
  "Pathfinder #182: Graveclaw": "OGL", // 2022-08-31
  "Pathfinder #183: Field of Maidens": "OGL", // 2022-09-21
  "Pathfinder #184: The Ghouls Hunger": "OGL", // 2022-10-26
  "Pathfinder #185: A Taste of Ashes": "OGL", // 2022-11-16
  "Pathfinder #186: Ghost King's Rage": "OGL", // 2022-12-14
  "Pathfinder #187: The Seventh Arch": "OGL", // 2023-01-25
  "Pathfinder #188: They Watched the Stars": "OGL", // 2023-02-22
  "Pathfinder #189: Dreamers of the Nameless Spires": "OGL", // 2023-03-29
  "Pathfinder #190: The Choosing": "OGL", // 2023-04-26
  "Pathfinder #191: The Destiny War": "OGL", // 2023-05-24
  "Pathfinder #192: Worst of All Possible Worlds": "OGL", // 2023-06-28
  "Pathfinder #193: Mantle of Gold": "OGL", // 2023-08-02
  "Pathfinder #194: Cult of the Cave Worm": "OGL", // 2023-08-30
  "Pathfinder #195: Heavy is the Crown": "OGL", // 2023-09-23
  "Pathfinder #196: The Summer That Never Was": "OGL", // 2023-10-18
  "Pathfinder #197: Let the Leaves Fall": "ORC", // 2023-11-29
  "Pathfinder #198: No Breath to Cry": "ORC", // 2023-12-25
  "Pathfinder #199: To Bloom Below the Web": "ORC", // 2024-01-26
  "Pathfinder #200: Seven Dooms for Sandpoint": "ORC", // 2024-03-27
  "Pathfinder #201: Pactbreaker": "ORC", // 2024-04-15
  "Pathfinder #202: Severed at the Root": "ORC", // 2024-05-15
  "Pathfinder #203 Shepherd of Decay": "ORC", // 2024-06-15
  "Pathfinder #204: Stage Fright": "ORC", // 2024-07-15
  "Pathfinder #205: Singer, Stalker, Skinsaw Man": "ORC", // 2024-08-15
  "Pathfinder #206: Bring the House Down": "ORC", // 2024-09-15
  "Pathfinder #207: Resurrection Flood": "ORC", // 2024-10-15
  "Pathfinder #208: Hoof, Cinder, and Storm": "ORC", // 2024-11-15
  "Pathfinder #209: Destroyer's Doom": "ORC", // 2024-12-15
  "Pathfinder #210: Whispers in the Dirt": "ORC", // 2025-01-15
  "Pathfinder #211: The Secret of Deathstalk Tower": "ORC", // 2025-02-15
  "Pathfinder #212: A Voice in the Blight": "ORC", // 2025-03-15
  "Pathfinder #213: Thirst for Blood": "ORC", // 2025-04-02
  "Pathfinder #214: The Broken Palace": "ORC", // 2025-05-07
  "Pathfinder #215: To Blot Out the Sun": "ORC", // 2025-05-15
  "Pathfinder #216: The Acropolis Pyre": "ORC", // 2025-07-17
  "Pathfinder #217: Death Sails a Wine-Dark Sea": "ORC", // 2025-07-31
  "Pathfinder #218: Titanbane": "ORC", // 2025-09-03
  "Pathfinder #222: Hellbreakers": "ORC", // 2026-03-04
  "Pathfinder #223: Hell's Destiny": "ORC", // 2026-06-03
  "Pathfinder Adventure Path #219: Lord of the Trinity Star": "ORC", // 2025-10-08
  "Pathfinder Beginner Box: Game Master's Guide": "OGL", // 2020-10-15
  "Pathfinder Beginner Box: Hero's Handbook": "OGL", // 2020-10-15
  "Pathfinder Bestiary 3 Bonus Monster": "OGL", // 2021-03-19
  "Pathfinder Encounter: Heaving Kobolds": "OGL", // 2021-01-07
  "Pathfinder Encounter: Phinelli's Miracle Elixir": "OGL", // 2021-02-26
  "Pathfinder Game Night: Dawn of the Frogs (Deluxe Adventure)": "ORC", // 2025-09-03
  "Pathfinder Seven Dooms for Sandpoint Player’s Guide": "ORC", // 2024-03-27
  "Pathfinder Society Year 4 Rule Updates": "OGL", // 2022-06-30
  "Pathfinder Special: Fumbus": "OGL", // 2021-11-11
  "PFS Character Options": "OGL", // 2020-01-30
  "PFS Guide": "OGL", // 2020-10-14
  "PFS Quest #10: The Broken Scales": "OGL", // 2020-05-28
  "PFS Quest #2: Unforgiving Fire": "OGL", // 2019-09-25
  "PFS Quest #5: The Dragon Who Stole Evoking Day": "OGL", // 2020-01-13
  "PFS Scenario #1-03: Escaping the Grave": "OGL", // 2019-07-31
  "PFS Scenario #1-15: The Blooming Catastrophe": "OGL", // 2020-02-26
  "PFS Scenario #1-17: The Perennial Crown Part 2, The Thorned Monarch": "OGL", // 2020-03-24
  "PFS Scenario #1-19: Iolite Squad Alpha": "OGL", // 2020-04-27
  "PFS Scenario #1-24: Lightning Strikes, Stars Fall": "OGL", // 2020-07-30
  "PFS Scenario #7-01: Intro to the Year of Battle’s Spark: Enough is Enough": "ORC", // 2025-08-01
  "PFS Scenario #7-02: Shipyard Sabotage": "ORC", // 2025-08-01
  "PFS Scenario #7-03: A Foot in the Door": "ORC", // 2025-09-01
  "PFS Scenario #7-04: Sulfuric Negotiations": "ORC", // 2025-09-01
  "PFS Scenario #7-05: Battle of the Thorns": "ORC", // 2025-10-28
  "PFS Scenario #7-06: Brastlewark at War Part 1: The Gnome Defection": "ORC", // 2025-11-19
  "PFS Scenario #7-07: Draconic Folly": "ORC", // 2025-11-19
  "PFS Scenario #7-08: The Haunted Corridor": "ORC", // 2025-12-17
  "PFS Scenario #7-09: The Chitterwood Walks, Part 1: Scrambling the Tribes": "ORC", // 2026-01-07
  "PFS Scenario #7-11: The Darkness Within": "ORC", // 2026-02-04
  "PFS Scenario #7-12: The Chitterwood Walks, Part 2: The Battle of Logas": "ORC", // 2026-02-04
  "PFS Scenario #7-13: Ancient Beyond Imagining": "ORC", // 2026-03-04
  "PFS Scenario #7-14: Brastlewark at War, Part 2: The Gnome Liberation": "ORC", // 2026-03-04
  "PFS Scenario #7-15: Within Antiquated Halls": "ORC", // 2026-04-01
  "PFS Scenario #7-16: A Star's Journey": "ORC", // 2026-04-01
  "PFS Scenario #7-17: Perch of Liberty": "ORC", // 2026-05-06
  "PFS Scenario #7-18: Freedom on the Sea": "ORC", // 2026-05-06
  "PFS Scenario #7-19: The Lost Legacy": "ORC", // 2026-06-03
  "PFS Scenario #7-20: The Strings of Hell": "ORC", // 2026-06-03
  "PFS Scenario #7-21: The Home of Empty Breath": "ORC", // 2026-07-01
  "PFS Scenario #7-22: The Handmaiden's Gaze": "ORC", // 2026-07-01
  "Player Core": "ORC", // 2023-11-15
  "Player Core 2": "ORC", // 2024-08-01
  "Prey for Death": "ORC", // 2024-07-31
  "Quest for the Frozen Flame Player's Guide": "OGL", // 2021-12-20
  "Rage of Elements": "OGL", // 2023-08-02
  "Redpitch Alchemy": "OGL", // 2020-11-25
  "Revenge of the Runelords Player's Guide": "ORC", // 2025-09-25
  "Rival Academies": "ORC", // 2025-02-26
  Rusthenge: "OGL", // 2023-10-18
  "Season of Ghosts (Hardcover)": "ORC", // 2026-02-04
  "Season of Ghosts Player's Guide": "OGL", // 2023-10-02
  "Secrets of Magic": "OGL", // 2021-09-01
  "Secrets of the Unlit Star Game Master's Guide": "ORC", // 2026-05-06
  "Shades of Blood Player's Guide": "ORC", // 2025-04-02
  "Shadows at Sundown": "OGL", // 2022-05-25
  "Shining Kingdoms": "ORC", // 2025-06-04
  "Sky King's Tomb Player's Guide": "OGL", // 2023-07-13
  "Spore War Player's Guide": "ORC", // 2025-01-15
  "Stolen Fate Player's Guide": "OGL", // 2023-04-13
  "Strength of Thousands Player's Guide": "OGL", // 2021-07-26
  "The Enmity Cycle": "OGL", // 2023-05-24
  "The Fall of Plaguestone": "OGL", // 2019-08-01
  "The Mwangi Expanse": "OGL", // 2021-07-07
  "The Slithering": "OGL", // 2020-07-30
  "The Waters of Stone Ring Pond": "OGL", // 2020-12-16
  "Things Go to Hell": "ORC", // 2026-06-27
  "Threshold of Knowledge": "OGL", // 2021-11-19
  "Tian Xia Character Guide": "ORC", // 2024-08-28
  "Tian Xia World Guide": "ORC", // 2024-04-24
  "Travel Guide": "OGL", // 2022-08-31
  "Treasure Vault": "OGL", // 2023-02-22
  "Treasure Vault (Remastered)": "ORC", // 2023-02-22
  "Triumph of the Tusk Player's Guide": "ORC", // 2024-10-15
  "Troubles in Grayce": "ORC", // 2026-05-06
  "Troubles in Otari": "OGL", // 2020-12-09
  "Wake the Dead #1": "OGL", // 2023-05-31
  "Wake the Dead #2": "OGL", // 2023-07-26
  "Wake the Dead #3": "OGL", // 2023-09-27
  "Wake the Dead #4": "ORC", // 2023-11-28
  "Wake the Dead #5": "ORC", // 2024-01-31
  "War of Immortals": "ORC", // 2024-10-30
  "War of Immortals Alternate Mythic Rules": "ORC", // 2024-10-30
  "Wardens of Wildwood Players Guide": "ORC", // 2024-04-15
  "World Guide": "OGL", // 2019-08-31
};

/**
 * Resolves an AoN `primary_source`/`source` book title to its license,
 * `"unknown"` for anything not in `BOOK_LICENSE` (report-counted at S4, per
 * spec — a genuinely unclassifiable/not-yet-seen book, not an error). Applies
 * `normalizeBookName` first so a CRLF-dirty or whitespace-varied spelling of a
 * known title still resolves.
 */
export function licenseForBook(book: string): License {
  const key = normalizeBookName(book);
  return BOOK_LICENSE[key] ?? "unknown";
}
