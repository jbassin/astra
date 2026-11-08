// Background curation: one line of story each (from the 5etools background fluff), the
// builder's fills for "any tool" placeholders, and the Magic Initiate shortlists.

import type { CuratedBackground } from "../src/domain/curationTypes";

const TOOL_CHOICES = {
  anyGamingSet: "dice-set",
  anyArtisansTool: "smiths-tools",
  anyMusicalInstrument: "lute",
};
const EQUIPMENT_CHOICES = {
  setGaming: "dice-set",
  toolArtisan: "smiths-tools",
  instrumentMusical: "lute",
};

export const BACKGROUNDS: CuratedBackground[] = [
  {
    id: "acolyte",
    story:
      "You served in a temple, performing rites for your god and learning a little divine magic.",
    initiate: {
      cantrips: [
        "guidance",
        "sacred-flame",
        "light",
        "thaumaturgy",
        "spare-the-dying",
        "toll-the-dead",
        "word-of-radiance",
        "mending",
      ],
      spells: [
        "bless",
        "cure-wounds",
        "healing-word",
        "guiding-bolt",
        "shield-of-faith",
        "sanctuary",
      ],
    },
  },
  {
    id: "artisan",
    story:
      "You started out sweeping a craftsman's workshop and grew into a skilled maker yourself.",
    toolChoices: TOOL_CHOICES,
    equipmentChoices: EQUIPMENT_CHOICES,
  },
  {
    id: "charlatan",
    story:
      "You drifted from tavern to tavern selling comforting lies, fake potions and forged papers.",
  },
  {
    id: "criminal",
    story: "You made a living in dark alleys, cutting purses and breaking into shops.",
  },
  {
    id: "entertainer",
    story:
      "You grew up with travelling fairs, learning music and acrobatics, and you still crave applause.",
    toolChoices: TOOL_CHOICES,
    equipmentChoices: EQUIPMENT_CHOICES,
  },
  {
    id: "farmer",
    story: "You grew up working the land and tending animals, which made you patient and hardy.",
  },
  {
    id: "guard",
    story:
      "You stood long watches on a town wall, scanning for raiders outside and troublemakers inside.",
    toolChoices: TOOL_CHOICES,
    equipmentChoices: EQUIPMENT_CHOICES,
  },
  {
    id: "guide",
    story: "You grew up in the wilds, guiding travellers and picking up nature magic from druids.",
    initiate: {
      cantrips: [
        "guidance",
        "produce-flame",
        "druidcraft",
        "thorn-whip",
        "shillelagh",
        "starry-wisp",
        "thunderclap",
        "poison-spray",
      ],
      spells: ["goodberry", "healing-word", "entangle", "cure-wounds", "faerie-fire", "fog-cloud"],
    },
  },
  {
    id: "hermit",
    story:
      "You lived alone far from town, with only forest creatures for company and time to think.",
  },
  {
    id: "merchant",
    story:
      "You learned trade from a shopkeeper or caravan master, buying and selling across the land.",
  },
  {
    id: "noble",
    story: "You grew up in a castle among wealth and privilege, and learned how to lead at court.",
    toolChoices: TOOL_CHOICES,
    equipmentChoices: EQUIPMENT_CHOICES,
  },
  {
    id: "sage",
    story: "You travelled from library to library studying old books, even picking up some magic.",
    initiate: {
      cantrips: [
        "fire-bolt",
        "mage-hand",
        "light",
        "prestidigitation",
        "minor-illusion",
        "ray-of-frost",
        "shocking-grasp",
      ],
      spells: ["magic-missile", "shield", "mage-armor", "sleep", "burning-hands", "thunderwave"],
    },
  },
  {
    id: "sailor",
    story: "You lived at sea, riding out storms and swapping stories in ports all over the world.",
  },
  {
    id: "scribe",
    story:
      "You copied books and documents in a scriptorium, which gave you a careful eye for detail.",
  },
  {
    id: "soldier",
    story: "You trained for war as soon as you came of age, and battle is in your blood.",
    toolChoices: TOOL_CHOICES,
    equipmentChoices: EQUIPMENT_CHOICES,
  },
  {
    id: "wayfarer",
    story: "You grew up on the streets doing odd jobs to eat, but you never gave up hope.",
    equipmentChoices: EQUIPMENT_CHOICES,
  },
];
