/**
 * The player-key character sheet (`query-player`): resolves one player character or
 * familiar and builds the one section asked for. The section builders live in
 * `./playerSummary` (summary, notes), `./playerStats` (stats, skills), `./playerSpells`
 * and `./playerItems` (feats, inventory). Builders return plain data; the server renders
 * the markdown.
 */
import {
  BridgeError,
  type BridgeToolHandlers,
  QueryPlayerParams,
  type QueryPlayerResult,
} from "@astra/portal-shared";

import { sourceOf } from "../pf2e";
import { buildFeats, buildInventory } from "./playerItems";
import { buildSpells } from "./playerSpells";
import { buildSkills, buildStats } from "./playerStats";
import { buildNotes, buildSummary } from "./playerSummary";
import { resolveByName } from "./shared";

/** `query-player`'s actor resolution: `uuid` (a full `Actor.<id>` uuid, or a bare
 * world actor id — either form accepted) resolves via `fromUuid`; `name` resolves via
 * {@link resolveByName} across every world actor (the player-character type predicate is checked
 * AFTER resolution, uniformly for both paths, so an unambiguous name match against an
 * NPC still resolves — and then gets the correct typed `not-a-player-character`
 * refusal, not a confusing `not-found`). The params schema's own `.refine()` already
 * guarantees exactly one of `name`/`uuid` is present. */
async function resolvePlayerActor(params: QueryPlayerParams): Promise<FoundryDocumentLike> {
  if (params.uuid !== undefined) {
    const uuid = params.uuid.includes(".") ? params.uuid : `Actor.${params.uuid}`;
    const doc = await fromUuid(uuid);
    if (!doc) throw new BridgeError("not-found", `not found: ${uuid}`);
    return doc;
  }
  // The schema refine guarantees `name` is set whenever `uuid` isn't.
  return resolveByName(Array.from(game.actors.values()), params.name as string);
}

/** `query-player` — resolves the target actor, refuses
 * anything that isn't `type ∈ {character, familiar}` with the typed
 * `not-a-player-character` error, then builds exactly the requested `section`. */
async function handleQueryPlayer(rawParams: unknown): Promise<QueryPlayerResult> {
  const params = QueryPlayerParams.parse(rawParams);
  const doc = await resolvePlayerActor(params);
  if (doc.type !== "character" && doc.type !== "familiar") {
    throw new BridgeError(
      "not-a-player-character",
      `"${doc.name}" is a ${doc.type ?? "unknown-type"} actor — query-player only serves ` +
        "player characters and familiars",
    );
  }
  const src = sourceOf(doc);
  switch (params.section) {
    case "summary":
      return buildSummary(doc, src);
    case "stats":
      return buildStats(doc);
    case "skills":
      return buildSkills(doc);
    case "spells":
      return buildSpells(doc, src, params.entry, params.rank);
    case "feats":
      return buildFeats(src);
    case "inventory":
      return buildInventory(src);
    case "notes":
      return buildNotes(src);
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const playerHandlers = {
  "query-player": handleQueryPlayer,
} satisfies Partial<BridgeToolHandlers>;
