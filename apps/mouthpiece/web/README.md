# mouthpiece-frontend — the recap podcast's player website

mouthpiece-frontend lists the recap podcast episodes and plays them, with a speaker-attributed
transcript, at `https://mouthpiece.iridi.cc`. It is a TanStack Start SSR app on the strider
template (see `apps/strider/web/README.md`): Compose service `mouthpiece-frontend`, port 10366,
`service.name=astra.mouthpiece-frontend`. Routes: `/` (episode grid), `/episode/$id` (player and
transcript) and `/episodes.json` (a date → `{link, title}` map that the wiki and Discord link to).

## Data

- **Catalog (baked at build):** one file, `mouthpiece/snapshot/episodes-index.json` in the
  astra-data clone. mouthpiece-backend owns all shaping (sort order, arc titles, episode numbers,
  durations, the stripped and host-named transcript); this app only reads it and ports no helpers.
  `scripts/build-content.ts` splits it into `src/generated/episodes.ts` (the grid) and
  `transcripts.ts` (episode pages only), and writes `public/episodes.json`.
- **Audio (runtime):** `/audio/<id>.mp3` is served from `/ruby/data/astra-state/audio/mouthpiece`
  (config `mouthpiece-frontend.audio-dir`, mounted at `/audio`) through site-kit `staticMounts`,
  which answers Range requests so seeking works. Audio never enters the image.

## Operations

New episodes publish themselves: linguist-commit runs `just mouthpiece-publish` (regenerates the
snapshot in the astra-data clone), `just mouthpiece-seed` (copies new `<id>.episode.mp3` renders
to `<id>.mp3` in the audio dir) and `just deploy mouthpiece-frontend`. To do it by hand, run the
same three in that order.

Local dev: `just dev mouthpiece/web` builds from `fixtures/astra-data/` unless
`ASTRA_CONTENT_ROOT` points at a real clone. The fixture has no audio, so the player won't play.

## Traps

- **A plain `docker compose build mouthpiece-frontend` fails on purpose.** The build needs the
  `astra-data` build context, which only `deploy/deploy.sh` supplies. Use `just deploy`.
- **Episode ids contain dots** (`000.through-a-song-darkly.2026-5-25`). A single `episode/$id`
  segment captures them intact. Don't sort ids as strings: the backend's order (arc number, then
  numeric date) is the order.
- **The Player's listeners read live values through refs.** The audio and MediaSession listeners
  attach once at mount, so they read `scrubbingRef`/`durationRef`, not state. Reading state there
  lets `timeupdate` overwrite a scrub in progress and clamps skips to a stale duration.
- **The player's duration comes from the audio element** (`loadedmetadata`). The snapshot's
  `durationMs` can be 0 (the fixture's always is), so don't rely on it.
- **The scrub track needs `touch-action: none`**, or touch scrubbing scrolls the page.
- **MediaSession calls can throw.** Each `setPositionState`/`setActionHandler` call is wrapped in
  try/catch; keep it that way. Artwork must be PNG (the icons in `public/`), not SVG.
- **Resume position** is stored in localStorage as `caster:pos:<id>` and restored only when it is
  between 0 and duration − 1 s. Read it in an effect, never during render.
- **Host colours are the podcast hosts** (A, B, C), not the wiki's player colours.
