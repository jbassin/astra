// A card in a modal dialog, opened by pressing its name on the sheet. It is the native
// `<dialog>`: Esc closes it, so does the close button and a click on the backdrop, and the
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
  const headingId = `card-dialog-${useId().replaceAll(/[^\w-]/g, "")}`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // jsdom and old browsers have no `showModal`: the `open` attribute still shows the dialog.
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- <dialog> is the modal itself; Esc and the Close button are the keyboard ways out, the click is only the backdrop's
    <dialog
      ref={ref}
      className="card-dialog"
      aria-labelledby={headingId}
      // Esc closes a native dialog and fires `close`; the fallback has neither.
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      // The dialog itself is only the backdrop's edge: a click that lands on it, not on the
      // card or the button, is a click outside.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card-dialog-body">
        <Card card={card} classIcon={classIcon} headingId={headingId} />
        <button type="button" className="card-dialog-close" aria-label="Close" onClick={onClose}>
          <Icon name="ui-x" />
        </button>
      </div>
    </dialog>
  );
}
