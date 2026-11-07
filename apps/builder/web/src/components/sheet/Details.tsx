// The rest of the sheet: what you're good at, the six abilities, features with their uses,
// and gear, gold and languages. No ability-score math (Josh's call): just the results.

import type { Character } from "@/domain/engine";
import { ABILITIES } from "@/domain/imported";
import { goodAt, signed } from "@/domain/sheet";

function GoodAt({ c }: { c: Character }) {
  const saves = ABILITIES.filter((a) => c.abilities[a].saveProficient);
  return (
    <div className="detail-box">
      <h4 className="section-title">Things you’re good at</h4>
      <p className="sheet-note">
        When the DM asks for one of these, roll a d20 and add the number.
      </p>
      <ul className="plain-list">
        {goodAt(c).map((s) => (
          <li key={s.id}>
            {s.name} <strong>{signed(s.bonus)}</strong>
            {s.expertise && <span className="uses"> (expert)</span>}
          </li>
        ))}
      </ul>
      <p className="sheet-note">
        Saving throws you’re trained in:{" "}
        {saves.map((a) => `${c.abilities[a].name} ${signed(c.abilities[a].save)}`).join(", ")}.
      </p>
    </div>
  );
}

function Abilities({ c }: { c: Character }) {
  return (
    <div className="detail-box">
      <h4 className="section-title">Abilities</h4>
      <p className="sheet-note">
        For any other roll, add the number under the ability the DM names.
      </p>
      <dl className="ability-grid">
        {ABILITIES.map((a) => (
          <div key={a} className="ability">
            <dt>{c.abilities[a].name}</dt>
            <dd>{signed(c.abilities[a].modifier)}</dd>
            <span className="ability-score">score {c.abilities[a].score}</span>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Features({ c }: { c: Character }) {
  return (
    <div className="detail-box">
      <h4 className="section-title">Features</h4>
      <ul className="plain-list">
        {c.features.map((f) => (
          <li key={f.id}>
            {f.name}
            {f.uses && <span className="uses"> · {f.uses}</span>}
          </li>
        ))}
      </ul>
      <p className="sheet-note">Each one has a card below with what it does.</p>
    </div>
  );
}

function Gear({ c }: { c: Character }) {
  const prof = c.proficiencies;
  const trained = [...prof.armor, ...prof.weapons, ...prof.tools];
  return (
    <div className="detail-box">
      <h4 className="section-title">Gear</h4>
      <ul className="plain-list">
        {c.equipment.map((e) => (
          <li key={e.name}>{e.quantity > 1 ? `${e.name} ×${e.quantity}` : e.name}</li>
        ))}
        <li>{c.gold} gold pieces</li>
      </ul>
      <p className="sheet-note">Languages: {prof.languages.join(", ")}.</p>
      {trained.length > 0 && <p className="sheet-note">Trained with: {trained.join(", ")}.</p>}
    </div>
  );
}

export function Details({ c }: { c: Character }) {
  return (
    <section className="sheet-section detail-grid">
      <GoodAt c={c} />
      <Abilities c={c} />
      <Features c={c} />
      <Gear c={c} />
    </section>
  );
}
