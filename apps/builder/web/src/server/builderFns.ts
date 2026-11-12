// The builder's `createServerFn` wrappers: the only module that reaches the file store and the
// config, so `node:fs` and the secret never enter the client bundle. Routes and components
// import these; the logic and its tests live in `builder.ts`.

import { loadConfig } from "@astra/config";
import { getLogger } from "@astra/observe";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Answers, PlayState } from "@/domain/character";

import {
  type DmPlayerRow,
  loadDmView,
  loadPlayerPage,
  type PlayerPage,
  savePlayerAnswers,
} from "./builder";
import { builderStore } from "./store";

function storeFromConfig() {
  return builderStore(loadConfig().builder.dataDir);
}

/** The configured DM token; a token that cannot be resolved counts as unset (the page 404s). */
function dmToken(): string | undefined {
  try {
    return loadConfig().builder.dmToken?.optional();
  } catch (err) {
    // A broken SOPS setup on a host run: fail closed and say why.
    getLogger("astra.builder").emit({
      severityText: "WARN",
      body: `builder.dm-token could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
    });
    return undefined;
  }
}

/** The player page for `/c/$id`; `null` (unknown id) becomes the route's 404. */
export const getPlayerPage = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().max(64) }))
  .handler(({ data }): PlayerPage | null => loadPlayerPage(storeFromConfig(), data.id));

/** Replaces a player's saved answers and play marks; rejects ids not on the roster. */
export const saveAnswers = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().max(64), answers: Answers, play: PlayState.optional() }))
  .handler(({ data }) => savePlayerAnswers(storeFromConfig(), data.id, data.answers, data.play));

/** Every player's picks for `/dm/$token`; `null` (wrong or unset token) becomes a plain 404. */
export const getDmView = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().max(256) }))
  .handler(({ data }): DmPlayerRow[] | null => {
    const cfg = loadConfig().builder;
    return loadDmView(builderStore(cfg.dataDir), {
      token: data.token,
      expected: dmToken(),
      publicOrigin: cfg.publicOrigin,
    });
  });
