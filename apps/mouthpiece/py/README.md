# mouthpiece-backend — session transcript to recap-podcast episode

mouthpiece turns each session transcript into a recap podcast episode with three hosts
(seats A = Bram, B = Maeve, C = Nell; `podcast-persona` entries in `being.kdl`). It runs as a
Dagster graph on the shared `sessions` partitions. `session_digest` depends on linguist's
`session_transcripts` and `session_episode_summary`, and `mouthpiece_automation` launches the
graph once that summary gets a new materialization, for a session with a canonical transcript
that mouthpiece never tried:

1. `session_digest`: clean (windowed keep/drop of off-table talk) and enrich (synopsis and
   `wiki_refs`) into `digest.json`.
2. `session_brief`: the producer, a read-only DeepSeek RLM over the transcript, the live wiki,
   the chronicle and earlier scripts, writes `brief.json`. If it fails, there is no brief and
   the script falls back to wiki grounding plus continuity (a WARN, no page).
3. `session_script`: two passes on `mouthpiece.model` (GLM 5.3). Pass A writes the free-text
   conversation; Pass B typesets it into turns without improving it.
4. `session_audio_clips`: ElevenLabs Text-to-Dialogue (`mouthpiece.tts-provider`,
   `mouthpiece.elevenlabs-model`, `mouthpiece.elevenlabs-stability`).
5. `session_episode`: ffmpeg assembly, then it writes the `.last-rendered` sentinel.

Each session's files are in `/ruby/data/astra-state/mouthpiece/episodes/<date>/`; the audio
and transcript are id-prefixed (`<id>.episode.mp3`, `<id>.transcript.md`). The sentinel fires
`linguist-commit.path`, which runs `just mouthpiece-publish` (regenerates the catalog snapshot
in the astra-data clone), commits and pushes it, runs `just mouthpiece-seed` (copies mp3s to
`/ruby/data/astra-state/audio/mouthpiece`) and redeploys mouthpiece-frontend, which bakes the
snapshot. The only digest field read downstream is the top-level `synopsis`.

`mouthpiece-publish` refuses, and writes nothing, when the episodes dir is missing or the new
catalog has fewer episodes than the snapshot on disk (a wrong path or a half-mounted corpus).
Publish a deliberate removal with `just mouthpiece-publish --allow-shrink`.

## Resuming paid stages

`session_digest`, `session_script` and `session_audio_clips` carry the pipeline's shared
retry policy (dagster README, "Retries"). The two most expensive stages save their paid work
to the session dir as it finishes, so a retry, or a re-execution from failure, pays only for
what is missing.

- **TTS clips** (`tts/synth.py`). Each clip is `clips/<key>.<fmt>`, with its duration and
  the ElevenLabs `request_id` in `clips/<key>.json`. `<key>` is a hash of the provider's
  `cache_identity` (ElevenLabs: `elevenlabs:<model>:mp3:stability=<s>`), the render mode,
  the format, and each line's voice, rendered text (delivery tags and inline IPA included)
  and emotion; changing the model or stability re-renders every clip. A clip whose files
  exist is reused. So a second render of the same script renders nothing, and editing one
  turn re-renders only the chunk that holds it (in dialogue mode a chunk is several turns).
  Each dialogue chunk names the previous chunk's stored `request_id` in
  `previous_request_ids`, so the join sounds continuous. The neighbour is not in the key,
  so an edit never cascades into re-rendering the chunks after it.
  After a whole render succeeds, files in `clips/` the new manifest does not use are deleted,
  including clips under the old `NNN.<fmt>` names; a failed render deletes nothing.
  `manifest.json` lists the clip paths in order, relative to the session dir
  (`clips/<key>.<fmt>`), and `assemble.py` reads only those. Manifests written before
  2026-10-26 hold absolute paths; `assemble.py` still reads them as they are.
- **Script passes** (`script_cache.py`). Pass A's transcript and each Pass B segment's
  parsed tool output are saved to `script-cache/pass-a.<key>.txt` and
  `script-cache/pass-b.<key>.json` as each finishes. `<key>` hashes the whole request (model,
  `max_tokens`, system prompt and user content, which carries the cleaned transcript, digest,
  grounding or brief, roster and continuity), so a changed input or prompt calls the model
  again. A new Pass A changes every segment, so it misses every Pass B entry. A segment that
  fails to parse is not saved. `session_script` deletes `script-cache/` after it writes
  `script.json`, so a deliberate re-run with the same inputs gets a fresh script.

SigNoz shows the caches working: the counters `astra.mouthpiece.tts.clip_cache` and
`astra.mouthpiece.script.pass_cache` (attribute `outcome` = `hit` or `miss`; `pass` = `a` or
`b`), and the span attributes `mouthpiece.clips_reused`, `mouthpiece.clips_rendered` and
`mouthpiece.script.pass_{a,b}_{hit,miss}`. `astra.mouthpiece.tts.clips` counts only clips the
provider rendered.

## Operations

Renders are PAID (OpenRouter, ElevenLabs) and replace published content: flag them first.
Run long materializes detached (see `dagster/README.md`).

**Re-render audio only, keeping the script:**

1. Back up `script.json`, `manifest.json`, `<id>.episode.mp3` and `<id>.transcript.md` from
   the session dir; the render overwrites them. Optionally put a replacement `script.json`
   in place. Clips for unchanged lines are reused; to pay for fresh takes of the same
   lines, also move `clips/` aside.
2. Run:

   ```sh
   docker exec -d astra-dagster-code sh -c 'cd /opt/dagster/app && dagster asset materialize \
     -f definitions.py --select session_audio_clips,session_episode --partition <date> \
     > /ruby/data/astra-state/mouthpiece/episodes/.rerender-<date>.log 2>&1'
   ```

3. Confirm `manifest.json` says `"mode": "dialogue"` (real ElevenLabs).
4. The sentinel publishes within seconds. Verify the title on the episode page and that
   `/audio/<id>.mp3` answers 206 with the new byte size. Delete the log.

**Re-render script and audio:** `--select session_script,session_audio_clips,session_episode`.
This reuses `brief.json`; add `session_brief` for a fresh brief, and add `session_digest`
only when the transcript changed. To review before spending on TTS, run the LLM steps first,
read `script.json`, then run the audio steps. While a script render is in flight, the
15-minute timer can publish the new title with the old audio; the sentinel publish at the end
corrects it. A title in the snapshot is not proof of a render: check the mp3's size.

**Force wiki pages into a script.** When `brief.json` exists, the brief replaces wiki
grounding, so editing `wiki_refs` does nothing. This recipe has not been run since the
producer went live.

1. Move `brief.json` aside so `session_script` uses the fallback prompt.
2. Prepend the refs to `wiki_refs` in `digest.json`. Grounding takes pages in first-seen
   order under `GROUNDING_BUDGET` (24,000 chars). A ref matches a page title or basename,
   case-insensitively; a folder's `index` page matches the folder name; an unmatched ref
   drops silently. `session_script` reads the persisted digest, and the drift guard checks
   only the line count, so the edit sticks.
3. Dry-run on the host before spending:

   ```sh
   uv run python -c 'from pathlib import Path
   from astra_akasha_backend.corpus import load_corpus
   from astra_mouthpiece.grounding import ground_digest, pages_from_corpus
   from astra_mouthpiece.models import SessionDigest
   d = SessionDigest.model_validate_json(Path("/ruby/data/astra-state/mouthpiece/episodes/<date>/digest.json").read_text())
   for e in ground_digest(d, pages_from_corpus(load_corpus())): print(e.path, len(e.text))'
   ```

4. Materialize `session_script`, then the audio steps. The container reads the wiki live, so
   no rebuild is needed. Re-running `session_digest` later regenerates the digest without
   the forced refs.

**Producer experiment** (paid; writes only under `mouthpiece/experiments/`):
`just mouthpiece-experiment <date>`. **Prediction roundtable special:**
`just mouthpiece-roundtable dossier`, then `script <run-dir>`, then `render <run-dir>` (render
is LIVE). The special's script and digest carry `kind: "special"`; its id keeps the recap form
`<latest>-recap-of-<first>` so it stays unique and sorts as its arc's capstone, and its digest
is `{session_id, synopsis, kind}` with no `stats`. Never show the dossier or script to the GM; report stats
only. Both live in `apps/mouthpiece/tools` (`astra-mouthpiece-tools`, ADR 0023), which runs
from a host checkout and is not in the Dagster image. Its roundtable `render` imports this
package's private `assets._voices` and `resources.default_tts`, so keep their signatures.

## Traps

- **Secrets fail loud.** The TTS step raises when its key is empty (a container not started
  by `just deploy` has empty keys). There is no silent fallback to mock audio; `mock` runs
  only when `tts-provider` says so.
- **Retries re-bill what is not cached.** `session_digest` has no resume cache, so its retry
  pays for clean and enrich again. A deterministic ElevenLabs 4xx raises `TtsClientError`,
  which the asset turns into a non-retryable failure. Keep new provider errors
  non-retryable. The `llm` resource's client fails a step without the `RetryPolicy` rerun
  when it has spent its own retries on bad replies (`astra_llm.retry`) or the provider
  answered with a deterministic 4xx; only transport errors and 5xx get the rerun.
- **A bad saved Pass A sticks until the run succeeds.** If Pass B keeps failing on a
  transcript that Pass A got wrong, delete `script-cache/` before re-executing.
- **Tag-only turns** such as `[stunned silence]` make ElevenLabs return 400; `speakable_turns`
  skips turns with no speech.
- **Pronunciations live in `defs.kdl`.** `session_audio_clips` inlines `/ipa/` for the first
  use of each name per turn, taken from the `ipa=` property of an `entry` in
  `libs/py/lexicon/src/astra_lexicon/defs.kdl` (`entry "Faerrin" ipa="ˈfɛrɪn"`). Only the
  dialogue path (ElevenLabs) applies them; the materialization's `pronunciations` metadata
  counts the terms. An edit is live after a Dagster deploy, for episodes rendered after it.
- **GLM reasoning tokens share `max_tokens`.** Clean and enrich use
  `DEFAULT_CLEAN_MAX_TOKENS` (64,000); the script uses `DEFAULT_SCRIPT_MAX_TOKENS`
  (128,000). OpenRouter refuses to disable reasoning for GLM 5.3. `astra_llm`'s
  `DEFAULT_MAX_TOKENS` (16,000) applies unless a caller passes `max_tokens`.
- **Pass B is the slow part.** One structured call over a 6,000-word transcript stalls, so
  Pass B runs per segment of `PASS_B_CHUNK_WORDS` (2,200) and takes the title from the first
  segment. Pass A can take up to an hour on GLM 5.3, and GLM overshoots its word cap.
- **Timeouts.** `astra_llm` sets `REQUEST_TIMEOUT_S` (300) per attempt; only litellm's
  `timeout` can interrupt a blocked socket read. ElevenLabs calls use a 600 s timeout, and
  dialogue chunks are capped at 1,800 rendered chars for both `eleven_v3` and `eleven_v4`.
- **Chunk linking is best-effort.** Each dialogue chunk sends the previous chunk's
  `request_id` (from the `request-id` response header) as `previous_request_ids`; the API
  takes up to 3, mouthpiece sends 1. A chunk after a cached clip sends the ID stored in that
  clip's `<key>.json`, which can be days old, and how long ElevenLabs honours an old ID is
  unknown. If a linked request gets a 4xx, the provider retries it once without the link, so
  a stale ID costs the smooth join, never the render; a 4xx on the unlinked retry raises
  `TtsClientError` as before. Clips from before 2026-10-27 and mock clips have no ID, so
  the next chunk sends none.
- **The scoped ElevenLabs key lacks `user_read` and `voices_read`.** A 401 from `/v1/user` or
  the voices API does not mean the key is bad, and a 401 on synthesis can mean the account is
  out of credits. Check a voice id with one tiny text-to-speech call.
- **Voices come from today's `being.kdl`** (`load_hosts`), not from the hosts stored in
  `script.json`, so re-rendering an old script uses the current voices.
- **Hosts vary per episode.** Old scripts have two or three hosts, so `HostConfig.c` is
  optional. Seat C has held Pip ("the Instigator") and Nell ("the Newcomer"), so its role
  label is keyed by host name in `assemble.py` and in the frontend.
- **Nell is the newcomer seat:** she asks and is never written as wrong or corrected; Bram is
  the only host who misremembers. The skeptic role must not come back through seat C. With a
  brief in view she stops asking; the seat guard `newcomer_rule` in `producer/brief.py` ("only
  the two regular hosts have read these notes") counters it.
- **Drift guard.** `session_script` checks that the cleaned transcript's line count equals
  `digest.stats.lines`. After linguist regenerates a transcript, rerun `session_digest` first.
- **Scattered ASR noise survives the window filter.** `drop_hallucinations` removes the
  "you"/"thank you" family line by line, and fewer than `KEPT_LINES_FLOOR` (150) kept lines
  fails loudly.
- **Clip `duration_ms` is a placeholder** (about 60,000) for dialogue clips. ffprobe the files
  for real lengths; the frontend reads the audio's own metadata.
- **Episode dirs come in three shapes:** legacy `000.<slug>.<date>/`, recap dirs and live
  `<date>/`. Enumerate them through `episodes_index.parse_id`; `astra_sessions.date_sort_key`
  zeroes a non-digit day.
- **Episode kind.** `script.json` and `digest.json` carry `kind`: `session`, `recap` or
  `special` (`models.EpisodeKind`, since 0037 pipe-10). Only a `session` is numbered in the
  catalog, read as a prior episode, or needs digest `stats`. A file written before the field
  has none and reads as `recap` for a recap-form id, else `session` (`stored_kind`); no
  file needs rewriting. The catalog snapshot carries `kind` per episode too. Readers decide on
  the kind, never on the id.
- **`sessions.kdl` overrides** (`ontology/ontology-being/`, see `docs/runbook.md`, "Correct one
  session"). A `kind` there wins over the files, a `title` replaces the published catalog title
  (not `script.json`'s), and `skip=#true` keeps `mouthpiece_automation` from launching the
  session. The 2026-10-19 roundtable is marked `special` there, since its files predate `kind`.
- **A re-render rewrites its whole snapshot entry** (the transcript is inlined), so large
  snapshot diffs are expected.
- **dspy RLM output must be typed** (`brief: ProducerBrief`). A `str` output turns a submitted
  dict into a Python repr.
- **Deno in the Dagster image runs cache-only** (`ASTRA_DENO_CACHED_ONLY`). The build warms
  an unpinned `npm:pyodide`, so a rebuild can pick up a newer Pyodide; the build log prints
  the version.
- **Pricing is a static table** (`astra_llm.pricing`). An unknown model costs $0 silently, and
  table rows drift from OpenRouter's prices.
