# astra-sessions — session keys, file names and atomic writes

`astra_sessions` owns the parsing around a session's identity, which the pipeline apps share:
scribe, linguist, mouthpiece, heartwood and the mouthpiece tools import it. A session is keyed
by its date in the non-zero-padded `YYYY-M-D` form (`2025-8-28`). That string is the Dagster
partition key, the name of every per-session directory and the date segment of every
transcript file name.

## Public surface

- **Dates** (`dates.py`). `date_key(date)` is the strict sort key (raises on a malformed key);
  `date_sort_key(date)` is a lenient `YYYYMMDD` integer that never raises. `to_date`,
  `format_date` and `iso_date` convert to and from `datetime.date` and an ISO timestamp.
- **Recordings** (`recordings.py`). `recording_key(zip_path)` gives the session key of a Craig
  zip (`<guild>_<channel>_<date>_<id>`); `track_user(stem)` and `track_index(stem)` split a
  player track stem (`<idx>-<discordid>`; the last `_` segment is the index).
- **Transcripts** (`transcripts.py`). `parse_transcript_name(path)` reads
  `<prefix>.<slug>.<date>.txt` into a `TranscriptName` (`stem`, `date`, `slug`, `session_id`);
  `transcript_dates(dir)` and `find_transcript(date, dir)` look files up. `TRANSCRIPT_LINE` is
  the regex for one `NNNNNN<TAB>Speaker: text` line.
- **Atomic writes** (`atomic.py`). `atomic_write_text(path, text)` writes a `.tmp` sibling and
  renames it over the target, so a reader never sees half a file.
- **Agent tools** (`astra_sessions.tools`, import it explicitly because it pulls in the LLM
  stack). `SessionToolsMixin` holds the bodies of the read-only wiki search, transcript search
  and entity lookup tools that heartwood's and the mouthpiece producer's RLM agents share.
  Each agent keeps its own public methods, because a tool's docstring is the prompt the model
  sees.

It reads no config; callers pass the directories.

## Testing

```sh
uv run pytest libs/py/sessions
```

## Traps

- **Never sort session keys as strings.** `"2025-10-20" < "2025-8-28"` as strings. Sort on
  `date_key` or `date_sort_key`.
- **Never reformat a key** (no zero padding): it would no longer match the partition, the
  directories or the file names.
- **`iso_date` hard-codes the `-04:00` offset** that the published corpus uses.
- **The recording parsers return `""`** for a stem of another shape rather than raising; check
  for it.
- **mouthpiece's `linguist_io` keeps its own stricter transcript-line parser.** It gives the
  same result on every real transcript line; change both if the line format changes.
