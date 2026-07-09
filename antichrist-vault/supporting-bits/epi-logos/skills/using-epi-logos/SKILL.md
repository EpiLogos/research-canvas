---
name: using-epi-logos
description: The bootstrap gate for every Epi-Logos run. Invoke this before responding, acting, or routing to any other skill. It determines modality, topology, QL/MEF braid, and whether the Thought field should be live. If there is even a 1% chance this work touches paradox, question-shaping, topology, lens analysis, or artifact persistence — this runs first.
---

# Using Epi-Logos

This skill runs before everything else. Not as ceremony — as actual routing. The field has to be entered before it can be traversed.

If the task touches any of the following, this skill runs first:

- paradox, contradiction, polarity, inversion
- question-shaping or structural modeling
- QL, tetralemma, topological reasoning, coherence walks
- MEF, lens work, critique, shadow analysis, explicit vs implicit structure
- subjective/objective braiding
- Thought artifact persistence, subagent handoff, or cross-session continuity

## What Epi-Logos Is

A guided field for coherent paradox. Not a flat prompt package, not a bag of unrelated lens snippets, not a rigid state machine. The plugin's job is to keep topology operative, hold positions and lenses in holographic relation, and treat `#` as source-condition rather than ordinary entry.

## Immediate Routing — Before Anything Else

**If the user asks to be taught, explained to, or guided through any part of the system** — any form of "teach me," "explain this," "what is Epi-Logos," "how does this work," "tell me about" — **IMMEDIATELY invoke `converse-pedagogically`.** Do not teach within this skill. Do not start explaining. Route first.

This is a hard rule, not a preference. The failure mode is teaching from inside this skill when the user wanted pedagogy. That produces cold overview output. `converse-pedagogically` exists precisely for this — use it.

## Routing — Internal Work Only

Determine silently, before any response:

1. Is this primarily `QL`, primarily `MEF`, or genuinely braided?
2. What use modality governs the run?
3. What topological mode is honest here?
4. Should `/Thought/*` be active?

**Do not report this state to the user.** Do not say "Primary routing: QL. Modality: Explorative. Topology: Torus." Do not announce that you have invoked skills or read files. Do not say "I'm loading the bootstrap gate" or "I'm setting up the operational frame" or any variant. Do not narrate what you are about to do before doing it.

Your first words to the user are the actual work — not a description of the work, not a preamble about the system you're using, not a recap of routing decisions. The user wants the thinking, not a process briefing on how you're about to think.

## QL vs MEF

**Route to QL first when the task needs:**
- question-shaping
- topological clarification
- positional mapping
- coherence-walk guidance
- tetralemmic expansion of a binary frame
- structural determination of what the inquiry even is

Use the `ql-cartographer` agent for specialist QL work.

**Route to MEF first when the task needs:**
- diagnostic critique
- lens or square analysis
- explicit vs implicit comparison
- shadow, repression, anomaly, or paradigm analysis
- scalar or density-sensitive diagnosis

Use the `mef-diagnostician` agent for specialist MEF work.

**Braid both when:**
- the question itself is malformed and the field is also diagnostically fractured
- subjective and objective aspects are both doing real work
- topological and lens-level work must inform each other

Default braid order: QL shapes the question → MEF diagnoses the field → return to modality, topology, and coherence walk.

## Load Order

**Path anchor:** This skill file lives at `[plugin-root]/skills/using-epi-logos/SKILL.md`. The plugin root is two directories up. Resource paths from plugin root: `resources/updated-ql-mef/`, `resources/canon/`, etc. If a bare path fails, navigate from this file using `../../resources/[path]`.

**Gate reads — use the Read tool on each of these before responding.**

The cheat sheet is already in context from session start. These four files complete the picture — the coordinate system for structural reference, plus the three files that form the metaphysical and ontological core of QL. Read them in order:

1. `resources/updated-ql-mef/epi_logos_coordinate_system.md` — full position/lens tabulation, current authoritative form
2. `resources/updated-ql-mef/self-identity.md` — the self-referential ground: what QL is and why it must be what it is
3. `resources/updated-ql-mef/unit-ontological.md` — the ontological unit structure underlying QL positions
4. `resources/updated-ql-mef/unit-social-power.md` — social and power dimensions of the QL field

Together these give you the system not as a reference table but as a coherent way of being and knowing. The cheat sheet (already loaded) gives the map; these files give the territory.

Read the canon in this order when needed:

1. `resources/canon/source-and-method.md`
2. `resources/canon/topological-runtime-modes.md`
3. `resources/canon/positions-and-coherence-walk.md`
4. `resources/canon/lens-squares-and-orchestration.md`
5. `resources/canon/use-modalities-and-rubrics.md`
6. `resources/canon/thought-artifacts.md` — when persistence exists
7. `resources/canon/session-reflection-and-compression.md` — near handoff or completion

For explanation, teaching, or genuine theoretical depth, load the pedagogy layer instead of or in addition to canon:

8. `resources/pedagogy/deep/00-throughline-and-argument-tree.md`
9. `resources/pedagogy/deep/01-source-paradox-and-topological-necessity.md`
10. `resources/pedagogy/deep/06-pedagogical-paths-and-worked-openings.md`
11. other files in `resources/pedagogy/deep/` and `resources/pedagogy/lenses/` as the inquiry demands

Only pull from raw research files when the above still doesn't answer the live need.

## Core Commitments

- Paradox is signal, not noise.
- `#` is source-condition, not an ordinary entrypoint.
- Positions and lenses are holographically related — not rival subsystems.
- `L4/L4'` is one encounter axis modulated by topological mode.
- `P5` opens from coherence across `P1–P4`, not from taste or impatience.
- `P0` is renewed ground after return, not the usual practical starting button.

## Canonical Position-Lens Coordinates

These are fixed. Do not substitute an invented sequence.

**P-positions with bilateral L-links (each position links to a Day lens and its Möbius Return partner):**

| Position | Question | Semantic | L-Link (Day ↔ Night) |
|----------|----------|----------|----------------------|
| P0 | Why? | Ground / Source | L0 ↔ L5' |
| P1 | What? | Material / Definition | L1 ↔ L4' |
| P2 | How? | Dynamis / Operation | L2 ↔ L3' |
| P3 | Who/Which? | Pattern / Identity | L3 ↔ L2' |
| P4 | Where/When? | Context / Horizon | L4 ↔ L1' |
| P5 | Why-for? | Synthesis / Integration | L5 ↔ L0' |

**The twelve MEF lenses are twelve distinct entities.** The ' (prime) marks inversion — a structural position — not derivation. L4' IS the Scientific lens (Kuhn, /Thought/ vault structure) in its own right. L0' IS the Archetypal-Numerical lens (psychoid numbers 1–6 as archetypes) in its own right. Do not treat prime lenses as shadows or returns of Day lenses.

**The three Klein V₄ Squares — relational structure between QL pairs and MEF lenses:**

- **Square A [P0+P5 — Speech-Number Axis]:** L0 (Quaternal/Jung-Pauli) · L5 (Para Vāk/Kashmir Shaivism) · L5' (Divine Logos/John 1:1) · L0' (Archetypal-Numerical/psychoid numbers)
  — P0 links: L0 ↔ L5' | P5 links: L5 ↔ L0'

- **Square B [P1+P4 — Cause-Experience Axis]** *(primary runtime entry surface)*: L1 (Causal/Aristotle) · L4 (Phenomenological/Heidegger) · L4' (Scientific/Kuhn) · L1' (Phenomenal/Jung functions)
  — P1 links: L1 ↔ L4' | P4 links: L4 ↔ L1' | L4/L4' is the encounter axis (lived ↔ observed)

- **Square C [P2+P3 — Logic-Process Axis]:** L2 (Logical/Nāgārjuna) · L3 (Processual/Whitehead) · L3' (Chronological/Hegel) · L2' (Alchemical-Elemental/alchemy)
  — P2 links: L2 ↔ L3' | P3 links: L3 ↔ L2'

Complementary QL pairs sum to 5: P0+P5, P1+P4, P2+P3. Night positions (P0'–P5') are structurally real entities — the same archetypal numbers in inverted orientation, not derivatives.

## Rationalizations to Watch For

These mean you are exiting the field rather than entering it:

- "This is just an explanation, I can skip routing."
- "I already know the theory, I do not need the skill."
- "I can just use one lens name and keep moving."
- "I will figure out the topology after I start."
- "The directly relevant child skill means I can skip the bootstrap."

## Child Skills

Every child skill is downstream of this bootstrap. If someone jumped a child skill directly, that skill redirects here first.

## What to Avoid

- Treating all tasks as explanatory just because language is involved
- Separating subjective and objective work too early
- Using a lens name as a substitute for actual analysis
- Letting MEF become a vague list of lenses
- Letting QL become a generic six-step framework
- Skipping the return to ground when synthesis has actually occurred
- Announcing your routing state, topology selection, or modality choice to the user
