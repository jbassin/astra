"""Test stand-ins for the shared resources, for ``dg.materialize(resources=...)``.

Dagster passes a plain object through to the asset unchanged, so a fake only needs the
methods the asset calls. (A ``ConfigurableResource`` subclass would not do: Dagster rebuilds
resources from their fields and drops private state.)
"""

from pathlib import Path
from typing import Any

from astra_config import Config

from . import PipelinePaths, loaded_config


def paths_under(root: Path) -> PipelinePaths:
    """Every pipeline path under ``root``, one subdir each (nothing is created)."""
    return PipelinePaths(
        scribe_incoming=str(root / "scribe" / "incoming"),
        scribe_tmp=str(root / "scribe" / "tmp"),
        scribe_data=str(root / "scribe" / "data"),
        linguist_saved=str(root / "scribe" / "data" / "saved"),
        linguist_data=str(root / "linguist" / "data"),
        linguist_script=str(root / "linguist" / "script"),
        linguist_transcripts=str(root / "linguist" / "transcripts"),
        linguist_timeline=str(root / "linguist" / "timeline"),
        akasha_content=str(root / "akasha" / "content"),
        mouthpiece_episodes=str(root / "mouthpiece" / "episodes"),
        heartwood_requests=str(root / "heartwood" / "requests"),
    )


class FakeConfig:
    """`AstraConfig` over a given `Config` (default: a deep copy of the real one to edit)."""

    def __init__(self, cfg: Config | None = None) -> None:
        self.cfg = cfg if cfg is not None else loaded_config().model_copy(deep=True)

    def get(self) -> Config:
        return self.cfg


class FakeLlm:
    """`LlmResource` that hands out one stub client and counts how often it was asked."""

    def __init__(self, client: Any) -> None:
        self.stub = client
        self.clients = 0

    def client(self) -> Any:
        self.clients += 1
        return self.stub
