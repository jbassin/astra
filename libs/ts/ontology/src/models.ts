/**
 * Typed ontology-being schema — the SAME field set + snake_case keys as
 * `libs/py/ontology` (Pydantic), so `canonicalJson()` is byte-identical across
 * languages (the Phase-1 parity gate). Keys are snake_case here (not the usual TS
 * camelCase) on purpose: the canonical JSON must match Python's `model_dump()`.
 */
import { z } from "zod";

export const PlayerSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    player_id: z.number(), // load-bearing dice FK — preserve verbatim
    snowflakes: z.array(z.string()),
    aliases: z.array(z.string()),
    is_dm: z.boolean(),
    is_admin: z.boolean(),
    color: z.string(),
  })
  .strict();

export const RoleSchema = z
  .object({
    player: z.string(),
    character: z.string(),
    character_class: z.string().nullable(),
    descriptions: z.array(z.string()),
  })
  .strict();

export const CampaignSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    edition: z.string(),
    main: z.boolean(),
    world: z.string(),
    roles: z.array(RoleSchema),
  })
  .strict();

export const HostLinesSchema = z
  .object({
    crit: z.array(z.string()),
    good: z.array(z.string()),
    okay: z.array(z.string()),
    bad: z.array(z.string()),
    fumble: z.array(z.string()),
  })
  .strict();

export const WealHostSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    color: z.string(),
    avatar: z.string(),
    // goodness → flavor lines (host_says); empty for bankless hosts (knife/master).
    lines: HostLinesSchema,
  })
  .strict();

export const PodcastPersonaSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    voice_id: z.string(),
    voice_name: z.string(),
    persona: z.string(),
  })
  .strict();

export const BeingSchema = z
  .object({
    players: z.array(PlayerSchema),
    guest_color: z.string(),
    campaigns: z.array(CampaignSchema),
    weal_hosts: z.array(WealHostSchema),
    podcast_personas: z.array(PodcastPersonaSchema),
  })
  .strict();

export type Player = z.infer<typeof PlayerSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type HostLines = z.infer<typeof HostLinesSchema>;
export type WealHost = z.infer<typeof WealHostSchema>;
export type PodcastPersona = z.infer<typeof PodcastPersonaSchema>;
export type Being = z.infer<typeof BeingSchema>;
