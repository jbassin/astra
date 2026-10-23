import { useRef } from "react";

import BannerDetail from "@/domain/components/BannerDetail/BannerDetail";
import FactionDetail from "@/domain/components/FactionDetail/FactionDetail";
import type { Faction } from "@/domain/lib/factions";
import type { Banner } from "@/domain/lib/layers";
import { useFocusTrap } from "@/lib/useFocusTrap";

import styles from "./Modal.module.css";

// The modal shows either a faction dossier or a banner (alliance) detail — both
// share the card chrome, differing only in body and accent color.
export type ModalContent =
  | { kind: "faction"; faction: Faction }
  | { kind: "banner"; banner: Banner; members: Faction[]; onSelectFaction: (f: Faction) => void };

interface ModalProps {
  content: ModalContent | null;
  onClose: () => void;
}

export default function Modal({ content, onClose }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, content !== null, onClose);

  if (!content) return null;

  const color = content.kind === "faction" ? content.faction.color : content.banner.color;
  const label =
    content.kind === "faction"
      ? `${content.faction.name} details`
      : `${content.banner.name} details`;

  return (
    <div
      className={styles.backdrop}
      data-testid="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- custom modal: the backdrop click closes and Escape is handled; a native <dialog> is a behaviour change */}
      <div
        ref={cardRef}
        className={styles.card}
        style={{ "--faction-color": color } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- custom modal: the backdrop click closes and Escape is handled; a native <dialog> is a behaviour change
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
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
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ✕
        </button>
        {content.kind === "faction" ? (
          <FactionDetail faction={content.faction} />
        ) : (
          <BannerDetail
            banner={content.banner}
            members={content.members}
            onSelectFaction={content.onSelectFaction}
          />
        )}
      </div>
    </div>
  );
}
