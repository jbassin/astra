"""astra-scribe — the pipeline head (0005).

Craig Discord recordings (`.zip`) → per-session merged `audio.mp3` + raw
`script.json` (`[{start,end,text,user}]`, line-level, raw-id speakers), as Dagster
partitioned assets (one per session/date). Transcription is the Groq
`whisper-large-v3` API (Decision G) via `libs/py/llm` — no GPU, no local model,
word timestamps dropped (F1). linguist (0006) resolves ids → speakers downstream.
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
