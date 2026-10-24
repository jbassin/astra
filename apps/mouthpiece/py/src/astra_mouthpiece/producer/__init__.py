"""The mouthpiece producer (0034): a read-only ``dspy.RLM`` that briefs the recap script.

``brief.py`` (schema + citation check + renderer), ``tools.py`` (read-only lookups),
``instructions.py`` (the signature), ``run.py`` (one producer run). The host CLI and the
script experiment live in ``astra_mouthpiece_tools``. Nothing here writes under
``episodes/``.
"""
