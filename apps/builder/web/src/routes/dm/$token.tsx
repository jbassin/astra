import { createFileRoute, notFound } from "@tanstack/react-router";

import { CharacterSheet } from "@/components/sheet/CharacterSheet";
import { STEPS } from "@/domain/character";
import { buildCharacter } from "@/domain/engine";
import type { DmPlayerRow } from "@/server/builder";
import { getDmView } from "@/server/builderFns";
import { classTincture, hueStyle } from "@/ui/heraldry";
import { Crest, Icon } from "@/ui/Icon";

// A wrong or unset token throws the router-wide 404, the same page as any unknown URL, so the
// DM page never shows that it exists.
export const Route = createFileRoute("/dm/$token")({
  loader: async ({ params }) => {
    const players = await getDmView({ data: { token: params.token } });
    if (!players) throw notFound();
    return players;
  },
  staleTime: 0,
  component: DmComponent,
});

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
}

function PlayerCard({ player }: { player: DmPlayerRow }) {
  const c = buildCharacter(player.answers);
  const heraldry = classTincture(c.class?.id);
  const rows: Array<[string, string | undefined]> = [
    ["Name", c.name],
    ["Archetype", c.archetype?.label],
    ["Class", c.class?.name],
    ["Species", c.species?.name],
    ["Background", c.background?.name],
  ];
  const answered = STEPS.filter((s) => player.answered.includes(s.key));
  return (
    <section className="dm-player hued" style={hueStyle(heraldry)}>
      <header className="dm-player-head">
        <Crest icon={heraldry?.icon ?? "wax-seal"} className="dm-crest" />
        <div>
          <h2>{player.name}</h2>
          <p className="dm-saved">Last saved {formatTime(player.updatedAt)}</p>
        </div>
      </header>
      <div className="dm-progress">
        <progress
          className="dm-progress-bar"
          aria-label="Steps answered"
          max={Math.max(1, player.total)}
          value={player.answered.length}
        />
        <p className="dm-meta">
          {player.answered.length} of {player.total} steps answered
          {answered.length > 0 && ` (${answered.map((s) => s.label).join(", ")})`}
        </p>
      </div>
      <dl className="dm-answers">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value?.trim() ? value : "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="dm-link">
        <Icon name="ui-link" />
        <a href={player.link}>{player.link}</a>
      </p>
      <details className="dm-sheet">
        <summary>
          <span>{player.name}’s full sheet</span>
          <Icon name="ui-chevron-down" className="dm-sheet-chevron" />
        </summary>
        <CharacterSheet character={c} />
      </details>
    </section>
  );
}

function DmComponent() {
  const players = Route.useLoaderData();
  return (
    <main className="dm">
      <h1>Players</h1>
      <p className="lede">
        {players.length === 0
          ? "No players yet. Invite one with `just builder-invite <name>`."
          : `${players.length} invited. Reload to see the latest saves.`}
      </p>
      <div className="dm-players">
        {players.map((p) => (
          <PlayerCard key={p.link} player={p} />
        ))}
      </div>
    </main>
  );
}
