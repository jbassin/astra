import { createFileRoute, notFound } from "@tanstack/react-router";

import { ARCHETYPES, STEPS } from "@/domain/character";
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

function archetypeLabel(id: string | undefined): string | undefined {
  return ARCHETYPES.find((a) => a.id === id)?.label;
}

function PlayerCard({ player }: { player: DmPlayerRow }) {
  const { answers } = player;
  const rows: Array<[string, string | undefined]> = [
    ["Archetype", archetypeLabel(answers.archetype)],
    ["Name", answers.name],
    ["Look", answers.look],
  ];
  return (
    <section className="dm-player">
      <h2>{player.name}</h2>
      <p className="dm-meta">
        <a href={player.link}>{player.link}</a>
        <br />
        Last saved {formatTime(player.updatedAt)} · {player.answered.length} of {STEPS.length} steps
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
