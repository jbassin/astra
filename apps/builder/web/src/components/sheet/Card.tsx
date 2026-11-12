// One card, styled like a trading card: an emblem, the name, a ribbon for what kind of thing it
// is, chips for when to use it and how often, the roll, the text. The grid at the end of the
// sheet and the dialog a pressed name opens both draw it.

import { CONTENT } from "@/domain/content";
import type { SheetCard } from "@/domain/sheet";
import type { IconName } from "@/generated/icons";
import { SLOT_ICON, schoolIcon, slotOfLabel } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

/** A spell card's school icon; a feature card carries its class's emblem. */
function emblem(id: string, classIcon: IconName): IconName {
  if (!id.startsWith("spell-")) return classIcon;
  return schoolIcon(CONTENT.spells[id.slice("spell-".length)]?.school);
}

export function Card({
  card,
  classIcon,
  headingId,
}: {
  card: SheetCard;
  classIcon: IconName;
  /** Set on the name when something (the dialog) is labelled by it. */
  headingId?: string;
}) {
  const slot = slotOfLabel(card.when);
  return (
    <article className="card" data-kind={card.kind}>
      <header className="card-head">
        <span className="card-emblem">
          <Icon name={emblem(card.id, classIcon)} />
        </span>
        <h5 className="card-name" id={headingId}>
          {card.name}
        </h5>
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
}
