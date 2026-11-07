// One card per feature and spell, styled like a trading card: an emblem, the name, a ribbon
// for what kind of thing it is, chips for when to use it and how often, the roll, the text.
// On paper they print in a grid with cut lines (print.css).

import { CONTENT } from "@/domain/content";
import type { Character } from "@/domain/engine";
import { sheetCards } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";
import { classTincture, SLOT_ICON, schoolIcon, slotOfLabel } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

/** A spell card's school icon; a feature card carries its class's emblem. */
function emblem(id: string, classIcon: IconName): IconName {
  if (!id.startsWith("spell-")) return classIcon;
  return schoolIcon(CONTENT.spells[id.slice("spell-".length)]?.school);
}

export function Cards({ c }: { c: Character }) {
  const cards = sheetCards(c);
  const classIcon = classTincture(c.class?.id)?.icon;
  return (
    <section className="sheet-section cards-section">
      <h4 className="section-title">Your cards</h4>
      <p className="sheet-note">
        One for each special thing you can do. Keep them in front of you.
      </p>
      <div className="cards">
        {cards.map((card) => {
          const slot = slotOfLabel(card.when);
          return (
            <article key={card.id} className="card" data-kind={card.kind}>
              <header className="card-head">
                <span className="card-emblem">
                  <Icon name={emblem(card.id, classIcon ?? "wax-seal")} />
                </span>
                <h5 className="card-name">{card.name}</h5>
                <p className="card-kind">{card.kind}</p>
              </header>
              <div className="card-body">
                <p className="card-chips">
                  <span className="chip card-when" data-slot={slot}>
                    <Icon name={SLOT_ICON[slot]} />
                    {card.when}
                  </span>
                  {card.uses && <span className="chip card-uses">{card.uses}</span>}
                </p>
                {card.roll && (
                  <p className="card-roll">
                    <Icon name="dice-twenty-faces-twenty" />
                    <span>{card.roll}</span>
                  </p>
                )}
                <p className="card-text">{card.text}</p>
                {card.meta && <p className="card-meta">{card.meta}</p>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
