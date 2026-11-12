import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { PartyPicker } from "@/components/PartyPicker";
import { isPartyWord } from "@/domain/party";
import { getPartyPage } from "@/server/builderFns";

// A wrong phrase, no party file and a malformed phrase all throw the router-wide 404, the same
// page as any unknown URL, so the group page never shows that it exists.
export const Route = createFileRoute("/p/$word")({
  validateSearch: (search: Record<string, unknown>): { switch?: 1 } =>
    search.switch === 1 || search.switch === "1" ? { switch: 1 } : {},
  loader: async ({ params }) => {
    // A malformed phrase never reaches the server function (its length limit would throw a 500).
    if (!isPartyWord(params.word)) throw notFound();
    const players = await getPartyPage({ data: { word: params.word } });
    if (!players) throw notFound();
    return players;
  },
  staleTime: 0,
  component: PartyComponent,
});

function PartyComponent() {
  const { word } = Route.useParams();
  const { switch: switching } = Route.useSearch();
  const players = Route.useLoaderData();
  const navigate = useNavigate();
  const forward = useCallback(
    (id: string) => void navigate({ to: "/c/$id", params: { id }, replace: true }),
    [navigate],
  );
  const forgot = useCallback(
    () => void navigate({ to: "/p/$word", params: { word }, replace: true }),
    [navigate, word],
  );
  return (
    <PartyPicker
      word={word}
      players={players}
      switching={switching === 1}
      onForward={forward}
      onForgot={forgot}
    />
  );
}
