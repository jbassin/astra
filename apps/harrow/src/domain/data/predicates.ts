// Ported verbatim from harrow's src/data/predicates.ts (import path → ../lib/types,
// and the build loop rewritten with Object.entries for astra's strict indexing —
// same output). The 29 named predicates that *title* a drawn reading; matched by the
// engine in ../lib/predicates. THESE LABELS ARE AUTHORITATIVE (the deck.parity-style
// source of truth) — they differ from prose summaries (e.g. "Devil Rising", not
// "Diabolic Rising").

import type { Predicate } from "../lib/types";

function haveTag(tag: string, count: number): Predicate {
  return { type: "haveTag", label: "", tag, count };
}

function haveTags(...tags: string[]): Predicate {
  return { type: "haveTags", label: "", tags };
}

function and(...predicates: Predicate[]): Predicate {
  return { type: "and", label: "", predicates };
}

function or(...predicates: Predicate[]): Predicate {
  return { type: "or", label: "", predicates };
}

export const PREDICATES: Predicate[] = (() => {
  const cards: { [label: string]: Predicate } = {
    "Dissonant Pull": haveTag("deck", 1),
    "Devil Rising": haveTag("deck:diabolic", 3),
    "Godhome Rising": haveTag("deck:divine", 3),
    "Slip Rising": haveTag("deck:aetheric", 3),
    "Mortal Rising": haveTag("deck:hierophant", 3),
    "Allied Outlook": or(
      and(haveTag("deck:diabolic", 2), haveTag("deck:aetheric", 2)),
      and(haveTag("deck:divine", 2), haveTag("deck:hierophant", 2)),
    ),

    "Frosted Outlook": haveTag("season:winter", 4),
    "Brisk Outlook": haveTag("season:autumn", 4),
    "Zyphric Outlook": haveTag("season:spring", 4),
    "Melted Outlook": haveTag("season:summer", 4),
    "Full Year": haveTags("season:winter", "season:summer", "season:spring", "season:autumn"),

    "Ashen Tide": haveTag("element:fire", 3),
    "Loaming Reach": haveTag("element:earth", 3),
    "Deepwater Pull": haveTag("element:water", 3),
    "Open Current": haveTag("element:air", 3),
    "Iron Confluence": haveTag("element:metal", 3),
    "Root Hold": haveTag("element:wood", 3),

    "Diamond Moment": haveTag("gem:diamond", 3),
    "Ruby Hour": haveTag("gem:ruby", 3),
    "Emerald Ground": haveTag("gem:emerald", 3),
    "Sapphire Pull": haveTag("gem:sapphire", 3),
    "Topaz Drift": haveTag("gem:topaz", 3),
    "Amethyst Watch": haveTag("gem:amethyst", 3),

    Thornladen: haveTag("flower:rose", 3),
    "Pale Vigil": haveTag("flower:lily", 3),
    "Strange Bloom": haveTag("flower:orchid", 3),
    "Turning Year": haveTag("flower:tulip", 3),
    "Still Voice": haveTag("flower:violet", 3),
    "Full Bloom": haveTags(
      "flower:rose",
      "flower:lily",
      "flower:orchid",
      "flower:tulip",
      "flower:violet",
    ),
  };

  const res: Predicate[] = [];
  for (const [label, pred] of Object.entries(cards)) {
    res.push({ ...pred, label });
  }

  return res;
})();
