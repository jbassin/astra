"""astra-scribe — the pipeline head.

Craig Discord recordings (`.zip`) → per-session merged `audio.mp3` + raw
`script.json` (`[{start,end,text,user}]`, line-level, raw-id speakers), as Dagster
partitioned assets (one per session/date). Transcription is the Groq
`whisper-large-v3` API via `libs/py/llm` — no GPU, no local model, and no word
timestamps (nothing downstream reads them). linguist resolves ids → speakers downstream.
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
