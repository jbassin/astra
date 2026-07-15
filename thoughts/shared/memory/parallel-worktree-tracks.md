---
name: parallel-worktree-tracks
description: How to run a multi-engineer parallel build in git worktrees (first used codex 0029 P6, D29-71) — the structural constraints, the spec sections that make it safe, and the incident-derived rules for agent briefs
metadata:
  type: project
---

**The parallel-worktree-track pattern** (first use: codex 0029 P6, 2026-07-15 — 4 tracks + serial
integration, worked on the first try; spec section = D29-71 in
`thoughts/astra/specs/0029-codex-p6-feedback-spec.md`).

Structure the SPEC (not just the task assignment) around it:

1. **The data-owning track runs in the MAIN tree** — gitignored assets (`data/corpus`, snapshots,
   search indexes) exist ONLY there; a worktree materializes tracked files only. Only that track
   (and integration) may run corpus regens / index rebuilds.
2. **All other tracks are fixture-only worktrees** — safe exactly because of the standing
   hermeticity bar (the full suite must pass without real data). Verify BEFORE speccing that each
   track's gate is actually satisfiable from the committed fixtures (P6's Track B glyph gate wasn't
   — no free-action fixture entity existed; the fix was a synthetic-input unit test, not a fixture
   edit from the wrong track).
3. **A binding per-track FILE-OWNERSHIP table** in the spec — one engineer per track, no edits
   outside the row. Adversarially review the map: P6's review found a file owned by NOBODY
   (`urlState.ts`) and a cross-track type ripple (`hasValue` removal) that would have broken a
   track's isolated typecheck.
4. **Pinned merge order + designated rebaser** for shared files (C-first, D-rebases in P6); shared
   files get minimal single-purpose edits from the earlier track.
5. **Golden/generated-file policy**: NO track regens shared goldens authoritatively — regen
   locally to stay green + FLAG; integration regens ONCE at merged HEAD and hand-reviews the
   combined diff. (P6's only merge conflicts were exactly the predicted golden overlap.)
6. **Integration is a serial main-tree slice**: merges, one authoritative regen of everything
   generated, the deferred real-corpus/live proofs from the worktree tracks, both CI lanes, push,
   deploy tail.

**Agent-brief rules (incident-derived):**
- Tell every worktree engineer: **NEVER run git commands outside your worktree path.** (A P6
  engineer ran `git stash` in the main tree mid-verification and briefly stashed the main-tree
  track's WIP; recovered, but only because both agents were careful.)
- Only the main-tree track stops/starts the linguist-commit timer; worktree commits are immune.
- Mid-run orchestrator directives via SendMessage may be REFUSED as suspected prompt injection
  (a P6 spec-drafting agent did exactly that — correct instinct, since inter-agent messages arrive
  interleaved with tool results). Re-send with provenance + judge-by-consistency framing, or put
  direction changes in the initial brief when possible.
- Engineers must STOP with options when reality contradicts a spec pin — P6's Track A did, which
  is how the proxy-population pin failure (see [[codex-0029-gotchas]]) got a deliberate decision
  instead of an improvised one.

Cost/benefit honestly: the data track is usually the long pole, so the win is bounded by the
other tracks' combined wall-clock (~30–40% in P6). Worth it when tracks are genuinely disjoint;
not worth the spec overhead for two small slices.
