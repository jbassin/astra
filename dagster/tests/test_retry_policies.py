"""Every asset in the code location makes an explicit retry decision.

A retry reruns a whole step and re-bills what it paid for, so no asset may get a retry, or
go without one, by accident. Each asset either carries the shared policy
(``astra_pipeline_resources.EXTERNAL_API_RETRY``, for a step that calls a paid external API)
or is listed in ``astra_pipeline_resources.NO_RETRY`` with the reason. A new asset fails here
until its author picks one.
"""

from types import ModuleType

import dagster as dg
from astra_pipeline_resources import EXTERNAL_API_RETRY, NO_RETRY

#: The assets that call a paid external API, and so carry the shared policy.
EXTERNAL_API_ASSETS = {
    "campaign_timeline",  # linguist: GLM season grouping
    "session_audio_clips",  # mouthpiece: ElevenLabs
    "session_digest",  # mouthpiece: GLM clean + enrich
    "session_episode_summary",  # linguist: GLM chronicle summary
    "session_script",  # mouthpiece: GLM two-pass script
    "session_transcript",  # scribe: Groq whisper
}


def _assets(definitions: ModuleType) -> dict[str, dg.AssetsDefinition]:
    repo = definitions.defs.get_repository_def()
    return {key.to_user_string(): a for key, a in repo.assets_defs_by_key.items()}


def test_every_asset_has_an_explicit_retry_decision(definitions: ModuleType) -> None:
    undecided, both, other_policy = [], [], []
    for name, asset in _assets(definitions).items():
        policy = asset.op.retry_policy
        if policy is None and name not in NO_RETRY:
            undecided.append(name)
        elif policy is not None and name in NO_RETRY:
            both.append(name)
        elif policy is not None and policy != EXTERNAL_API_RETRY:
            other_policy.append(name)
    assert not undecided, f"add retry_policy=EXTERNAL_API_RETRY or a NO_RETRY entry: {undecided}"
    assert not both, f"in NO_RETRY but carries a policy: {both}"
    assert not other_policy, (
        f"use the shared EXTERNAL_API_RETRY, not an ad-hoc policy: {other_policy}"
    )


def test_the_paid_external_api_assets_carry_the_shared_policy(definitions: ModuleType) -> None:
    assets = _assets(definitions)
    with_policy = {n for n, a in assets.items() if a.op.retry_policy is not None}
    assert with_policy == EXTERNAL_API_ASSETS


def test_no_retry_lists_only_real_assets_with_a_reason(definitions: ModuleType) -> None:
    names = set(_assets(definitions))
    assert set(NO_RETRY) <= names, f"stale NO_RETRY entries: {set(NO_RETRY) - names}"
    assert all(reason.strip() for reason in NO_RETRY.values())
