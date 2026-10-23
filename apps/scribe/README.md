# scribe — Craig recordings to session audio and a raw transcript

scribe is the head of the session pipeline. Craig drops each recording as a zip on a Google
Drive FUSE mount; the host `craig-sync` timer copies new zips into `scribe.incoming-path`
(`/ruby/data/astra-state/scribe/incoming`), because Docker cannot bind-mount the FUSE mount.
In Dagster, `craig_drop_sensor` registers one `scribe_sessions` partition per session date
and runs `session_tracks` → `session_audio` ∥ `session_transcript` → `session_cleanup`. The
outputs `scribe/data/saved/<date>/{audio.mp3,script.json}` are the handoff to linguist
(`linguist.ingest-saved-dir` must equal this dir) and to `just akasha-seed`. Transcription is
Groq Whisper (`scribe.model`, `groq/whisper-large-v3`).

## Operations

- **Sync by hand:** `just craig-sync`. Install the 5-minute timer with
  `just craig-timer-install`.
- **Wedged Drive mount:** craig-sync bounds every mount access without waiting on it, so a
  hung mount makes the unit fail (and page) instead of hanging in `activating`, which would
  stop the timer from re-arming. A process blocked on the mount shows `D request_wait_answer`
  in `ps -o stat,wchan`; `timeout` cannot kill it. The astra watchdog remediates the mount.
- **Undated zip.** A zip name must be `<guild>_<channel>_<date>_<id>` (four `_` fields, date
  third). Any other name is skipped silently, with no alert. To recover one, hard-link it in
  the incoming dir under a dated name, taking the date from the zip's `info.txt`
  `Start time:` (UTC), for example
  `ln craig-<rec>-<key>_<key>.aac.zip craig_<rec>_2026-10-5_00-00-00.aac.zip`. Keep the
  original name too, or craig-sync downloads it again.
- **Re-transcribe a session.** Only the zip in the incoming dir is needed. Materialize all
  four scribe assets for the partition: `session_cleanup` deletes the extracted tracks, so a
  single tail cannot rerun without `session_tracks`. Then rerun downstream in order: linguist
  `session_transcripts,session_episode_summary`, mouthpiece `session_digest,session_script`
  (digest first, or the drift guard fails), then the audio steps. Cost is about $2 of Groq and
  9 minutes.
- **Re-run a session from scratch:** see `dagster/README.md`.

## Traps

- **Stub zips.** An aborted Craig start leaves a zip of about 900 bytes with the same date.
  Zips under `MIN_ZIP_BYTES` (1 MiB) are ignored by the sensor and by `_find_zip`. A zip with
  only `info.txt` and `raw.dat` is a session nobody recorded; it produces nothing by design.
- **Two zips for one date:** the first non-stub zip in sorted order wins.
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
