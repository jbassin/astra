"""The pipeline's one step-retry policy, and the assets that deliberately have none.

Every asset in the code location makes an explicit retry decision: it either carries
``retry_policy=EXTERNAL_API_RETRY`` (it calls a paid external API whose transient failures
a later attempt can ride out), or its name is in `NO_RETRY` with the reason.
``dagster/tests/test_definitions.py`` fails for an asset that has neither, or for one that
carries any other policy.

A retry reruns the whole step, so it re-bills whatever the step paid for before it failed,
except work the step caches on disk (mouthpiece's TTS clips and script passes). A failure
that a rerun cannot fix skips the retry: `llm_failures_final` turns a spent LLM retry
budget and a deterministic provider 4xx into ``dg.Failure(allow_retries=False)``.
"""

import dagster as dg

__all__ = ["EXTERNAL_API_RETRY", "NO_RETRY", "client_error_status"]

#: Three retries, 120 s, 240 s and 480 s after the failures, so a step rides out a provider
#: outage of up to about 14 minutes. litellm also retries transport errors inside each
#: attempt (``astra_llm.retry``).
EXTERNAL_API_RETRY = dg.RetryPolicy(max_retries=3, delay=120, backoff=dg.Backoff.EXPONENTIAL)

#: Asset name -> why it has no retry policy.
NO_RETRY: dict[str, str] = {
    "session_tracks": "local work: verifies and extracts the Craig zip",
    "session_audio": "local work: ffmpeg merges the tracks",
    "session_cleanup": "local work: deletes the persisted tracks",
    "session_transcripts": "local work: formats scribe's transcript",
    "stored_corrections": "local work: rewrites stored text with defs.kdl",
    "session_brief": (
        "a paid ~10-minute RLM must not run four times; litellm retries each call, and a "
        "failed producer still materializes with no brief"
    ),
    "session_episode": "local work: ffmpeg assembles the clips",
    "session_wiki": "a paid 15-55 minute host agent run; a failure needs a person",
}

#: 4xx statuses a later attempt can succeed on: timeout, conflict, too early, rate limit.
_TRANSIENT_4XX = frozenset({408, 409, 425, 429})


def client_error_status(exc: BaseException) -> int | None:
    """The HTTP status of a deterministic client error (a 4xx a rerun would repeat), or
    None. Reads ``status_code`` (litellm, httpx-style errors) or ``status``
    (`astra_mouthpiece.tts.provider.TtsClientError`)."""
    for attr in ("status_code", "status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int) and 400 <= value < 500 and value not in _TRANSIENT_4XX:
            return value
    return None
