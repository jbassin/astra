# builder — the D&D 5e character builder

builder (`@astra/builder`) walks Josh's five new players through making a D&D 5e (2024 rules)
character. Each player gets a private, unguessable link; their answers save on the server as they
go, so they can come back and change them. Josh sees everyone's picks on a DM page. It is an SSR
frontend on the site-kit preset (`libs/ts/site-kit/README.md`), running as the Compose service
`builder` on port 10375 (`service.name=astra.builder`) behind Caddy at `https://builder.iridi.cc`.
The plan and checklist are in `thoughts/shared/research/2026-11-06-character-builder.md`.

The game content is still a stub: the flow asks for an archetype (warrior, scoundrel, mage,
healer), a name and a look. Classes, species, backgrounds, spells and the final sheet come next.

## Routes

- `/`: a short welcome that points players at their link.
- `/c/<id>`: a player's builder. An id not on the roster gets a friendly 404. Every change saves
  after a short pause (the `saveAnswers` server function); the page shows Saving…, Saved or an
  error.
- `/dm/<token>`: every invited player with their link, last save, progress and answers. A wrong
  or missing token, or no token configured, gets the same plain 404 as any unknown URL.

## Operations

- **Invite a player:** `just builder-invite <name>`. It adds the player to the roster with a new
  random id (128 bits, base64url) and prints their link. The running server reads the roster on
  every request, so the link works at once. Run it on the host from any checkout after
  `pnpm install`; `ASTRA_DATA_ROOT` points it at another data root.
- **DM link:** `https://builder.iridi.cc/dm/<token>`, where the token is the SOPS secret
  `builder_dm_token` (config `builder.dm-token`, env `BUILDER_DM_TOKEN`, injected by
  `just deploy`). Read it with
  `SOPS_AGE_KEY_FILE=deploy/sops/age.key sops -d --extract '["builder_dm_token"]' deploy/sops/secrets.enc.yaml`.
  Generate the token with at least 128 random bits (`openssl rand -base64 24 | tr '+/' '-_'`):
  nothing throttles guesses, so its length is the only defence.
- Dev server: `just dev builder/web`. Set `ASTRA_DATA_ROOT` to a scratch dir first, or it reads
  and writes the live data under `/ruby/data/astra-state/builder`.
- Deploy: `just deploy builder`.

## Data

Everything lives under `builder.data-dir` (`/ruby/data/astra-state/builder`):

- `roster.json`: `[{ id, name, createdAt }]`, written only by `just builder-invite`.
- `characters/<id>.json`: `{ schemaVersion: 1, updatedAt, answers }`, written by the server.
  `answers` is the zod schema `Answers` in `src/domain/character.ts`; new steps add optional
  fields there, and a change that breaks old files bumps `schemaVersion`.

Every write goes to a temp file in the same directory and is renamed into place. The server
saves only for ids on the roster, and an id must match the 22-character base64url shape before
it reaches a path. The container writes through an identical-path bind mount, as uid 1000;
`deploy.sh init_artifacts` creates `builder/characters/`. The nightly backup copies the dir (it
takes every data-root dir by default).

## Telemetry

- `astra.builder.saves{outcome=ok|error}` counts saves; each save is a `builder.save` span.
- A failed save logs WARN (a stale tab or a bad link is a user problem, and ERROR pages Discord).
- Browser RUM through the scaffold's `src/observe/rumConfig.ts`.

## Traps

- **The theme follows the system setting.** `src/styles/tokens.css` is copied from akasha's and
  keeps both dark blocks (`data-theme="dark"` and the media query); they must stay identical.
  There is no theme switch, so nothing sets `data-theme` yet.
- **The SSR smoke stubs the environment.** `src/ssrSmoke.test.ts` points `ASTRA_DATA_ROOT` at a
  temp dir with one player and sets `BUILDER_DM_TOKEN`, because the built server reads the real
  `config.kdl`. Without the token the DM check would try `sops -d`, which CI cannot run.
- **SSR HTML splits text around expressions** (`Hi, <!-- -->Ada`), so smoke assertions match the
  pieces, not the joined sentence.
- The cross-app frontend traps are in `libs/ts/site-kit/README.md` and
  `libs/ts/gothic/README.md`.
