---
name: manage-thought-artifacts
description: Activates and maintains the Thought artifact field when filesystem persistence is available. Creates or updates the artifact families that actually moved during the run. Not passive filing — live working memory for subagent execution, handoff, and cross-session continuity.
---

# Manage Thought Artifacts

> `using-epi-logos` runs first. If it hasn't been invoked this turn, go there now.

`/Thought/*` is live working memory, not a passive archive. When persistence exists and Thought is active, create or update artifacts for the live run. Do not talk abstractly about artifacts while leaving the field empty.

If persistence does not exist: keep the artifact model internal, track what would have gone into the field, do not pretend files were created.

## The Twelve Families

**Objective six:**
- `Thought/Questions/` — observations, unknowns, disciplined open questions
- `Thought/Traces/` — hypotheses, trails, candidate explanations
- `Thought/Challenges/` — blockers, tensions, method risks
- `Thought/Patterns/` — criteria, recurring structures, evaluative apparatus
- `Thought/Discovery/` — execution results, findings, state changes
- `Thought/Insight/` — verified synthesis, durable takeaways, compact handoffs

**Subjective six:**
- `Thought/Being/` — what sort of world or issue is showing up
- `Thought/Thrownness/` — givens, inheritance, factical constraints
- `Thought/Presence/` — immediate encounter and lived disclosure
- `Thought/Temporality/` — sequence, timing, urgency, latency, horizon
- `Thought/Care/` — stake, concern, valence, why it matters
- `Thought/Releasement/` — unclenching, reframing, subjective synthesis

## Runtime Sequence

1. Determine whether persistence exists.
2. Determine whether Thought should be active for this run.
3. Choose only the artifact families that actually moved.
4. Create or update notes tied to the task or subtask.
5. Require subagents to leave a usable artifact footprint when persistence exists.

## Naming

- `YYYY-MM-DD-<task-slug>.md` for task-level artifacts
- `YYYY-MM-DD-<task-slug>-<subagent>.md` for subagent artifacts

Inside each file: context, current move, active contradiction or opening, next useful action.

## Rules

- Update only the artifact families that actually moved
- For klein topology: paired subjective and objective notes are often right
- For lemniscatic: record what changed at each recursive fold
- Use artifacts to support handoff, not to dump raw token residue
- When nearing completion, invoke `compress-thought-artifacts`
