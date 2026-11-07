// One card per feature and spell: name, when to use it, what to roll and how often. On paper
// they print in a grid with cut lines (print.css).

import type { Character } from "@/domain/engine";
import { sheetCards } from "@/domain/sheet";

export function Cards({ c }: { c: Character }) {
  const cards = sheetCards(c);
  return (
    <section className="sheet-section cards-section">
      <h4 className="section-title">Your cards</h4>
      <p className="sheet-note">
        One for each special thing you can do. Keep them in front of you.
      </p>
      <div className="cards">
        {cards.map((card) => (
          <article key={card.id} className="card">
            <p className="card-kind">{card.kind}</p>
            <h5 className="card-name">{card.name}</h5>
            <p className="card-when">{card.when}</p>
            {card.uses && <p className="card-uses">{card.uses}</p>}
            {card.roll && <p className="card-roll">{card.roll}</p>}
            <p className="card-text">{card.text}</p>
            {card.meta && <p className="card-meta">{card.meta}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
