/**
 * Player identity — TS port of faerrin's `discord/src/roster.rs`, but reading
 * `ontology-being` instead of `players.toml` (the consolidation is done). A Discord
 * author snowflake resolves to the player's `player_id` (the load-bearing dice FK) +
 * display name + their PC in the **main** campaign (for the roll embed's character
 * title + class thumbnail). Unknown snowflakes don't resolve (the bot ignores them,
 * as faerrin does).
 */

import type { Being } from "@astra/ontology";

export interface Profile {
  /** Stable integer id — the dice-history FK (preserve verbatim). */
  playerId: number;
  playerName: string;
  /** Main-campaign PC, or the player name when they have no role there. */
  characterName: string;
  characterClass: string | null;
  /** Main-campaign edition — drives the thumbnail rules; null if unknown. */
  edition: string | null;
}

export class Roster {
  private constructor(
    private readonly bySnowflake: Map<string, Profile>,
    private readonly names: Map<number, string>,
  ) {}

  /** Build from the ontology: snowflake → profile, resolving the main-campaign role. */
  static fromBeing(being: Being): Roster {
    const main = being.campaigns.find((c) => c.main);
    const bySnowflake = new Map<string, Profile>();
    const names = new Map<number, string>();
    for (const p of being.players) {
      names.set(p.player_id, p.name);
      const role = main?.roles.find((r) => r.player === p.slug);
      const profile: Profile = {
        playerId: p.player_id,
        playerName: p.name,
        characterName: role?.character ?? p.name,
        characterClass: role?.character_class ?? null,
        edition: main?.edition ?? null,
      };
      for (const sf of p.snowflakes) bySnowflake.set(sf, profile);
    }
    return new Roster(bySnowflake, names);
  }

  /** Resolve a Discord author snowflake to their profile, if known. */
  get(snowflake: string): Profile | undefined {
    return this.bySnowflake.get(snowflake);
  }

  /** Display name for a `player_id` (dice-plot labels). */
  nameFor(playerId: number): string | undefined {
    return this.names.get(playerId);
  }
}
