/**
 * `sessions.kdl`, ontology-being's per-session overrides — the TS twin of
 * `astra_ontology.sessions` (`SessionOverride`, `SessionOverrides`).
 *
 *   session "2025-8-11" skip=#true { note "The Blue Remains: a different campaign." }
 *   session "2026-10-19-recap-of-2025-8-28" kind="special"
 *   session "2026-9-3" campaign="urth"
 *
 * Unlike being.kdl (read through the generated JSON), this file is small and hand-edited,
 * so it is parsed here at the edge with `@astra/config`'s KDL decoder and validated with
 * Zod. The rules match the Python schema: an unknown property, a malformed key, an empty
 * title or campaign, a repeated key, or `skip` with `campaign` fails the load, and a missing
 * file throws (reading no overrides would put a skipped session back into a show). Pass
 * `campaigns` (the being.kdl slugs) and a `campaign=` naming any other slug fails too.
 */

import { join } from "node:path";

import { decodeKdl, findRepoRoot, kdl, loadKdl, parseKdl } from "@astra/config";
import { z } from "zod";

const DATE = String.raw`\d{4}-\d{1,2}-\d{1,2}`;
const KEY = new RegExp(`^${DATE}(-recap-of-${DATE})?$`);

export const SessionOverrideSchema = z
  .object({
    key: kdl.arg(
      z
        .string()
        .regex(KEY, "not a session key (YYYY-M-D) or a recap token (<date>-recap-of-<date>)"),
    ),
    skip: kdl.prop(z.boolean().default(false)),
    kind: kdl.prop(z.enum(["session", "recap", "special"]).optional()),
    title: kdl.prop(z.string().trim().min(1, "title must not be empty").optional()),
    campaign: kdl.prop(z.string().trim().min(1, "campaign must not be empty").optional()),
    note: z.string().optional(),
  })
  .strict();

export const SessionOverridesSchema = z
  .object({
    sessions: kdl.children(z.array(SessionOverrideSchema).default([]), "session"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const s of value.sessions) {
      if (seen.has(s.key))
        ctx.addIssue({ code: "custom", message: `session "${s.key}" appears twice` });
      seen.add(s.key);
      if (s.skip && s.campaign !== undefined)
        ctx.addIssue({
          code: "custom",
          message: `session "${s.key}" is both skipped and filed under "${s.campaign}"`,
        });
    }
  });

export type SessionOverride = z.infer<typeof SessionOverrideSchema>;
export type SessionOverrides = z.infer<typeof SessionOverridesSchema>;

/** `<repo-root>/ontology/ontology-being/sessions.kdl` (throws outside a checkout). */
export function defaultSessionsFile(): string {
  return join(findRepoRoot(import.meta.dirname), "ontology", "ontology-being", "sessions.kdl");
}

/** Throw when a `campaign=` names a slug not in `campaigns` (the being.kdl slugs). */
export function checkSessionCampaigns(
  overrides: SessionOverrides,
  campaigns: Iterable<string>,
): SessionOverrides {
  const known = new Set(campaigns);
  for (const s of overrides.sessions) {
    if (s.campaign !== undefined && !known.has(s.campaign))
      throw new Error(
        `sessions.kdl: session "${s.key}" names campaign "${s.campaign}", which being.kdl does not list`,
      );
  }
  return overrides;
}

/** Parse and validate `sessions.kdl` text; with `campaigns`, an unknown slug throws. */
export function parseSessionOverrides(
  text: string,
  source = "sessions.kdl",
  campaigns?: Iterable<string>,
): SessionOverrides {
  const overrides = decodeKdl(SessionOverridesSchema, parseKdl(text, source));
  return campaigns === undefined ? overrides : checkSessionCampaigns(overrides, campaigns);
}

/** Load `sessions.kdl` (default: the checkout's); with `campaigns`, an unknown slug throws. */
export function loadSessionOverrides(
  path?: string,
  campaigns?: Iterable<string>,
): SessionOverrides {
  const overrides = decodeKdl(SessionOverridesSchema, loadKdl(path ?? defaultSessionsFile()));
  return campaigns === undefined ? overrides : checkSessionCampaigns(overrides, campaigns);
}

/** Session key → the campaign slug `sessions.kdl` files it under (`campaign=`). */
export function campaignOverrides(overrides: SessionOverrides): ReadonlyMap<string, string> {
  return new Map(
    overrides.sessions.flatMap((s) => (s.campaign === undefined ? [] : [[s.key, s.campaign]])),
  );
}

/** The keys marked `skip=#true`: sessions that belong to no show. */
export function skippedKeys(overrides: SessionOverrides): ReadonlySet<string> {
  return new Set(overrides.sessions.filter((s) => s.skip).map((s) => s.key));
}

/** `skippedKeys` of the loaded `sessions.kdl` (default: the checkout's). */
export function loadSkippedSessions(path?: string): ReadonlySet<string> {
  return skippedKeys(loadSessionOverrides(path));
}
