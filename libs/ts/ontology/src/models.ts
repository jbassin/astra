/**
 * The typed ontology-being schema over `being.canonical.json`, which Python's
 * `canonical_json()` writes from `being.kdl` (`just ontology-gen`). Keys are snake_case
 * here (not the usual TS camelCase) on purpose: they are Python's `model_dump()` keys.
 *
 * Every object is `.strict()` and every field is required, because the JSON always
 * carries every field: a field Python adds or drops fails the parity test in
 * `ontology.test.ts` instead of passing silently.
 */
import { z } from "zod";

const PlayerSchema = z
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

const HostLinesSchema = z
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

const PodcastPersonaSchema = z
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
    // the Astra worlds: heartwood ingests only campaigns set in one of these
    astra_worlds: z.array(z.string()),
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
