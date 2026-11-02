# Consolidate a wiki page

A brief for an agent that rewrites akasha wiki pages which have grown by accretion: each
edit added a paragraph at the end, and nothing rewrote the old ones. The result repeats
itself, contradicts itself, and keeps an opening that no longer sums the subject up.
Consolidating turns such a page back into one portrait. It is reorganisation, not new
writing: the page keeps exactly its facts.

Find candidates with `just heartwood-layered` (pages whose paragraphs come from many separate
commits; `--min N` sets the threshold, default 4). Work in your own clone of astra-data, never
in the live clone.

## What to do with each page

1. Read the page, then `git log -p --follow -- <page>` and `git blame` on it, so you know
   which paragraph came from which edit and in what order. Read the pages it links to when a
   sentence is unclear.
2. List the page's facts. Group them by topic (what the subject is, what it looks like,
   origin, what it wants, who it is tied to, where it stands now).
3. Rewrite the body so each topic is said once, in one place. The first paragraph says what
   the subject is now, as a reader meeting it for the first time needs it.
4. Check the result against your fact list and against the old text, sentence by sentence.

## Hard rules

- **Keep every fact.** Drop only exact repeats. A fact said twice in different words is
  merged into one sentence that keeps the details of both.
- **Add no facts.** No inference, no connecting tissue that claims something the old page
  did not. If two pages disagree, leave the other page alone.
- **Keep every link target.** Every `[[Target]]` on the old page must still appear at least
  once (repeat links to the same target may go). Don't add links to new targets.
- **Contradictions:** the later edit wins (the wiki's state rule), and a hand edit
  (commits titled "write in…", "fix(akasha)…", or "add…" by Josh) wins over a heartwood edit,
  because hand edits carry the GM's canon answers. If you cannot tell which is right, keep
  both readings and report it; don't guess.
- **Not a session log.** Recast "the party went, fought, found" narration as the state it
  left the world in or as lore ("X has been dead since the Weft killed him at RC3"). Keep
  every lasting fact the narration carried. Sentences about sessions or campaigns as such
  ("news to Sedecium", "in this session") become plain statements of the setting.
- **Frontmatter stays byte-for-byte**, including `date` and `campaigns`.
- **No moves, renames, deletes or new pages.** Edit only the pages you were given. The
  `Timeline` page is never edited.
- **Voice:** match the page's own tone and person. Keep good human sentences as they are
  when they already sit in the right place. Follow the heartwood no-slop list
  (`apps/heartwood/py/src/astra_heartwood/agent/instructions.py`): no dashes as
  punctuation, no "not X but Y", no lists of three for rhythm, no stock words, no hedges, no
  closing summary lines. Leave dashes the page already had.
- **Length:** person pages aim for about 300 words, but never cut a fact to get there.
  Report a page that is still long.

## Verify

- Validate the corpus:
  `node --import tsx libs/ts/vellum-lang/scripts/validate-corpus.ts --dir <clone>/akasha/content`
  (run from a code checkout).
- Compare link targets old and new; the new set must contain the old one.
- Report per page: words before and after, contradictions you resolved and how, anything you
  were unsure of, and whether it is still over length.

A reviewer who did not do the rewrite then compares each old and new page for dropped,
added or changed facts before anything is published.
