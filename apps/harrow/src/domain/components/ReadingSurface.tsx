import { useEffect, useState } from "react";

import { PREDICATES } from "@/domain/data/predicates";
import { createReading } from "@/domain/lib/draw";
import { matchedPredicate } from "@/domain/lib/predicates";
import type { Reading } from "@/domain/lib/types";
import { useCardReveal } from "@/domain/lib/useCardReveal";

import { CardSpread } from "./CardSpread";
import { DrawButton } from "./DrawButton";
import { FortuneDisplay } from "./FortuneDisplay";

// Ported from harrow's ReadingView, with the useReducer view-state collapsed into
// route-local state (Decision E/F — readings stay ephemeral, no context). The draw
// (Math.random) runs only here, client-side (the / route mounts this behind
// <ClientOnly>, Decision D). A new reading remounts ReadingContent (keyed on id) so
// the reveal sequence restarts — mirroring the source's `key={reading.id}`.
export function ReadingSurface() {
  const [reading, setReading] = useState<Reading>(() => createReading());
  return (
    <ReadingContent
      key={reading.id}
      reading={reading}
      onDrawAgain={() => setReading(createReading())}
    />
  );
}

function ReadingContent({ reading, onDrawAgain }: { reading: Reading; onDrawAgain: () => void }) {
  const { revealed, allRevealed } = useCardReveal(reading.drawnCards.length);
  const [shimmering, setShimmering] = useState(false);
  useEffect(() => {
    setShimmering(allRevealed);
  }, [allRevealed]);

  const drawnCards = reading.drawnCards.map((dc, i) => ({
    ...dc,
    isRevealed: revealed[i] ?? false,
  }));
  const matched = allRevealed
    ? matchedPredicate(
        PREDICATES,
        drawnCards.map((dc) => dc.card),
      )
    : null;

  return (
    <div className="flex flex-col items-center gap-6 py-8 px-4">
      <div className="text-center">
        <h2
          className={`font-display text-lg tracking-widest uppercase mb-1 ${
            shimmering ? "shimmer-text" : "text-accent-amber/80"
          }`}
          onAnimationEnd={() => setShimmering(false)}
        >
          {!matched ? reading.spread.label : matched.label}
        </h2>
      </div>

      <div className="overflow-hidden w-full flex justify-center">
        <CardSpread drawnCards={drawnCards} spread={reading.spread} />
      </div>

      <FortuneDisplay
        drawnCards={drawnCards}
        spread={reading.spread}
        combinedFortune={reading.combinedFortune}
        isVisible={allRevealed}
      />

      {allRevealed && (
        <div className="mt-4 flex gap-3">
          <DrawButton label="Draw Again" onClick={onDrawAgain} />
        </div>
      )}
    </div>
  );
}
