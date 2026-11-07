// The rest of the sheet: the six abilities as medallions, what you're good at, features with
// their uses, and gear, gold and languages. No ability-score math (Josh's call): just the
// results.

import type { Character } from "@/domain/engine";
import { ABILITIES } from "@/domain/imported";
import { goodAt, signed } from "@/domain/sheet";
import { ABILITY_ICON } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

function Abilities({ c }: { c: Character }) {
  return (
    <div className="detail-box abilities">
      <h4 className="section-title">Abilities</h4>
      <p className="sheet-note">
        For any other roll, add the number under the ability the DM names.
      </p>
      <dl className="ability-grid">
        {ABILITIES.map((a) => {
          const ab = c.abilities[a];
          return (
            <div key={a} className="ability" data-save={ab.saveProficient ? "" : undefined}>
              <dt>
                <Icon name={ABILITY_ICON[a]} className="ability-icon" />
                {ab.name}
              </dt>
              <dd className="ability-mod">{signed(ab.modifier)}</dd>
              <dd className="ability-score">score {ab.score}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function GoodAt({ c }: { c: Character }) {
  const saves = ABILITIES.filter((a) => c.abilities[a].saveProficient);
  return (
    <div className="detail-box">
      <h4 className="section-title">Things you’re good at</h4>
      <p className="sheet-note">
        When the DM asks for one of these, roll a d20 and add the number.
      </p>
      <ul className="skill-list">
        {goodAt(c).map((s) => (
          <li key={s.id}>
            <span className="skill-name">
              {s.name}
              {s.expertise && <span className="expert">expert</span>}
            </span>
            <strong className="skill-bonus">{signed(s.bonus)}</strong>
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

function Features({ c }: { c: Character }) {
  return (
    <div className="detail-box">
      <h4 className="section-title">Features</h4>
      <ul className="feature-list">
        {c.features.map((f) => (
          <li key={f.id}>
            <span>{f.name}</span>
            {f.uses && <span className="uses">{f.uses}</span>}
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
      <ul className="gear-list">
        {c.equipment.map((e) => (
          <li key={e.name}>
            <span>{e.name}</span>
            {e.quantity > 1 && <span className="qty">×{e.quantity}</span>}
          </li>
        ))}
        <li className="gold">
          <Icon name="two-coins" />
          <span>{c.gold} gold pieces</span>
        </li>
      </ul>
      <p className="sheet-note">Languages: {prof.languages.join(", ")}.</p>
      {trained.length > 0 && <p className="sheet-note">Trained with: {trained.join(", ")}.</p>}
    </div>
  );
}

export function Details({ c }: { c: Character }) {
  return (
    <>
      <section className="sheet-section">
        <Abilities c={c} />
      </section>
      <section className="sheet-section detail-grid">
        <GoodAt c={c} />
        <Features c={c} />
        <Gear c={c} />
      </section>
    </>
  );
}
