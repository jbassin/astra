"""The producer's task signature + instructions.

The docstring of ``ProduceBrief`` is the instruction text dspy places ahead of its own RLM
template and the tool list. Inputs are immutable values only: dspy re-injects every input
variable into the REPL before each code block (0033 gotcha), so nothing mutable goes in.

The output is typed (``brief: ProducerBrief``): dspy validates a submitted dict with a
``TypeAdapter`` and returns a ``[Type Error]`` to the loop on failure, so the agent retries
in-loop. A ``str`` output would ``str()`` a submitted dict into a Python repr.
"""

from __future__ import annotations

import dspy

from .brief import ProducerBrief


class ProduceBrief(dspy.Signature):
    """You are the producer of a podcast on which three hosts recap last night's session of
    a Pathfinder 2e tabletop campaign. Two of them know the campaign well; the third is a
    newcomer, a Pathfinder veteran in her first season with this campaign. You do not write
    any dialogue. You prepare notes the writer will use alongside the full transcript, so
    the hosts get names and lore right, reach back to earlier episodes, and spend their
    time on what mattered.

    `transcript` is tonight's session (`target_date`, show `show`), already cleaned of
    out-of-character talk; each line starts with its line id. `synopsis` is a short summary
    and `roster` maps players to their characters.

    Work in this order, looking things up with the tools as you go:

    1. Moments. Read the transcript and pick the 5 to 10 moments most worth talking about:
       emotional peaks, reveals, close calls, hard decisions with consequences, and funny
       moments that happened in the world. For each, give the line ids where it happens, a
       short quote or paraphrase that locates it, why it matters, and how it felt.
    2. Lore. For every proper noun those moments depend on (people, places, factions,
       deities, creatures, objects), check it: `resolve_name` for misheard names,
       `search_wiki` and `read_page` for what the wiki says. Write 1 to 3 sentences per name
       from the wiki only, citing the page path. Never invent lore. If a name has no page,
       say what the transcript establishes and set page to null.
    3. Callbacks. Look back with `list_episodes`, `read_episode`, `search_transcripts` and
       `search_scripts` for real connections to earlier sessions: a promise coming due, a
       returning character, a mystery that moved, a running joke the hosts already made on
       an earlier episode. Cite the earlier session's date. Never invent history.
    4. Open threads. List the unresolved questions tonight raised that the hosts could
       speculate about, grounded in what actually happened.
    5. Newcomer questions. Write the plain questions the newcomer would ask to catch up
       (who is that, why does that matter, how close was that).

    Leave out rules mechanics, dice, and statblock language; the hosts talk about the
    story. Keep notes short and concrete; the writer has the full transcript.

    Use `llm_query` sparingly, for example to skim a long earlier transcript; prefer search
    tools. When the notes are complete, call SUBMIT(brief={...}) with a dict matching the
    output schema. Do not wait for the step limit."""

    target_date: str = dspy.InputField(desc="tonight's session date, YYYY-M-D")
    show: str = dspy.InputField(desc="the campaign slug")
    synopsis: str = dspy.InputField(desc="a short summary of tonight's session")
    roster: str = dspy.InputField(desc="players and their characters")
    transcript: str = dspy.InputField(
        desc="tonight's cleaned transcript, one '<line_id>\\t<Speaker>: <text>' line per turn"
    )
    brief: ProducerBrief = dspy.OutputField(desc="the producer notes")
