# harrow — the Harrow tarot deck reader

harrow draws and reveals readings from the campaign's homebrew Harrow tarot deck, shows the card
gallery, and lists recorded spreads, at `https://harrow.iridi.cc`. It is a backend-less TanStack
Start SSR app on the strider template (see `apps/strider/README.md`): Compose service `harrow`,
port 10369, `service.name=astra.harrow`. It has no database, volume or secrets. Routes: `/` (draw a
reading), `/gallery`, `/spreads/` and `/spreads/history`.

## Content

`scripts/build-content.ts` parses `content/cards/<deck>/*.card` and `content/spreads/*.spread`
into `src/generated/{cards,spreads}.ts`. The two sources are coupled: spreads resolve card ids
against the parsed deck, so the deck is parsed first and shared through a closure.

To add or edit a card, change the `.card` file, then update
`src/domain/lib/__fixtures__/deck.golden.json` and the per-deck counts in `deck.parity.test.ts`.
That test asserts the generated deck equals the golden exactly, so any content change reds it
until the golden matches. Deploy with `just deploy harrow`.

## Traps

- **The draw must run only in the browser.** `/` renders the reading inside `<ClientOnly>` with a
  fixed "Shuffling" fallback, because `Math.random` on the server would never match the client.
  The other routes are deterministic and render fully on the server.
- **No `window.matchMedia` during render.** Use the SSR-safe `useIsMobile` hook
  (`src/lib/useIsMobile.ts`, server snapshot `false`); reveal timers run in effects.
- **Deck colours go through gothic's identity seam.** Each card root spreads
  `identityStyle(deck.color)` (sets `--identity-color`), and the `.deck-*` utilities in
  `globals.css` read that variable. Don't hardcode the four deck hues elsewhere.
- **Predicate labels are locked verbatim.** `predicates.test.ts` pins the reading-predicate labels
  exactly as the source deck names them; prose summaries differ, so copy labels from the test.
- **A clickable card is a `<button>`.** oxlint's a11y rules reject a `<div onClick>` even with a
  role and tabIndex; the native button also gives keyboard focus for free.
- **build-content imports domain code by relative path** (`../src/domain/lib/...`): it runs under
  Node, where the vite `@/` alias doesn't exist.
- **`/spreads/history` needs no layout file.** `spreads.index.tsx` and `spreads.history.tsx` are
  flat routes; TanStack synthesizes the `/spreads` parent.
