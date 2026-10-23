import { useEffect, useState } from "react";

// Ported verbatim from harrow's src/hooks/useCardReveal.ts. Sequenced reveal: the
// cards flip in REVEAL_ORDER, 500ms before the first then 1000ms between. Client-side
// (timers run only after hydration).
const REVEAL_ORDER = [0, 2, 3, 1, 4];
const INITIAL_REVEAL_DELAY_MS = 500;
const BETWEEN_REVEAL_DELAY_MS = 1000;

export function useCardReveal(count: number) {
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(count).fill(false));

  useEffect(() => {
    const nextIndex = REVEAL_ORDER.find((i) => !revealed[i]);
    if (nextIndex === undefined) return;
    const revealedCount = revealed.filter(Boolean).length;
    const delay = revealedCount === 0 ? INITIAL_REVEAL_DELAY_MS : BETWEEN_REVEAL_DELAY_MS;
    const timer = setTimeout(() => {
      setRevealed((prev) => prev.map((v, i) => (i === nextIndex ? true : v)));
    }, delay);
    return () => clearTimeout(timer);
  }, [revealed]);

  return { revealed, allRevealed: revealed.every(Boolean) };
}
