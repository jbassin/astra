import { createFileRoute, Link } from "@tanstack/react-router";

import { ARCHETYPES } from "@/domain/character";
import { ARCHETYPE_HERALDRY, hueStyle } from "@/ui/heraldry";
import { Crest, Icon } from "@/ui/Icon";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const HOW = [
  { icon: "crossed-swords", text: "Pick the kind of hero that sounds most fun." },
  { icon: "spell-book", text: "Make a few choices. Each one explains itself in plain words." },
  { icon: "scroll-quill", text: "Get a sheet that tells you what to roll, with cards to cut out." },
] as const;

function HomeComponent() {
  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-crests" aria-hidden="true">
          {ARCHETYPES.map((a) => (
            <span key={a.id} className="home-crest hued" style={hueStyle(ARCHETYPE_HERALDRY[a.id])}>
              <Crest icon={ARCHETYPE_HERALDRY[a.id].icon} />
            </span>
          ))}
        </div>
        <h1>Make your first hero</h1>
        <p className="lede">
          This site walks you through making your first D&amp;D character, one choice at a time. You
          don’t need a rulebook: every choice explains itself, and at the end you get a sheet that
          tells you what to roll.
        </p>
      </section>
      <section className="home-paths">
        <div className="home-path">
          <Icon name="ui-link" className="home-path-icon" />
          <h2>Got a link from your DM?</h2>
          <p>
            To make your real character, open the personal link your DM sent you. It saves as you
            go, so the same link picks up where you left off.
          </p>
        </div>
        <div className="home-path">
          <Icon name="ui-flask-conical" className="home-path-icon" />
          <h2>Just curious?</h2>
          <p>Make a practice character. Nothing in test mode is saved.</p>
          <Link to="/test" className="button">
            Try a practice character
            <Icon name="ui-chevron-right" />
          </Link>
        </div>
      </section>
      <ol className="home-how">
        {HOW.map((h) => (
          <li key={h.icon}>
            <Icon name={h.icon} className="home-how-icon" />
            <span>{h.text}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
