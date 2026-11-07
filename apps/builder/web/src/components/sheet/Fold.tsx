// A part of the sheet that a phone folds away until asked: the button shows on a phone only
// (sheet.css), while a laptop and paper always show the content. The first render is the
// same on the server and in the browser (folded), so nothing mismatches on hydration.

import { type ReactNode, useState } from "react";

import { Icon } from "@/ui/Icon";

export function Fold({
  show,
  hide,
  children,
}: {
  show: string;
  hide: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fold" data-open={open ? "" : undefined}>
      <button
        type="button"
        className="fold-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? hide : show}</span>
        <Icon name="ui-chevron-down" className="fold-chevron" />
      </button>
      <div className="fold-body">{children}</div>
    </div>
  );
}
