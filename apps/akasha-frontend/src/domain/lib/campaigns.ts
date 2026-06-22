/**
 * Campaign matcher — ported from faerrin `pkg/content/scripts/lib/campaigns.ts`
 * (the content heuristic that routes each session into its `Script/<campaign>/`
 * folder), adapted to astra's `@astra/ontology` Campaign shape: roles are a flat
 * `Role[]` of `{player, character, character_class}` (vs faerrin's
 * `roles: Record<player, CharacterRole[]>`), and `role.player` is the player SLUG
 * (e.g. "jorge") so billing is re-keyed to the display NAME (e.g. "Jorge") to match
 * the transcript's `user.name`.
 *
 * Behaviour is byte-faithful: count non-GM character-name string hits across the
 * transcript; the FIRST campaign — in being.kdl order — whose total clears
 * `MATCH_THRESHOLD` wins; else null → Unsorted. This is URL-parity-critical (N7):
 * a wrong match misfiles the session's page. Guarded by the slug-parity fixture.
 */
import type { Campaign, Role } from "@astra/ontology";
import type { Transcript } from "./transcript";

// faerrin `pkg/content/scripts/config.ts` campaign.matchThreshold. A content-heuristic
// tuning constant (not deploy config), so it lives in code like slug.ts's regexes.
const MATCH_THRESHOLD = 15;

/** GM roles are excluded from the keyword set (faerrin excluded "Gamemaster"/
 *  "Dungeon Master" by name; astra marks them character_class="gm"). */
const isGm = (r: Role): boolean => r.character_class === "gm";

export interface MatchedCampaign {
  campaign: Campaign;
  /** display name → the character that player is billed as this session (name toggle). */
  billing: Record<string, string>;
}

function characterNames(campaign: Campaign): string[] {
  return campaign.roles.filter((r) => !isGm(r)).map((r) => r.character);
}

/**
 * @param nameBySlug player slug → display name (from being.players), so `billing`
 *   is keyed by the same name the transcript's `user.name` carries.
 */
export function matchCampaign(
  transcript: Transcript,
  campaigns: Campaign[],
  nameBySlug: Map<string, string>,
): MatchedCampaign | null {
  for (const campaign of campaigns) {
    const keywords = characterNames(campaign);
    const hits: Record<string, number> = {};
    for (const k of keywords) hits[k] = 0;
    for (const { text } of transcript.script) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) hits[keyword] = (hits[keyword] ?? 0) + 1;
      }
    }

    let sum = 0;
    for (const v of Object.values(hits)) sum += v;
    if (sum < MATCH_THRESHOLD) continue;

    // Bill each player as their highest-hit character (GM stays GM), keyed by name.
    const byPlayer = new Map<string, Role[]>();
    for (const r of campaign.roles) {
      const list = byPlayer.get(r.player) ?? [];
      list.push(r);
      byPlayer.set(r.player, list);
    }
    const billing: Record<string, string> = {};
    for (const [playerSlug, roles] of byPlayer) {
      const name = nameBySlug.get(playerSlug) ?? playerSlug;
      const gm = roles.find(isGm);
      if (gm) {
        billing[name] = gm.character;
        continue;
      }
      let best = -1;
      let bestChar = roles[0]?.character ?? name;
      for (const r of roles) {
        const h = hits[r.character] ?? -1;
        if (h > best) {
          best = h;
          bestChar = r.character;
        }
      }
      billing[name] = bestChar;
    }
    return { campaign, billing };
  }
  return null;
}

/** The character a speaker is billed as this session, or their real name if the
 *  session matched no campaign (or they aren't a billed player). */
export function characterFor(realName: string, match: MatchedCampaign | null): string {
  return match?.billing[realName] ?? realName;
}
