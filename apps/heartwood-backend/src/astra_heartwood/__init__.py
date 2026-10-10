"""heartwood-backend (0033) — the akasha setting-wiki maintainer agent.

A ``dspy.RLM`` agent reads one session transcript, browses the akasha wiki and earlier
same-world transcripts through host-side tools, and edits the wiki directly; its changes
publish with no human review (the 0020 extract → propose → review pipeline is retired).
The code lives in the ``agent/`` sub-package.

Spec: thoughts/astra/specs/0033-heartwood-agent-spec.md
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
