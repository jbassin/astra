/**
 * The four Kahoot answer identities (D31-6) — shape+color double encoding.
 * `SHAPES`/`Shape` are the server's own source of truth (`./schema`); this
 * module only adds the client-side glyph + color rendering, index-mapped the
 * same way `game.ts`'s `shapeFor(index)` is (option 0 = triangle, 1 =
 * diamond, 2 = circle, 3 = square) so a player's tap position always matches
 * the shape the host screen shows for the same option index.
 */
import { SHAPES, type Shape } from "./schema";

export { SHAPES };
export type { Shape };

export function shapeAt(index: number): Shape {
  const shape = SHAPES[index];
  if (!shape) throw new Error(`menhir: option index ${index} has no shape (max 4 options)`);
  return shape;
}

interface ShapeGlyphProps {
  shape: Shape;
  className?: string;
}

/** A decorative SVG glyph for one answer shape — `aria-hidden`, the
 * accessible label always lives on the enclosing button/element. */
export function ShapeGlyph({ shape, className }: ShapeGlyphProps) {
  const common = {
    viewBox: "0 0 100 100",
    className,
    "aria-hidden": true,
    fill: "currentColor",
  } as const;
  switch (shape) {
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="50,8 94,90 6,90" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <polygon points="50,4 96,50 50,96 4,50" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="44" />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="10" y="10" width="80" height="80" rx="10" />
        </svg>
      );
  }
}
