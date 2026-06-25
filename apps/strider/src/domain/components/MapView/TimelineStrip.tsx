import { useMemo } from "react";
import type { Layer } from "@/domain/lib/regions";
import { slotInk, slotOpacity, visibleEntries } from "@/domain/lib/timeline";
import styles from "./TimelineStrip.module.css";
import { useTypewriter } from "./useTypewriter";

interface TimelineStripProps {
  layers: Layer[];
  index: number; // 0 .. layers.length
  isPlaying: boolean;
  dwellMs: number;
  onIndexChange: (next: number) => void;
  onSkipToEnd: () => void;
  onReplay: () => void;
}

export default function TimelineStrip({
  layers,
  index,
  isPlaying,
  dwellMs,
  onIndexChange,
  onSkipToEnd,
  onReplay,
}: TimelineStripProps) {
  const total = layers.length;
  const atStart = index <= 0;
  const atEnd = index >= total;
  // Offer "replay the full log" only when at rest on the current state; while
  // playing or parked mid-log the action jumps straight to now.
  const showReplay = !isPlaying && atEnd;

  const entries = useMemo(() => visibleEntries(layers, index), [layers, index]);

  const topEntry = entries[0] ?? null;
  const topMessage = topEntry?.message ?? "";
  const topKey = topEntry?.key ?? "";

  const typedChars = useTypewriter({
    text: topMessage,
    key: topKey,
    active: topEntry?.kind === "layer",
    dwellMs,
  });

  const stillTyping = topEntry?.kind === "layer" && typedChars < topMessage.length;
  const cursorVisible = topEntry?.kind === "null" || stillTyping || (isPlaying && !atEnd);

  return (
    <div className={styles.strip} role="group" aria-label="Vox-log timeline">
      <div className={styles.headerRibbon}>
        <span className={styles.headerHair} aria-hidden="true" />
        <span className={styles.headerTitle}>++ VOX-LOG OF THE STRIDER ++</span>
        <span className={styles.headerHair} aria-hidden="true" />
      </div>

      <span className={styles.cornerTL} aria-hidden="true">
        +
      </span>
      <span className={styles.cornerTR} aria-hidden="true">
        +
      </span>
      <span className={styles.cornerBL} aria-hidden="true">
        +
      </span>
      <span className={styles.cornerBR} aria-hidden="true">
        +
      </span>

      <div className={styles.log}>
        {entries.map((entry, slot) => {
          const display =
            entry === topEntry && entry.kind === "layer"
              ? entry.message.slice(0, typedChars)
              : entry.message;
          const showCursor = slot === 0 && cursorVisible;
          return (
            <div
              key={entry.key}
              className={styles.entry}
              data-slot={slot}
              style={{
                transform: `translateY(${slot * 1.35}rem)`,
                opacity: slotOpacity(slot),
                color: slotInk(slot),
              }}
            >
              <span className={styles.lead}>+</span>
              <span className={styles.date}>{entry.date}</span>
              <span className={styles.sep}>+</span>
              <span className={styles.message}>
                {display}
                {showCursor && <span className={styles.cursor}>+</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => onIndexChange(index - 1)}
          disabled={atStart}
          aria-label="Previous layer"
        >
          ◀
        </button>

        <span className={styles.scrubRow}>
          <input
            type="range"
            className={styles.scrubber}
            min={0}
            max={total}
            step={1}
            value={index}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            aria-label="Scrub the vox-log timeline"
          />
          <span className={styles.count}>
            {index}/{total}
          </span>
        </span>

        <button
          type="button"
          className={styles.arrow}
          onClick={() => onIndexChange(index + 1)}
          disabled={atEnd}
          aria-label="Next layer"
        >
          ▶
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={showReplay ? onReplay : onSkipToEnd}
          aria-label={showReplay ? "Replay the full vox-log" : "Skip to the current state"}
        >
          {showReplay ? "⟲ REPLAY" : "SKIP ⏭"}
        </button>
      </div>
    </div>
  );
}
