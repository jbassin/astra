# scribe — Craig recordings to session audio and a raw transcript

scribe is the head of the session pipeline. Craig drops each recording as a zip on a Google
Drive FUSE mount; the host `craig-sync` timer copies new zips into `scribe.incoming-path`
(`/ruby/data/astra-state/scribe/incoming`), because Docker cannot bind-mount the FUSE mount.
In Dagster, `craig_drop_sensor` adds one partition per session date to the pipeline's shared
`sessions` set (the only code that adds keys) and runs `session_tracks` → `session_audio` ∥ `session_transcript` → `session_cleanup`. The
outputs `scribe/data/saved/<date>/{audio.mp3,script.json}` are the handoff to linguist
(`linguist.ingest-saved-dir` must equal this dir) and to `just akasha-seed`. Transcription is
Groq Whisper (`scribe.model`, `groq/whisper-large-v3`).

## Operations

- **Sync by hand:** `just craig-sync`. Install the 5-minute timer with
  `just units-install craig`.
- **Wedged Drive mount:** craig-sync bounds every mount access without waiting on it, so a
  hung mount makes the unit fail (and page) instead of hanging in `activating`, which would
  stop the timer from re-arming. A process blocked on the mount shows `D request_wait_answer`
  in `ps -o stat,wchan`; `timeout` cannot kill it. The astra watchdog remediates the mount.
- **Blocking checks.** `single_recording`, `no_undated_recording` (on `session_tracks`) and
  `transcript_not_empty` (on `session_transcript`, at least `MIN_TRANSCRIPT_SEGMENTS` 100)
  fail the run and keep linguist from launching; see the dagster README, "Blocking checks".
  - `transcript_not_empty` failed: fix the tracks' cause, then re-execute the run from failure.
  - A tracks check failed (two recordings, or an undated one): remove or merge the extra zip
    in the incoming dir, then launch a **fresh** scribe run for the partition. Do not
    re-execute: a re-execution copies the old run's `astra/craig-zip` tag and fails if that
    zip was the one you removed or replaced. A fresh run has no tag, so `session_tracks`
    picks the zip by the sensor's rule. In the UI, open Assets, select `session_tracks`,
    `session_audio`, `session_transcript` and `session_cleanup`, choose "Materialize
    selected" and pick the session's partition (checks run with them). From the CLI:

    ```sh
    docker exec -d astra-dagster-code sh -c 'cd /opt/dagster/app && dagster asset \
      materialize -f definitions.py --partition <date> \
      --select session_tracks,session_audio,session_transcript,session_cleanup \
      > /ruby/data/astra-state/scribe/tmp/.rescribe-<date>.log 2>&1'
    ```

    The run costs about $2 of Groq. Once `transcript_not_empty` passes, the linguist
    sensor launches as usual, since linguist was never tried for the session.
- **Undated zip.** A dated name is `<guild>_<channel>_<date>_<id>` (four `_` fields, date
  third). An undated zip takes its session from its `info.txt` `Start time:` (UTC date), so
  `craig_drop_sensor` registers and runs it like a dated one; a dated name of the same
  recording wins when both exist. An undated zip with no readable start date never becomes a
  session: the sensor logs one WARN naming the file and lists it in the tick's skip reason.
  To recover one, hard-link it in the incoming dir under a dated name, for example
  `ln craig-<rec>-<key>_<key>.aac.zip craig_<rec>_2026-10-5_00-00-00.aac.zip`. Keep the
  original name too, or craig-sync downloads it again.
- **Second recording.** Craig makes a new recording when it is restarted mid-session. If the
  second zip arrives after the session's scribe run, no check sees it: `craig_drop_sensor`
  logs one WARN naming the session, the zip it was transcribed from and the extra zip, and
  lists the extra zip in the skip reason. Nothing merges the two (their tracks have separate
  clocks). Decide which recording is the session; if the transcribed one is wrong, move it to
  `incoming/rejected/`, launch a fresh scribe run (see "Blocking checks") and re-run the
  stages downstream that should change (see "Re-transcribe a session"; paid). To keep both
  halves, merge them by hand into one zip first. The skip reason lists the extra zip until
  it leaves the incoming dir.
- **Re-transcribe a session.** Only the zip in the incoming dir is needed. Materialize all
  four scribe assets for the partition: `session_cleanup` deletes the extracted tracks, so a
  single tail cannot rerun without `session_tracks`. The sensors do not re-launch downstream
  stages that already ran, so add the ones to redo to the same run: linguist
  `session_transcripts,session_episode_summary`, then mouthpiece `session_digest,session_script`
  (digest before script, or the drift guard fails) and the audio steps. The dependencies
  order them. Cost is about $2 of Groq and 9 minutes.
- **Re-run a session from scratch:** see `dagster/README.md`.

## Traps

- **The run names its zip.** `craig_drop_sensor` tags each run with the zip it chose
  (`astra/craig-zip`, a file name in the incoming dir), and `session_tracks` extracts that
  zip and records it as `zip` metadata. A re-execution keeps the tag. If the tagged zip is
  gone or carries another date, the run fails rather than picking another zip. A run with no
  tag (a hand materialize) picks the zip by the sensor's own rule (`new_sessions`).
- **Stub zips.** An aborted Craig start leaves a zip of about 900 bytes with the same date.
  Zips under `MIN_ZIP_BYTES` (1 MiB) are ignored by the sensor and by `session_tracks`. A zip
  with only `info.txt` and `raw.dat` is a session nobody recorded; it produces nothing by
  design.
- **Two zips for one date:** the first non-stub zip in sorted order would win, so the
  `single_recording` check (two dated zips) or `no_undated_recording` (an undated zip of
  another recording) fails the session instead. Two names of one recording (the hard-link
  recovery above) share a recording id and count once.
- **Groq's 25 MB direct-upload cap.** Chunks are 16 kHz mono `s16` flac and at most
  `max_chunk_sec` 480 s, about 14.6 MiB each. Removing `-sample_fmt s16` or raising the chunk
  length brings back 413 errors.
- **Degenerate tracks.** A player who barely spoke can fail the whole session. scribe skips
  voiced spans under 0.1 s, probes the cut flac (input seek overshoots near the end), treats
  ffprobe's `N/A` duration as 0 and skips Groq's "too short" errors.
- **Whisper hallucinations** ("you", "thank you" over non-speech). The confidence prong
  (`no_speech_prob` and `avg_logprob`) misses most of them. The text prong,
  `HALLUCINATION_TEXT_RE` in `libs/py/llm` (`astra_llm.transcription`, shared with
  mouthpiece), is what removes them. Keep both.
- **Dates are not zero-padded.** Sort them as integer tuples, never as strings.
