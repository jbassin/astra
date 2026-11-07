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
        { id: "guidance", recommended: true },
        { id: "sacred-flame", recommended: true },
        { id: "light" },
        { id: "thaumaturgy" },
        { id: "spare-the-dying" },
        { id: "toll-the-dead" },
        { id: "word-of-radiance" },
        { id: "mending" },
      ],
      spells: [
        { id: "bless", recommended: true },
        { id: "cure-wounds", recommended: true },
        { id: "healing-word" },
        { id: "guiding-bolt" },
        { id: "shield-of-faith" },
        { id: "sanctuary" },
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
        { id: "guidance", recommended: true },
        { id: "produce-flame", recommended: true },
        { id: "druidcraft" },
        { id: "thorn-whip" },
        { id: "shillelagh" },
        { id: "starry-wisp" },
        { id: "thunderclap" },
        { id: "poison-spray" },
      ],
      spells: [
        { id: "goodberry", recommended: true },
        { id: "healing-word", recommended: true },
        { id: "entangle" },
        { id: "cure-wounds" },
        { id: "faerie-fire" },
        { id: "fog-cloud" },
      ],
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
        { id: "fire-bolt", recommended: true },
        { id: "mage-hand", recommended: true },
        { id: "light" },
        { id: "prestidigitation" },
        { id: "minor-illusion" },
        { id: "ray-of-frost" },
        { id: "shocking-grasp" },
      ],
      spells: [
        { id: "magic-missile", recommended: true },
        { id: "shield", recommended: true },
        { id: "mage-armor" },
        { id: "sleep" },
        { id: "burning-hands" },
        { id: "thunderwave" },
      ],
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
