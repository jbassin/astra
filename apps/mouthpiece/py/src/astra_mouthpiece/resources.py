"""mouthpiece's own Dagster resource: the TTS provider.

The shared resources (config, paths, LLM client) live in `astra_pipeline_resources`; the
TTS provider lives here because its implementations are mouthpiece's.
"""

from functools import cache
from typing import Literal

import dagster as dg
from astra_config import Config, SecretUnsetError
from astra_pipeline_resources import loaded_config

from .tts.elevenlabs import ElevenLabsTTSProvider
from .tts.mock import MockTTSProvider
from .tts.provider import TTSProvider


class TtsResource(dg.ConfigurableResource):
    """The configured TTS backend (`mouthpiece.tts-provider`): ElevenLabs, live and paid, or
    the offline mock. The API key is not a field (it would show in the Dagster UI); it is
    resolved from config.kdl only when `build()` makes an ElevenLabs provider."""

    provider: Literal["elevenlabs", "mock"]
    #: The ElevenLabs model id (`mouthpiece.elevenlabs-model`).
    elevenlabs_model: str
    #: The ElevenLabs voice stability, 0 to 1 (`mouthpiece.elevenlabs-stability`).
    elevenlabs_stability: float

    @classmethod
    def from_config(cls, cfg: Config) -> "TtsResource":
        return cls(
            provider=cfg.mouthpiece.tts_provider,
            elevenlabs_model=cfg.mouthpiece.elevenlabs_model,
            elevenlabs_stability=cfg.mouthpiece.elevenlabs_stability,
        )

    def build(self) -> TTSProvider:
        """The provider. Never a silent fallback to the mock: a missing key raises, so a paid
        run can't quietly render placeholder audio."""
        if self.provider == "elevenlabs":
            key = loaded_config().mouthpiece.elevenlabs_api_key
            if key is None:
                raise SecretUnsetError("mouthpiece.elevenlabs-api-key has no ref= in config.kdl")
            return ElevenLabsTTSProvider(
                key.require(), model_id=self.elevenlabs_model, stability=self.elevenlabs_stability
            )
        return MockTTSProvider()


@cache
def default_tts() -> TtsResource:
    """The production TTS resource, from config.kdl."""
    return TtsResource.from_config(loaded_config())
