# Art Slots — Liturgy of the Iridite Vol. II

Every art placeholder in the Track B content, for the stakeholder to fill. Each slot is an HTML
comment (`<!-- ART SLOT [id]: ... -->`) with zero rendered height; replace the comment with the
real vol1-style `{{imageWrapper,...}}` block (or bare cover image) using the suggested wrapper
class. Position offsets in the comments are copied from vol1 usages of the same class as starting
points.

| id | file / location | suggested wrapper class | suggested subject |
|---|---|---|---|
| fm-cover | `frontmatter.md`, front cover page | bare full-bleed `![]` (vol1 cover idiom) or `fullPage` | A lone caster silhouetted against the crack in the firmament, spell-light of all eight schools braiding upward into the second sun |
| ch1-antillurgy | `chapters/antillurgy.md`, end of opener | `chapterSidebarRight` | A composed antillurgist mid-duel, black siphon-orb orbiting their head as it swallows an incoming lance of spellfire |
| ch2-chronomancy | `chapters/chronomancy.md`, end of opener | `chapterSidebarRight` | A memorial constellation rising from a dissolving body into the night sky above an Austrene observatory, mourners lit by starlight |
| ch3-gestalt | `chapters/gestalt.md`, end of opener | `chapterSidebarRight` | A druid mid-refinement — half-human silhouette with bone blades erupting at the joints, ghostly outlines of a hundred prior shapes layered behind them |
| ch4-kosmoturgy | `chapters/kosmoturgy.md`, end of opener | `chapterSidebarRight` | A battle-cleric on a shattered field, a translucent anvil of warped gravity descending from above her raised hand, the ground fracturing in a radial fault |
| ch5-memetics | `chapters/memetics.md`, end of opener | `chapterSidebarRight` | A communications-directorate office at night — pinboard of screamsheet clippings connected by golden thread, one thread leading into a listener's ear |
| ch6-mercuromancy | `chapters/mercuromancy.md`, end of opener | `chapterSidebarRight` | A card table mid-hand — a gambler with three sparkling stars orbiting her head, opposite a rival whose cards are quietly catching iridescent rot |
| ch7-planara | `chapters/planara.md`, end of opener | `chapterSidebarRight` | A planarist holding open a door-shaped portal on a freight dock, violet-white between-space light spilling across stacked cargo, dockworkers pointedly not looking inside |
| ch8-seraphic | `chapters/seraphic.md`, end of opener | `chapterSidebarRight` | Sixteen robed casters ringing an eight-pointed chalk star, the intertwined sliver of Ruin and slice of Preservation blazing at the center, the sky above them beginning to unspool into raw light |

Vol1 wrapper-class vocabulary for reference: `fullPage`, `fullSidebarLeft`, `fullSidebarRight`,
`fullSidebarTop`, `fullSidebarBottom`, `narrowSidebarBottom`, `chapterSidebarRight`,
`chapterSidebarRightHalfTop`. Vol1 pairs each with a nested `{{borderImage ![](url) {...}}}` and a
`{{caption,leftCaption|rightCaption,...}}` block — add captions when placing final art.
