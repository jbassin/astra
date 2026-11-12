// A card in a modal dialog, opened by pressing its name on the sheet. It is the native
// `<dialog>`: Esc closes it, so does the close button and a press on the backdrop button behind the card, and the
// browser keeps focus inside while it is open. It is only mounted while a card is open, so the
// server and the first browser render agree (no dialog).

import { useEffect, useId, useRef } from "react";

import type { SheetCard } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";
import { Icon } from "@/ui/Icon";

import { Card } from "./Card";

export function CardDialog({
  card,
  classIcon,
  onClose,
}: {
  card: SheetCard;
  classIcon: IconName;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The effect runs once; it reads the latest `onClose` through this.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const headingId = `card-dialog-${useId().replaceAll(/[^\w-]/g, "")}`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let removeKey: (() => void) | undefined;
    // jsdom and old browsers have no `showModal`: the `open` attribute still shows the dialog.
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      // The fallback has no native Esc, so listen for it while the dialog is open.
      dialog.setAttribute("open", "");
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") closeRef.current();
      };
      document.addEventListener("keydown", onKey);
      removeKey = () => document.removeEventListener("keydown", onKey);
    }
    return () => {
      removeKey?.();
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);

  return (
    // Esc closes a native dialog and fires `close`.
    <dialog ref={ref} className="card-dialog" aria-labelledby={headingId} onClose={onClose}>
      {/* The click target behind the card: a press outside the card closes the dialog. */}
      <button
        type="button"
        className="card-dialog-backdrop"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="card-dialog-body">
        <Card card={card} classIcon={classIcon} headingId={headingId} />
        <button type="button" className="card-dialog-close" aria-label="Close" onClick={onClose}>
          <Icon name="ui-x" />
        </button>
      </div>
    </dialog>
  );
}
