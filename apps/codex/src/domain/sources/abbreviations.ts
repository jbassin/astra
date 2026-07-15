// P6 (D29-68 — R10: source-name abbreviations, delivered as the reviewed
// CLIENT-SAFE PURE-MODULE mechanism, not the original `sources-index.json`
// schema-field design). The original build-time-field draft had no data path
// to 6 of the 7 display sites (the index is server-only, loaded at
// `corpusFs.ts:202-215`, consumed exclusively by `/sources`) — this module is
// a pure function of the book-name STRING instead, imported directly by every
// display component, zero server/scripts/index plumbing.
// `sourcesIndex.ts`/`sourcesIndexBuild.ts` are UNTOUCHED by this phase.
//
// Two tiers, matching the community's own two shapes of source book:
//
//  1. CURATED_MAP — the 243 AoN-known (`productLine`-carrying) books, a flat
//     hand-authored `Record<string, string>`. Community-convention codes
//     (CRB, APG, SoM, G&G, TV, GMG, LOAG, …) where one exists; a systematic
//     "AP<issue-number>" for the ~90 individually-numbered Adventure Path
//     volumes (no single well-known short form exists per volume, unlike a
//     whole path's own name — e.g. Rise of the Runelords -> RotRL); a
//     `<initials>PG` pattern for named Player's Guides; `LO<initials>` for
//     the Lost Omens line. Every entry is reviewable in this one file — a
//     literal map, never computed at runtime. Entries whose code has no
//     settled real-world community convention (one-off blog posts, joke
//     April Fools' products, web-only supplements, niche GM-only
//     supplements) are marked `UNCERTAIN` inline for stakeholder review; the
//     values there are still real, collision-free codes — just not backed by
//     an established fan convention the way CRB/APG/TV are.
//
//  2. The stopword-aware title-initialism GENERATOR — the 253 "Other"-bucket
//     books (no AoN `productLine`; 145 are `Pathfinder Society Scenario
//     #N-NN: <title>`, the remaining 108 numbered APs/Bounties/one-offs).
//     Runs at call time (no build step, no fixture needed): parses a
//     `<prefix> #<n>[-<n>]: <title>` shape, maps the prefix to a short code
//     (`Pathfinder Society Scenario` -> `PS`, `Pathfinder Bounty` -> `PB`,
//     …), and initializes the title's non-stopword tokens — the stakeholder's
//     own worked example, `Pathfinder Society Scenario #6-13: All That
//     Glitters` -> `PS:ATG` (verified byte-for-byte against this exact
//     algorithm). `OTHER_OVERRIDES` is the map-based escape hatch the spec
//     calls for: entries here take priority over the generator, covering (a)
//     titles with no numbered-colon shape at all (`Foundry Journal:
//     Ancestries`, `Pathfinder Beginner Box`, blog/one-off titles), and (b)
//     real title-initialism COLLISIONS the generator alone can't avoid
//     (distinct scenarios that reduce to the same 2-3 letters — disambiguated
//     by folding the scenario's own number into the code, e.g.
//     `PS1-13:DC`/`PS1-22:DC`) — every override entry exists for a concrete,
//     checked reason (see its own comment), not a blind blanket rule.
//
//     One further real-world wrinkle, NOT a corpus bug: 24 of these numbered
//     items exist as TWO distinct normalized book strings in the real
//     496-book index — a short `PFS Scenario #N-NN: …`/`PFS Quest #N: …` form
//     (AoN-attributed, `productLine: "Society"`, tier 1/CURATED_MAP) and a
//     long `Pathfinder Society Scenario #N-NN: …`/`Pathfinder Society Quest
//     #N: …` form (no `productLine`, tier 2/generator) for the SAME real
//     scenario. Both forms often reduce to the identical title-initialism
//     (e.g. "Escaping the Grave" -> EG regardless of which prefix names it),
//     which would otherwise collide CROSS-TIER. The two shapes are given
//     deliberately different prefix codes so they can never collide by
//     construction: the long form keeps the stakeholder's own `PS:`/`PSQ:`
//     worked-example style (tier 2); the short form is numbered instead —
//     `PFS<n-nn>:`/`PFSQ<n>:` (tier 1, CURATED_MAP) — never a per-pair patch.
//     A handful of near-duplicate AP-volume strings (same real book, a
//     spelling/punctuation difference — e.g. "Temple City" vs "Temple-City")
//     get the same treatment via `OTHER_OVERRIDES`' own `AP<n>x` suffix.
//
// The `"unknown"` sentinel (the corpus's own placeholder for entities with no
// resolvable source book, D29-15) is explicitly excluded from both tiers —
// `abbreviateBook("unknown")` always returns `undefined`, the same as any
// book neither tier covers; it is not a real citable title.
//
// `citation.tsx` (the entity-page citation line) and `SourcesIndexView.tsx`'s
// book headings are DELIBERATELY NOT wired to this module — the spec's own
// pin keeps those two surfaces on the full name always (D29-68).
//
// Accepted cost: this module ships in the client bundle (~tens of KB for 496
// curated/overridden entries + the generator) — recorded as an accepted
// trade for zero server/index plumbing (D29-68).

// ---------------------------------------------------------------------------
// tier 1 — the 243 AoN-known (productLine-carrying) books, hand-curated
// ---------------------------------------------------------------------------

const CURATED_MAP: Record<string, string> = {
  "A Caroling Horse (Of Course. Of Course.)": "ACH", // UNCERTAIN: one-off blog post
  "A Few Flowers More": "AFFM",
  "A Fistful of Flowers": "AFoF",
  "Abomination Vaults Hardcover": "AVHC",
  "Abomination Vaults Player's Guide": "AVPG",
  "Absalom, City of Lost Omens": "LOAC",
  "Advanced Player's Guide": "APG",
  "Age of Ashes Player's Guide": "AoAPG",
  "Agents of Edgewatch Player's Guide": "AoEPG",
  "Ancestry Guide": "LOAG",
  "Azarketi Ancestry Web Supplement": "LOAAWS", // UNCERTAIN: web-only supplement, no established community code
  "Battle of the Pantheons Winner Announcement": "BotPWA", // UNCERTAIN: one-off blog post
  "Battlecry!": "BC",
  Bestiary: "B1",
  "Bestiary 2": "B2",
  "Bestiary 3": "B3",
  "Blood Lords Player's Guide": "BLPG",
  "Book of the Dead": "BotD",
  "Celebrating Hispanic Heritage Month": "CHHM", // UNCERTAIN: one-off blog post
  "Character Guide": "LOCG",
  "Claws of the Tyrant": "CotT",
  "Come One, Come All, to the Extinction Curse Player's Guide!": "COCA-ECPG", // UNCERTAIN: one-off blog post
  "Core Rulebook": "CRB",
  "Crown of the Kobold King": "CotKK",
  "Curtain Call Player's Guide": "CCPG",
  "Dark Archive": "DA",
  "Dark Archives (Remastered)": "DA-R",
  "Divine Mysteries": "LODM",
  "Divine Mysteries Web Supplement": "LODMWS", // UNCERTAIN: web-only supplement
  "Draconic Codex": "LODC",
  "Extinction Curse Player's Guide": "ECPG",
  Firebrands: "LOF",
  "Fists of the Ruby Phoenix Hardcover": "FRPHC",
  "Fists of the Ruby Phoenix Player's Guide": "FRPPG",
  "Foolish Housekeeping and Other Articles": "FH&OA", // UNCERTAIN: joke product, no established code
  "Fools Aplenty": "FA", // UNCERTAIN: joke product, no established code
  "Friends in High Places": "FiHP", // UNCERTAIN: one-off blog post
  "GM Core": "GMC",
  "GM's Toolbox: Gravehall": "GMTB:GH", // UNCERTAIN: one-off blog post
  "GM's Toolkit: Secret Keeper's Mask": "GMTK:SKM", // UNCERTAIN: one-off blog post
  "Gamemastery Guide": "GMG",
  "Gatewalkers (Hardcover)": "GWHC",
  "Gatewalkers Player's Guide": "GWPG",
  "Gatewalkers Player's Guide (Remastered)": "GWPG-R",
  "Gods & Magic": "LOGM",
  "Gods & Magic - Web Supplement": "LOGMWS", // UNCERTAIN: web-only supplement
  "Gods of the Expanse": "GotE", // UNCERTAIN: one-off blog post
  "Grand Bazaar": "LOGB",
  "Guns & Gears": "G&G",
  "Guns & Gears (Remastered)": "G&G-R",
  "Hell's Destiny Player's Guide": "HDPG",
  "Hellbreakers Players Guide": "HBPG",
  "Hellfire Dispatches": "LOHD", // UNCERTAIN: niche/newer release, not yet a settled community code
  "High Seas": "LOHS",
  Highhelm: "LOH",
  "Howl of the Wild": "HotW",
  "Impossible Lands": "LOIL",
  "In Darkness": "ID",
  "Kingmaker Adventure Path": "KM",
  "Kingmaker Companion Guide": "KMCG",
  "Knights of Lastwall": "LOKL",
  Legends: "LOL",
  "Little Trouble in Big Absalom": "LTiBA",
  Malevolence: "Mal", // UNCERTAIN: short generic code, single-word title
  "Monster Core": "MC",
  "Monster Core 2": "MC2",
  "Monsters of Myth": "LOMoM",
  "Myth-Speakers Players Guide": "MSPG",
  "NPC Core": "NPCC",
  "Night of the Gray Death": "NotGD",
  "No-Prep Character: Chea": "NPC:Chea", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Duhgik": "NPC:Duhgik", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Eleukas": "NPC:Eleukas", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Gristleburst": "NPC:Gristleburst", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Lisavet": "NPC:Lisavet", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Morlibint": "NPC:Morlibint", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Pr’rall": "NPC:Prrall", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Urok": "NPC:Urok", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Wendlyn": "NPC:Wendlyn", // UNCERTAIN: one-off blog post series
  "No-Prep Character: Zhang Yong": "NPC:ZhangYong", // UNCERTAIN: one-off blog post series
  "Organized Play Foundation": "OPF",
  "Outlaws of Alkenstar Player's Guide": "OoAPG",
  "PFS Character Options": "PFSCO", // UNCERTAIN: one-off blog post
  "PFS Guide": "LOPSG",
  "PFS Quest #10: The Broken Scales": "PFSQ10:BS",
  "PFS Quest #2: Unforgiving Fire": "PFSQ2:UF",
  "PFS Quest #5: The Dragon Who Stole Evoking Day": "PFSQ5:DWSED",
  "PFS Scenario #1-03: Escaping the Grave": "PFS1-03:EG",
  "PFS Scenario #1-15: The Blooming Catastrophe": "PFS1-15:BC",
  "PFS Scenario #1-17: The Perennial Crown Part 2, The Thorned Monarch": "PFS1-17:PC2TM",
  "PFS Scenario #1-19: Iolite Squad Alpha": "PFS1-19:ISA",
  "PFS Scenario #1-24: Lightning Strikes, Stars Fall": "PFS1-24:LSSF",
  "PFS Scenario #7-01: Intro to the Year of Battle’s Spark: Enough is Enough": "PFS7-01:IYBSSEE",
  "PFS Scenario #7-02: Shipyard Sabotage": "PFS7-02:SS",
  "PFS Scenario #7-03: A Foot in the Door": "PFS7-03:FD",
  "PFS Scenario #7-04: Sulfuric Negotiations": "PFS7-04:SN",
  "PFS Scenario #7-05: Battle of the Thorns": "PFS7-05:BT",
  "PFS Scenario #7-06: Brastlewark at War Part 1: The Gnome Defection": "PFS7-06:BW1GD",
  "PFS Scenario #7-07: Draconic Folly": "PFS7-07:DF",
  "PFS Scenario #7-08: The Haunted Corridor": "PFS7-08:HC",
  "PFS Scenario #7-09: The Chitterwood Walks, Part 1: Scrambling the Tribes": "PFS7-09:CW1ST",
  "PFS Scenario #7-11: The Darkness Within": "PFS7-11:DW",
  "PFS Scenario #7-12: The Chitterwood Walks, Part 2: The Battle of Logas": "PFS7-12:CW2BL",
  "PFS Scenario #7-13: Ancient Beyond Imagining": "PFS7-13:ABI",
  "PFS Scenario #7-14: Brastlewark at War, Part 2: The Gnome Liberation": "PFS7-14:BW2GL",
  "PFS Scenario #7-15: Within Antiquated Halls": "PFS7-15:WAH",
  "PFS Scenario #7-16: A Star's Journey": "PFS7-16:SSJ",
  "PFS Scenario #7-17: Perch of Liberty": "PFS7-17:PL",
  "PFS Scenario #7-18: Freedom on the Sea": "PFS7-18:FS",
  "PFS Scenario #7-19: The Lost Legacy": "PFS7-19:LL",
  "PFS Scenario #7-20: The Strings of Hell": "PFS7-20:SH",
  "PFS Scenario #7-21: The Home of Empty Breath": "PFS7-21:HEB",
  "PFS Scenario #7-22: The Handmaiden's Gaze": "PFS7-22:HSG",
  "Pathfinder #145: Hellknight Hill": "AP145",
  "Pathfinder #146: Cult of Cinders": "AP146",
  "Pathfinder #147: Tomorrow Must Burn": "AP147",
  "Pathfinder #148: Fires of the Haunted City": "AP148",
  "Pathfinder #149: Against the Scarlet Triad": "AP149",
  "Pathfinder #150: Broken Promises": "AP150",
  "Pathfinder #151: The Show Must Go On": "AP151",
  "Pathfinder #152: Legacy of the Lost God": "AP152",
  "Pathfinder #153: Life's Long Shadows": "AP153",
  "Pathfinder #154: Siege of the Dinosaurs": "AP154",
  "Pathfinder #155: Lord of the Black Sands": "AP155",
  "Pathfinder #156: The Apocalypse Prophet": "AP156",
  "Pathfinder #157: Devil at the Dreaming Palace": "AP157",
  "Pathfinder #158: Sixty Feet Under": "AP158",
  "Pathfinder #159: All or Nothing": "AP159",
  "Pathfinder #160: Assault on Hunting Lodge Seven": "AP160",
  "Pathfinder #161: Belly of the Black Whale": "AP161",
  "Pathfinder #162: Ruins of the Radiant Siege": "AP162",
  "Pathfinder #163: Ruins of Gauntlight": "AP163",
  "Pathfinder #164: Hands of the Devil": "AP164",
  "Pathfinder #165: Eyes of Empty Death": "AP165",
  "Pathfinder #166: Despair on Danger Island": "AP166",
  "Pathfinder #167: Ready? Fight!": "AP167",
  "Pathfinder #168: King of the Mountain": "AP168",
  "Pathfinder #169: Kindled Magic": "AP169",
  "Pathfinder #170: Spoken on the Song Wind": "AP170",
  "Pathfinder #171: Hurricane's Howl": "AP171",
  "Pathfinder #172: Secrets of the Temple City": "AP172",
  "Pathfinder #173: Doorway to the Red Star": "AP173",
  "Pathfinder #174: Shadows of the Ancients": "AP174",
  "Pathfinder #175: Broken Tusk Moon": "AP175",
  "Pathfinder #176: Lost Mammoth Valley": "AP176",
  "Pathfinder #177: Burning Tundra": "AP177",
  "Pathfinder #178: Punks in a Powderkeg": "AP178",
  "Pathfinder #179: Cradle of Quartz": "AP179",
  "Pathfinder #180: The Smoking Gun": "AP180",
  "Pathfinder #181: Zombie Feast": "AP181",
  "Pathfinder #182: Graveclaw": "AP182",
  "Pathfinder #183: Field of Maidens": "AP183",
  "Pathfinder #184: The Ghouls Hunger": "AP184",
  "Pathfinder #185: A Taste of Ashes": "AP185",
  "Pathfinder #186: Ghost King's Rage": "AP186",
  "Pathfinder #187: The Seventh Arch": "AP187",
  "Pathfinder #188: They Watched the Stars": "AP188",
  "Pathfinder #189: Dreamers of the Nameless Spires": "AP189",
  "Pathfinder #190: The Choosing": "AP190",
  "Pathfinder #191: The Destiny War": "AP191",
  "Pathfinder #192: Worst of All Possible Worlds": "AP192",
  "Pathfinder #193: Mantle of Gold": "AP193",
  "Pathfinder #194: Cult of the Cave Worm": "AP194",
  "Pathfinder #195: Heavy is the Crown": "AP195",
  "Pathfinder #196: The Summer That Never Was": "AP196",
  "Pathfinder #197: Let the Leaves Fall": "AP197",
  "Pathfinder #198: No Breath to Cry": "AP198",
  "Pathfinder #199: To Bloom Below the Web": "AP199",
  "Pathfinder #200: Seven Dooms for Sandpoint": "AP200",
  "Pathfinder #201: Pactbreaker": "AP201",
  "Pathfinder #202: Severed at the Root": "AP202",
  "Pathfinder #203 Shepherd of Decay": "AP203",
  "Pathfinder #204: Stage Fright": "AP204",
  "Pathfinder #205: Singer, Stalker, Skinsaw Man": "AP205",
  "Pathfinder #206: Bring the House Down": "AP206",
  "Pathfinder #207: Resurrection Flood": "AP207",
  "Pathfinder #208: Hoof, Cinder, and Storm": "AP208",
  "Pathfinder #209: Destroyer's Doom": "AP209",
  "Pathfinder #210: Whispers in the Dirt": "AP210",
  "Pathfinder #211: The Secret of Deathstalk Tower": "AP211",
  "Pathfinder #212: A Voice in the Blight": "AP212",
  "Pathfinder #213: Thirst for Blood": "AP213",
  "Pathfinder #214: The Broken Palace": "AP214",
  "Pathfinder #215: To Blot Out the Sun": "AP215",
  "Pathfinder #216: The Acropolis Pyre": "AP216",
  "Pathfinder #217: Death Sails a Wine-Dark Sea": "AP217",
  "Pathfinder #218: Titanbane": "AP218",
  "Pathfinder #222: Hellbreakers": "AP222",
  "Pathfinder #223: Hell's Destiny": "AP223",
  "Pathfinder Adventure Path #219: Lord of the Trinity Star": "AP219",
  "Pathfinder Beginner Box: Game Master's Guide": "BB-GM",
  "Pathfinder Beginner Box: Hero's Handbook": "BB-HH",
  "Pathfinder Bestiary 3 Bonus Monster": "B3:Bonus", // UNCERTAIN: one-off blog post
  "Pathfinder Encounter: Heaving Kobolds": "PE:HeavingKobolds", // UNCERTAIN: one-off blog post
  "Pathfinder Encounter: Phinelli's Miracle Elixir": "PE:PhinellisElixir", // UNCERTAIN: one-off blog post
  "Pathfinder Game Night: Dawn of the Frogs (Deluxe Adventure)": "PGN:DotF", // UNCERTAIN: one-off product, no established code
  "Pathfinder Seven Dooms for Sandpoint Player’s Guide": "SDSPG", // UNCERTAIN: no settled community short form for this PG
  "Pathfinder Society Year 4 Rule Updates": "PSY4RU", // UNCERTAIN: one-off blog post
  "Pathfinder Special: Fumbus": "PSp:Fumbus", // UNCERTAIN: comic one-shot, code chosen to avoid clashing with the PS: Society-scenario prefix
  "Player Core": "PC1",
  "Player Core 2": "PC2",
  "Prey for Death": "PfD",
  "Quest for the Frozen Flame Player's Guide": "QFFPG",
  "Rage of Elements": "RoE",
  "Redpitch Alchemy": "RedpitchA", // UNCERTAIN: one-off blog post
  "Revenge of the Runelords Player's Guide": "RotRPG",
  "Rival Academies": "LORA",
  Rusthenge: "Rust", // UNCERTAIN: short generic code, single-word title
  "Season of Ghosts (Hardcover)": "SoGHC",
  "Season of Ghosts Player's Guide": "SoGPG",
  "Secrets of Magic": "SoM",
  "Secrets of the Unlit Star Game Master's Guide": "SotUS-GM", // UNCERTAIN: niche GM-only supplement, no established community code
  "Shades of Blood Player's Guide": "SoBPG",
  "Shadows at Sundown": "SaS",
  "Shining Kingdoms": "LOSK",
  "Sky King's Tomb Player's Guide": "SKTPG",
  "Spore War Player's Guide": "SWPG",
  "Stolen Fate Player's Guide": "SFPG",
  "Strength of Thousands Player's Guide": "SoTPG",
  "The Enmity Cycle": "TEC",
  "The Fall of Plaguestone": "FoP",
  "The Mwangi Expanse": "LOME",
  "The Slithering": "Slith", // UNCERTAIN: short generic code, single-word title
  "The Waters of Stone Ring Pond": "WoSRP", // UNCERTAIN: one-off blog post
  "Things Go to Hell": "TGtH",
  "Threshold of Knowledge": "ToK",
  "Tian Xia Character Guide": "LOTXCG",
  "Tian Xia World Guide": "LOTXWG",
  "Travel Guide": "LOTG",
  "Treasure Vault": "TV",
  "Treasure Vault (Remastered)": "TV-R",
  "Triumph of the Tusk Player's Guide": "ToTPG",
  "Troubles in Grayce": "TiG",
  "Troubles in Otari": "TiO",
  "Wake the Dead #1": "WtD1",
  "Wake the Dead #2": "WtD2",
  "Wake the Dead #3": "WtD3",
  "Wake the Dead #4": "WtD4",
  "Wake the Dead #5": "WtD5",
  "War of Immortals": "WoI",
  "War of Immortals Alternate Mythic Rules": "WoI-AMR", // UNCERTAIN: niche rules addendum, no established community code
  "Wardens of Wildwood Players Guide": "WoWPG",
  "World Guide": "LOWG",
};
// ---------------------------------------------------------------------------
// tier 2 overrides — collision/shape-mismatch escape hatch for the "Other"
// (generated) tier; checked BEFORE the generator, see the file header.
// ---------------------------------------------------------------------------

const OTHER_OVERRIDES: Record<string, string> = {
  "Foundry Journal: Ancestries": "FJ:Ancestries",
  "Foundry Journal: Archetypes": "FJ:Archetypes",
  "Foundry Journal: Classes": "FJ:Classes",
  "Paizo Blog: It's Foolish To Go Alone": "PZB:IFTGA", // UNCERTAIN: one-off blog post
  "Pathfinder #172: Secrets of the Temple-City": "AP172x",
  "Pathfinder #178: Punks in a Powder Keg": "AP178x",
  "Pathfinder #203: Shepherd of Decay": "AP203x",
  "Pathfinder #207: The Resurrection Flood": "AP207x",
  "Pathfinder #219: Lord of the Trinity Star": "AP219x",
  "Pathfinder Abomination Vaults Hardcover Compilation": "AVHC2",
  "Pathfinder Adventure Path: Gatewalkers": "GW2",
  "Pathfinder Adventure Path: Hell's Destiny": "HD2",
  "Pathfinder Adventure Path: Hellbreakers": "HB2",
  "Pathfinder Adventure: A Few Flowers More": "AFFM2",
  "Pathfinder Adventure: A Fistful of Flowers": "AFoF2",
  "Pathfinder Adventure: Crown of the Kobold King": "CotKK2",
  "Pathfinder Adventure: Little Trouble in Big Absalom": "LTiBA2",
  "Pathfinder Adventure: Malevolence": "Mal2",
  "Pathfinder Adventure: Night of the Gray Death": "NotGD2",
  "Pathfinder Adventure: Prey for Death": "PfD2",
  "Pathfinder Adventure: Rusthenge": "Rust2",
  "Pathfinder Adventure: The Enmity Cycle": "TEC2",
  "Pathfinder Adventure: The Fall of Plaguestone": "FoP2",
  "Pathfinder Adventure: The Scourge of Sheerleaf": "SoS",
  "Pathfinder Adventure: The Slithering": "Slith2",
  "Pathfinder Adventure: Troubles in Otari": "TiO2",
  "Pathfinder Adventures: Dark Archive Web Supplement: In Darkness (Remastered)": "ID-R",
  "Pathfinder Adventures: Troubles in Grayce": "TiG2",
  "Pathfinder Beginner Box": "BB",
  "Pathfinder Beginner Box: Secrets of the Unlit Star": "BB-SotUS",
  "Pathfinder Blog": "PBlog",
  "Pathfinder Blog: April Fool's Bestiary": "PBlog:AFB",
  "Pathfinder Bounty #17: Sodden Stories": "PB17:SS",
  "Pathfinder Bounty #20: Burden in Bloodcove": "PB20:BB",
  "Pathfinder Bounty #2: Blood of the Beautiful": "PB2:BB",
  "Pathfinder Bounty #3: Shadows and Scarecrows": "PB3:SS",
  "Pathfinder Dark Archive (Remastered)": "DA-R2",
  "Pathfinder Free RPG Day Adventure: The Great Toy Heist": "FRPGD:GTH",
  "Pathfinder Kingmaker": "KM2",
  "Pathfinder Lost Omens Ancestry Guide": "LOAG2",
  "Pathfinder Lost Omens Character Guide": "LOCG2",
  "Pathfinder Lost Omens Divine Mysteries": "LODM2",
  "Pathfinder Lost Omens Draconic Codex": "LODC2",
  "Pathfinder Lost Omens Hellfire Dispatches": "LOHD2",
  "Pathfinder Lost Omens High Seas": "LOHS2",
  "Pathfinder Lost Omens Impossible Lands": "LOIL2",
  "Pathfinder Lost Omens Knights of Lastwall": "LOKL2",
  "Pathfinder Lost Omens Monsters of Myth": "LOMoM2",
  "Pathfinder Lost Omens Pathfinder Society Guide": "LOPSG2",
  "Pathfinder Lost Omens Rival Academies": "LORA2",
  "Pathfinder Lost Omens Shining Kingdoms": "LOSK2",
  "Pathfinder Lost Omens The Grand Bazaar": "LOGB2",
  "Pathfinder Lost Omens The Mwangi Expanse": "LOME2",
  "Pathfinder Lost Omens Tian Xia World Guide": "LOTXWG2",
  "Pathfinder Season of Ghosts Hardcover Compilation": "SoGHC2",
  "Pathfinder Society Intro: Year of Boundless Wonder": "PSI:YBW",
  "Pathfinder Society Intro: Year of Shattered Sanctuaries": "PSI:YSS",
  "Pathfinder Society Scenario #1-13: Devil at the Crossroads": "PS1-13:DC",
  "Pathfinder Society Scenario #1-20: The Lost Legend": "PS1-20:LL",
  "Pathfinder Society Scenario #1-21: Mistress of the Maze": "PS1-21:MM",
  "Pathfinder Society Scenario #1-22: Doom of Cassomir": "PS1-22:DC",
  "Pathfinder Society Scenario #2-03: Catastrophe's Spark": "PS2-03:CSS",
  "Pathfinder Society Scenario #2-07: The Blackros Deception": "PS2-07:BD",
  "Pathfinder Society Scenario #2-10: In Burning Dawn": "PS2-10:BD",
  "Pathfinder Society Scenario #2-14: Lost in Flames": "PS2-14:LF",
  "Pathfinder Society Scenario #3-06: Struck by Shadows": "PS3-06:SS",
  "Pathfinder Society Scenario #3-07: The Locked Lodge": "PS3-07:LL",
  "Pathfinder Society Scenario #3-09: The Secluded Siege": "PS3-09:SS",
  "Pathfinder Society Scenario #3-15: Cavern of Sundered Songs": "PS3-15:CSS",
  "Pathfinder Society Scenario #5-10: The Crocodile's Smile": "PS5-10:CSS",
  "Pathfinder Society Scenario #5-11: The Hidden Current": "PS5-11:HC",
  "Pathfinder Society Scenario #5-12: Mischief in the Maze": "PS5-12:MM",
  "Pathfinder Society Scenario #6-15: Lost and Forgotten": "PS6-15:LF",
  "Pathfinder Society Scenario #6-16: The Heart of the City": "PS6-16:HC",
  "Pathfinder Society Scenario #7-02: Shipyard Sabotage": "PS7-02:SS",
  "Pathfinder Society Scenario #7-08: The Haunted Corridor": "PS7-08:HC",
  "Pathfinder Society Scenario #7-19: The Lost Legacy": "PS7-19:LL",
  "Pathfinder Society Scenario 7-14: Brastlewark at War, Part 2: The Gnome Liberation": "PS:BW2GL",
  "Pathfinder Society: Season 1": "PSSn1",
  "Pathfnder Society Scenario #7-21: The Home of Empty Breath": "PS:HEB",
};
// ---------------------------------------------------------------------------
// tier 2 — the stopword-aware title-initialism generator
// ---------------------------------------------------------------------------

const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "by",
  "from",
  "into",
  "onto",
  "as",
  "is",
  "it",
  "its",
  "part",
]);

/** Splits on whitespace/hyphen/comma/colon/punctuation, drops stopwords
 * (case-insensitive), and takes the first alphanumeric character of every
 * remaining token, uppercased — the stakeholder's own `PS:ATG`-style rule
 * ("All That Glitters", no stopwords among the three, -> "ATG"). */
function initialism(title: string): string {
  const tokens = title.split(/[\s\-,:!?'’".()]+/u).filter((t) => t.length > 0);
  const letters: string[] = [];
  for (const token of tokens) {
    if (STOPWORDS.has(token.toLowerCase())) continue;
    const match = /[\p{L}\p{N}]/u.exec(token);
    if (match) letters.push(match[0].toUpperCase());
  }
  return letters.join("");
}

/** `<prefix> #<n>[-<n>]: <title>` — the shape every numbered PS/Bounty/AP
 * product shares. `undefined` when `book` doesn't have this shape at all
 * (the ~52 "Other"-bucket titles with no numbering, `OTHER_OVERRIDES`'
 * job). */
const NUMBERED_RE = /^(.*?)\s*#\s*([\d-]+):\s*(.+)$/u;

function parseNumbered(book: string): { prefix: string; num: string; title: string } | undefined {
  const m = NUMBERED_RE.exec(book);
  if (!m) return undefined;
  const [, prefix, num, title] = m;
  if (prefix === undefined || num === undefined || title === undefined) return undefined;
  return { prefix: prefix.trim(), num, title };
}

/** The long-form product-line prefixes this generator recognizes (tier 2's
 * own worked example set — NOT the short `PFS …` forms, which are tier 1's
 * numbered `PFS<n-nn>:` codes, see the file header). */
const PREFIX_CODE: Readonly<Record<string, string>> = {
  "pathfinder society scenario": "PS",
  "pathfinder society quest": "PSQ",
  "pathfinder society intro": "PSI",
  "pathfinder society special": "PSS",
  "pathfinder bounty": "PB",
  "pathfinder one-shot": "PO",
};

/** Generates a `PS:ATG`-style abbreviation for a numbered "Other"-bucket
 * book, or `undefined` if `book` doesn't have the numbered-colon shape at
 * all (or its prefix isn't one of the recognized product lines) — those
 * fall through to `OTHER_OVERRIDES` or, failing that, the full name. */
function generateOther(book: string): string | undefined {
  const parsed = parseNumbered(book);
  if (!parsed) return undefined;
  const { prefix, num, title } = parsed;
  const lower = prefix.toLowerCase();
  const code = PREFIX_CODE[lower];
  if (code !== undefined) return `${code}:${initialism(title)}`;
  // Plain numbered Adventure Path volumes ("Pathfinder #172: …",
  // "Pathfinder Adventure Path #219: …") have no single well-known per-title
  // short form (unlike a whole path's own name) — "AP<issue-number>" is the
  // systematic, collision-resistant fallback (num has no hyphen: PS/PSQ/etc.
  // use hyphenated season-numbers like "6-13", AP issue numbers never do).
  if ((lower === "pathfinder" || lower === "pathfinder adventure path") && !num.includes("-")) {
    return `AP${num}`;
  }
  return undefined;
}

/**
 * `abbreviateBook` — the one export every one of the 7 display sites calls
 * directly. `undefined` means "no abbreviation for this book" — callers
 * fall back to the full name, never render a blank.
 */
export function abbreviateBook(book: string): string | undefined {
  if (book === "unknown") return undefined; // the corpus's own no-source sentinel, never a real book
  const curated = CURATED_MAP[book];
  if (curated !== undefined) return curated;
  const override = OTHER_OVERRIDES[book];
  if (override !== undefined) return override;
  return generateOther(book);
}
