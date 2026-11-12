// `just builder-party [phrase]`: sets the party phrase in `<builder.data-dir>/party.json` and
// prints the group link `<public-origin>/p/<phrase>`. With no argument it picks three random
// words; with one it uses that phrase after checking its shape. Running it again replaces the
// phrase, so the old link stops working. Run from the app dir (the recipe does), so tsx
// resolves the `@/` alias.

import { randomInt } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isPartyWord } from "@/domain/party";

/** Plain, inoffensive lower-case words of 3 to 7 letters; three of them make a phrase. */
export const WORDS: readonly string[] = `
acorn amber anchor apple apron arrow aspen atlas autumn badge baker banjo barn basil basket beach
beacon beam bear beaver bell berry birch bird bison blanket bloom boat bolt bonnet book boot
bottle bounce branch brass bread breeze brick bridge bright brook broom brush bubble bucket
buckle bugle butter button cabin cable cactus cake camel candle canoe canyon cape card carpet
carrot castle cedar chair chalk charm cheese cherry chest chime cider cinder circle clay clever
cliff clock cloud clover coast cobweb cocoa comet copper coral cork cotton cove cozy crab crane
creek crest crisp crow crown crumb crystal cup curl daisy dance dawn deer delta denim desk dew
diamond dinner dolphin dome donkey dove dragon drift drum duck dune dusk eagle earth echo elbow
elder elm ember emerald engine fable falcon farm feast feather fern ferry fiddle field finch fire
flame flash flint flood flour flute foam fog forest fort fossil fox frost fudge gadget garden
garlic gate gem ginger glade glass globe glove goat gold goose grain grape grass gravel grove
gust hammer harbor harp harvest hat hawk hazel heart hedge heron hill hollow honey hood horn
horse hound hush icicle igloo indigo inlet iris iron island ivory ivy jade jam jar jelly jewel
jolly jungle kettle key kind kite kitten knot koala lace ladder lake lamb lamp lantern lark
laurel lava leaf lemon lilac lily linen lion lizard llama lodge log lotus lucky lunar lute magic
maple marble marsh meadow melon mint mirror mist mitten moat moon moss moth mouse mud mug mystic
nectar nest night noble nook north nutmeg oak oasis ocean olive onion opal orange orbit orchid
otter oven owl paddle paint palace palm pansy paper parade parrot pasta path peach pear pearl
pebble pepper pickle pie pilot pine pixel plain planet plum pocket pond pony poppy prism pudding
puffin pumpkin puppy quail quartz queen quest quiet quill quilt rabbit rain rainbow raven reed
reef ribbon ridge ring river robin rocket rose rowan ruby saddle saffron sage sail salmon sand
satin scarf seal shade shell shield shore silk silver sketch sky slate sled sleigh smile snow
sock solar sonnet spark spice spider spoon spring spruce squash squid star steam stone storm
straw stream sugar summer sun swan swift table talon tangle teapot tent thistle thorn thread
thunder tiger timber toast tower trail tree trout trumpet tulip tundra turtle twig umber unicorn
valley velvet vine violet walnut waltz wand water wave wheat whale wheel whisk willow wind window
winter wizard wolf wonder wool wren yarn yellow yodel zebra zephyr zest almond alpaca apricot
bamboo barley beetle biscuit bluff bobcat bramble brownie bunny cabbage calm cashew cattle celery
cheddar chess cloak cobble cookie cricket cruise cuckoo curry custard dapper dazzle dish dizzy
donut drizzle easel ebony eclipse elfin fawn fennel fiesta fig fizz flannel fluffy frog gala
gazelle giggle glider glow gnome goblet gopher granite gravy gumdrop hamster haven hearth hiker
hobby hopper huddle humble hummus jaunty jigsaw jogger jolt juggle juniper kayak kernel kiwi
ladle lagoon lemur lentil lively lobster locket lyric magnet mango mallow mantle mellow meteor
minnow mocha muffin nacho napkin nimble noodle nugget oatmeal ocelot orchard oriole oyster
pancake panda pasture pecan peony pewter picnic pigeon pillow pretzel pumice puzzle radish raisin
ranger relish rhubarb rooster rustic sandal scone seesaw sherbet sloth snowman sparrow sprout
stitch sundae sunny tadpole tassel teacup thimble tickle toffee tomato trellis truffle turnip
twirl waffle walrus wafer warbler wombat
`
  .split(/\s+/)
  .filter((w) => w !== "");

/** Three random words joined by hyphens, picked with `crypto.randomInt`. */
export function generatePhrase(words: readonly string[] = WORDS): string {
  const pick = () => words[randomInt(words.length)];
  return [pick(), pick(), pick()].join("-");
}

/** The phrase to use: the argument after checking its shape, or a generated one. Throws if bad. */
export function resolvePhrase(arg?: string): string {
  if (arg === undefined) return generatePhrase();
  if (!isPartyWord(arg)) {
    throw new Error(
      "the phrase must be 3 to 64 characters: a-z and 0-9 in groups joined by single hyphens",
    );
  }
  return arg;
}

async function main(): Promise<void> {
  const [{ loadConfig }, { partyLink }, { builderStore }] = await Promise.all([
    import("@astra/config"),
    import("@/server/builder"),
    import("@/server/store"),
  ]);
  let word: string;
  try {
    word = resolvePhrase(process.argv[2]);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.stderr.write("usage: just builder-party [phrase]\n");
    process.exit(2);
  }
  const cfg = loadConfig().builder;
  builderStore(cfg.dataDir).writeParty(word);
  process.stderr.write("Group link set. Any earlier group link no longer works. The link:\n");
  process.stdout.write(`${partyLink(cfg.publicOrigin, word)}\n`);
}

// Run as the entry point (compared by real path, so a symlinked path still counts), not when
// the tests import it.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  void main();
}
