// The cards at the end of the sheet, one per feature and spell. On paper they print in a grid
// with cut lines (print.css).

import type { SheetCard } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";

import { Card } from "./Card";
import { Fold } from "./Fold";

export function Cards({
  cards,
  classIcon,
  id,
}: {
  cards: SheetCard[];
  classIcon: IconName;
  id?: string;
}) {
  return (
    <section className="sheet-section cards-section" id={id}>
      <h4 className="section-title">Your cards</h4>
      <p className="sheet-note">
        One for each special thing you can do. Keep them in front of you.
      </p>
      <Fold show={`Show your ${cards.length} cards`} hide="Hide the cards">
        <div className="cards">
          {cards.map((card) => (
            <Card key={card.id} card={card} classIcon={classIcon} />
          ))}
        </div>
      </Fold>
    </section>
  );
}
