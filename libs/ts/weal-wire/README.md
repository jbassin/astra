# @astra/weal-wire — the weal-bot to weal-overlay wire

The one Zod schema for the roll message weal-bot posts to weal-overlay. weal-bot
(`apps/weal/bot`) builds each message through `RollMessageSchema.parse` before it posts, and
weal-overlay's ingest (`apps/weal/overlay`) validates the body with the same schema. Both apps
import it, so a change here changes both sides at once; deploy them together
(`just deploy weal-bot weal-overlay`).

## API

- `RollMessageSchema` and its type `RollMessage`: `{v: 1, user, expression, total, is_crit,
  is_fumble, display}`. The snake_case field names are the wire's; weal-overlay maps them to its
  own camelCase feed event.
- `INGEST_PATH` (`/api/v1/roll`), the route weal-bot posts to. The full URL comes from
  `weal.feed-ws-url` in `config.kdl`.
- `TOKEN_HEADER` (`x-weal-token`), the header that carries the shared `weal_token` secret;
  `tokenHeaders(token)` builds it for weal-bot and `requestToken(headers)` reads it for
  weal-overlay.

## Traps

- **Keep the schema tolerant of extra keys.** `z.object` strips unknown keys, which lets an older
  bot that still sends a field the schema dropped keep working during a deploy. Don't make it
  `.strict()`.
- **The old `x-eerie-token` header is gone.** weal-overlay accepts only `x-weal-token`, so a
  weal-bot older than the weal-4 release (`3f724d84`) can no longer post rolls to it.
