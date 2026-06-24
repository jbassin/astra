---
timestamp: "863-07-18T04:14:00Z"
message: "Radiant Arms Base established."
changes:
  - op: add
    slug: "radiant-arms-base"
    name: "Radiant Arms Base"
    faction: "radiant-arms"
    hexes:
      - [-23, 5]
      - [-22, 4]
      - [-21, 4]
      - [-22, 5]
      - [-21, 5]
      - [-20, 4]

  - op: skein-add
    slug: "final-caliber"
    name: "Final Caliber"
    faction: "radiant-arms"
    hex: [-22, 5]
    symbol: "symbols/final-caliber.svg"

  - op: skein-connect
    from: "final-caliber"
    to: "ears-that-hear-the-truth"
---
