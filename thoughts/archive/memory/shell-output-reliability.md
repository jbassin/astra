---
name: shell-output-reliability
description: bare `diff` and batched multi-python3 Bash loops returned WRONG output in this environment (2026-07-23, RTK proxy suspect) — use git diff / single-process Python for load-bearing comparisons
metadata:
  type: project
---

2026-07-23 (assay batch-0 engineer session): two shell-output corruption incidents in one
run — (1) bare `diff a b` reported two byte-DIFFERENT store JSONs as identical (md5sum +
Python disagreed); (2) a single Bash call batching several `python3 -c` invocations in a
loop returned FABRICATED content for one file (didn't match the real bytes on disk).
Suspected the RTK token-optimizing proxy (rewrites/filters command output). Neither
corrupted the repo — every write was gated on exact-substring verification against a
freshly-loaded copy.

**Why:** a filtering proxy between the shell and the transcript can silently alter
comparison output; trusting it for load-bearing checks risks committing wrong edits.

**How to apply:** for any load-bearing comparison or read in this environment, prefer
`git diff` (exercised constantly, known-good) or ONE Python process doing the
read+compare+print itself; avoid bare `diff` and avoid batching multiple interpreter
invocations in one Bash call when the output will be trusted. Verify surprising
"identical"/"missing" results a second way before acting. See also [[verify-before-acting]].
