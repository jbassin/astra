"""Print config values, one per line, for shell recipes.

    uv run python -m astra_ontology_config data.akasha-content data.heartwood-ledger

Each argument is ``namespace.field`` (kebab- or snake-case). Data paths print resolved
(absolute), exactly as Python code sees them.
"""

from __future__ import annotations

import sys

from . import load


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__, file=sys.stderr)
        return 64
    cfg = load()
    for key in argv:
        value: object = cfg
        for part in key.replace("-", "_").split("."):
            value = getattr(value, part)
        print(value)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
