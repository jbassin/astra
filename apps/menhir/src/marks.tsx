/**
 * Drawn marks — the app's iconography, as inline SVG.
 *
 * WHY these are not emoji: the first design pass used 🏆/🥇/🥈/🥉/🔥, and on
 * the actual render they came out as tofu boxes (▯) because the rendering
 * environment had no emoji font. The host screen is SCREEN-SHARED off whatever
 * machine the GM happens to run, so an emoji is a coin flip on the single most
 * celebratory moment in the app. These are geometry, so they render everywhere
 * and they inherit `currentColor`, which lets the podium tint each medal.
 *
 * All marks are `aria-hidden`; the accessible text always lives in the sibling
 * element (heading, button label, or a `.visually-hidden` span).
 */

interface MarkProps {
  className?: string;
}

const common = {
  viewBox: "0 0 100 100",
  "aria-hidden": true,
  focusable: false,
} as const;

/** Reveal: the correct answer's badge. */
export function CheckMark({ className }: MarkProps) {
  return (
    <svg {...common} className={className}>
      <path
        d="M20 52 L40 72 L80 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Reveal: a wrong answer's badge (the kind, unmistakable version). */
export function CrossMark({ className }: MarkProps) {
  return (
    <svg {...common} className={className}>
      <path
        d="M28 28 L72 72 M72 28 L28 72"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Streak: a flame, replacing 🔥. */
export function FlameMark({ className }: MarkProps) {
  return (
    <svg {...common} className={className}>
      <path
        d="M50 6c14 18 24 27 24 44a24 24 0 0 1-48 0c0-9 4-15 9-21 1 7 5 11 9 12-3-13 0-25 6-35z"
        fill="currentColor"
      />
      <path d="M50 54c6 6 9 10 9 16a9 9 0 0 1-18 0c0-6 3-10 9-16z" fill="rgb(255 255 255 / 55%)" />
    </svg>
  );
}

/** Podium: the winner's crown. */
export function CrownMark({ className }: MarkProps) {
  return (
    <svg {...common} className={className}>
      <path
        d="M12 74 L6 26 L28 44 L50 12 L72 44 L94 26 L88 74 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <rect x="12" y="80" width="76" height="10" rx="5" fill="currentColor" />
    </svg>
  );
}

/**
 * The app's own emblem: a standing stone (a menhir) under a rising arc. Used
 * as the join-card / lobby anchor so the sparse waiting screens have a subject
 * instead of centred text floating in parchment.
 */
export function MenhirMark({ className }: MarkProps) {
  return (
    <svg {...common} className={className}>
      <path
        d="M34 96 C30 70 30 40 38 14 C42 4 58 4 62 14 C70 40 70 70 66 96 Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="M44 30 L56 30 M42 46 L58 46 M44 62 L56 62"
        stroke="var(--color-void)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
