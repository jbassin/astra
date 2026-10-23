# 0007. Transcription uses Groq's hosted Whisper

- **Date:** 2026-06-18
- **Status:** Accepted
- **Source:** [0000-astra-migration-roadmap.md](../../thoughts/archive/plans/0000-astra-migration-roadmap.md) (decision G)

## Context

Session audio needs per-speaker transcripts; a local GPU worker would cost more to run than the API.

## Decision

scribe transcribes each Craig track with Groq's hosted `whisper-large-v3`, after local silence trimming. Historical transcripts are imported as they are and never re-transcribed.

## Consequences

No GPU or local model. Groq's 25 MB upload cap shapes the chunking (see the scribe README).
