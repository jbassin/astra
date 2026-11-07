import { createFileRoute, notFound } from "@tanstack/react-router";

import { CharacterSheet } from "@/components/sheet/CharacterSheet";
import { STEPS } from "@/domain/character";
import { buildCharacter } from "@/domain/engine";
import type { DmPlayerRow } from "@/server/builder";
import { getDmView } from "@/server/builderFns";

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
  const species =
    c.species && (c.species.option ? `${c.species.name} (${c.species.option})` : c.species.name);
  const rows: Array<[string, string | undefined]> = [
    ["Name", c.name],
    ["Archetype", c.archetype?.label],
    ["Class", c.class?.name],
    ["Species", species],
    ["Background", c.background?.name],
  ];
  return (
    <section className="dm-player">
      <h2>{player.name}</h2>
      <p className="dm-meta">
        <a href={player.link}>{player.link}</a>
        <br />
        Last saved {formatTime(player.updatedAt)} · {player.answered.length} of {player.total} steps
        answered
        {player.answered.length > 0 &&
          ` (${STEPS.filter((s) => player.answered.includes(s.key))
            .map((s) => s.label)
            .join(", ")})`}
      </p>
      <dl className="dm-answers">
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt>{label}</dt>
            <dd>{value?.trim() ? value : "—"}</dd>
          </div>
        ))}
      </dl>
      <details className="dm-sheet">
        <summary>{player.name}’s full sheet</summary>
        <CharacterSheet character={c} />
      </details>
    </section>
  );
}

function DmComponent() {
  const players = Route.useLoaderData();
  return (
    <main className="wrap wide">
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
