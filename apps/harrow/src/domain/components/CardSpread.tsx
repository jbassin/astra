import type { DrawnCard, Spread } from "@/domain/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";

import { FlipCard } from "./FlipCard";

// Ported from harrow's src/components/CardSpread.tsx. Two changes: the local
// matchMedia state → the shell's SSR-safe useIsMobile (Decision D — no hydration
// mismatch on the desktop-circle vs mobile-stack layout); the amber connectors
// re-toned to gothic accent-amber. Strict-index accesses asserted (same geometry).
interface CardSpreadProps {
  drawnCards: DrawnCard[];
  spread: Spread;
}

const W = 860;
const H = 980;
const GOLD = "#f0b46e"; // gothic --color-accent-amber

// 5 positions on a circle (r=335, cx=430, cy=519), equally spaced at 72°.
const POSITIONS: Array<{ x: number; y: number }> = [
  { x: 627, y: 790 }, // 0: Foundation (lower-right)
  { x: 233, y: 790 }, // 1: Challenge  (lower-left)
  { x: 111, y: 416 }, // 2: Past       (upper-left)
  { x: 749, y: 416 }, // 3: Future     (upper-right)
  { x: 430, y: 184 }, // 4: Outcome    (top)
];

// Third element: true = require both endpoints revealed before drawing.
const LINES: Array<[number, number, boolean?]> = [
  [4, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [0, 4, true],
];

const CX = 430;
const CY = 519;
const R = 335;
const circumference = 2 * Math.PI * R;
const P0 = POSITIONS[0] as { x: number; y: number };
const foundationAngle = Math.atan2(P0.y - CY, P0.x - CX) * (180 / Math.PI);

// Foundation, Past, Future, Challenge, Outcome — matches REVEAL_ORDER.
const MOBILE_ORDER = [0, 2, 3, 1, 4];

export function CardSpread({ drawnCards, spread }: CardSpreadProps) {
  const allRevealed = drawnCards.length === 5 && drawnCards.every((c) => c.isRevealed);
  const isMobile = useIsMobile(768);

  if (isMobile) {
    return (
      <div className="flex flex-col gap-6 items-center w-full py-4">
        {MOBILE_ORDER.map((posIdx) => {
          const drawn = drawnCards[posIdx];
          if (!drawn) return null;
          return (
            <FlipCard
              key={drawn.card.id}
              card={drawn.card}
              orientation={drawn.orientation}
              isRevealed={drawn.isRevealed}
              position={spread.positions[posIdx]}
              size="md"
            />
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      <svg
        width={W}
        height={H}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter
            id="star-glow"
            filterUnits="userSpaceOnUse"
            x="-10"
            y="-10"
            width={W + 20}
            height={H + 20}
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={GOLD}
          strokeOpacity={0.35}
          strokeWidth={1.5}
          strokeLinecap="round"
          filter="url(#star-glow)"
          strokeDasharray={circumference}
          strokeDashoffset={allRevealed ? 0 : circumference}
          transform={`rotate(${foundationAngle}, ${CX}, ${CY})`}
          style={{ transition: "stroke-dashoffset 1.0s ease-in-out 1.2s" }}
        />
        {LINES.map(([a, b, requireBoth], i) => {
          const aRevealed = drawnCards[a]?.isRevealed;
          const bRevealed = drawnCards[b]?.isRevealed;
          const visible = requireBoth ? aRevealed && bRevealed : aRevealed || bRevealed;
          const fromB = requireBoth || (bRevealed && !aRevealed);
          const from = (fromB ? POSITIONS[b] : POSITIONS[a]) as { x: number; y: number };
          const to = (fromB ? POSITIONS[a] : POSITIONS[b]) as { x: number; y: number };
          const len = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={GOLD}
              strokeOpacity={0.35}
              strokeWidth={1.5}
              strokeLinecap="round"
              filter="url(#star-glow)"
              strokeDasharray={len}
              strokeDashoffset={visible ? 0 : len}
              style={{ transition: "stroke-dashoffset 0.5s ease-in-out 0.5s" }}
            />
          );
        })}
      </svg>

      {drawnCards.map((drawn, index) => {
        const { x, y } = POSITIONS[index] as { x: number; y: number };
        return (
          <div
            key={drawn.card.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: "translate(-50%, calc(-50% - 20px))",
            }}
          >
            <FlipCard
              card={drawn.card}
              orientation={drawn.orientation}
              isRevealed={drawn.isRevealed}
              position={spread.positions[index]}
              size="lg"
            />
          </div>
        );
      })}
    </div>
  );
}
