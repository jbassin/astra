/**
 * Typed ontology-being schema — the SAME field set + snake_case keys as
 * `libs/py/ontology` (Pydantic), so `canonicalJson()` is byte-identical across
 * languages (the Phase-1 parity gate). Keys are snake_case here (not the usual TS
 * camelCase) on purpose: the canonical JSON must match Python's `model_dump()`.
 *
 * The `kdl.*` markers say where each field sits in `being.kdl` for the shared decoder
 * (`@astra/config` `decodeKdl`); an unmarked field is the child node of its kebab name.
 */
import { kdl } from "@astra/config";
import { z } from "zod";

export const PlayerSchema = z
  .object({
    slug: kdl.arg(z.string()),
    name: z.string(),
    player_id: z.number(), // load-bearing dice FK — preserve verbatim
    snowflakes: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    is_dm: z.boolean().default(false),
    is_admin: z.boolean().default(false),
    color: z.string(),
  })
  .strict();

export const RoleSchema = z
  .object({
    player: kdl.prop(z.string()),
    character: kdl.prop(z.string()),
    character_class: kdl.prop(z.string().nullable().default(null), "class"),
    descriptions: kdl.children(z.array(z.string()), "desc"),
  })
  .strict();

export const CampaignSchema = z
  .object({
    slug: kdl.arg(z.string()),
    name: z.string(),
    edition: z.string(),
    main: z.boolean().default(false),
    world: z.string(),
    roles: kdl.children(z.array(RoleSchema), "role"),
  })
  .strict();

export const HostLinesSchema = z
  .object({
    crit: kdl.children(z.array(z.string()), "crit"),
    good: kdl.children(z.array(z.string()), "good"),
    okay: kdl.children(z.array(z.string()), "okay"),
    bad: kdl.children(z.array(z.string()), "bad"),
    fumble: kdl.children(z.array(z.string()), "fumble"),
  })
  .strict();

const NO_LINES = { crit: [], good: [], okay: [], bad: [], fumble: [] };

export const WealHostSchema = z
  .object({
    slug: kdl.arg(z.string()),
    name: z.string(),
    color: z.string(),
    avatar: z.string(),
    // goodness → flavor lines (host_says); empty for bankless hosts (knife/master).
    lines: HostLinesSchema.default(() => ({ ...NO_LINES })),
  })
  .strict();

export const PodcastPersonaSchema = z
  .object({
    slug: kdl.arg(z.string()),
    name: z.string(),
    voice_id: z.string(),
    voice_name: z.string(),
    persona: z.string(),
  })
  .strict();

export const BeingSchema = z
  .object({
    players: kdl.children(z.array(PlayerSchema), "player"),
    guest_color: z.string(),
    campaigns: kdl.children(z.array(CampaignSchema), "campaign"),
    weal_hosts: kdl.children(z.array(WealHostSchema), "weal-host"),
    podcast_personas: kdl.children(z.array(PodcastPersonaSchema), "podcast-persona"),
  })
  .strict();

export type Player = z.infer<typeof PlayerSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type HostLines = z.infer<typeof HostLinesSchema>;
export type WealHost = z.infer<typeof WealHostSchema>;
export type PodcastPersona = z.infer<typeof PodcastPersonaSchema>;
export type Being = z.infer<typeof BeingSchema>;
