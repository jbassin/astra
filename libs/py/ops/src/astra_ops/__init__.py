"""astra-ops: the host ops CLI (0037 ops-1a).

The justfile keeps one thin wrapper per command, so systemd units, docs and bots still call
``just <recipe>``; the logic lives here. ``context`` holds the seams every command uses (the
subprocess runner, the flocks, confirmation, config), ``publish`` the astra-data commands and
``heartwood`` the heartwood publish commands. ``cli`` parses and dispatches.
"""
