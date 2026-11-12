// Lets a name on the sheet open its card. `CharacterSheet` provides which cards exist and how to
// open one; a name with a card renders as a button, any other name as plain text. Outside a
// provider nothing is linked, so a part of the sheet rendered alone still works.

import { createContext, type ReactNode, useContext } from "react";

export interface CardLinks {
  /** Whether the sheet has a card with this id. */
  has: (id: string) => boolean;
  /** Opens the card; `trigger` is the pressed button, which gets focus back on close. */
  open: (id: string, trigger: HTMLElement) => void;
}

const NONE: CardLinks = { has: () => false, open: () => undefined };

export const CardLinksContext = createContext<CardLinks>(NONE);

/**
 * A name that opens its card when pressed. `id` is the card's id; without one, or when the
 * sheet has no such card, the name stays plain text. Children are the name as shown.
 */
export function CardName({ id, children }: { id?: string; children: ReactNode }) {
  const links = useContext(CardLinksContext);
  if (!id || !links.has(id)) return children;
  return (
    <button
      type="button"
      className="card-link"
      aria-haspopup="dialog"
      onClick={(e) => links.open(id, e.currentTarget)}
    >
      {children}
    </button>
  );
}
