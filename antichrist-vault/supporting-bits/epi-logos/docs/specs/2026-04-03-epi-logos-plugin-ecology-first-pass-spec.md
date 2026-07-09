# Epi-Logos Plugin Ecology: First-Pass Design Specification

Status: Draft 1  
Date: 2026-04-03

## 1. Executive Summary

The Epi-Logos plugin should be built as a **skills-centered plugin bundle** whose purpose is not to "apply a framework" but to let an agent address paradox coherently. The system's deepest methodological claim is that `#` is the image of inversion, non-duality, and coherent paradox as such, and that the topologies generated from `#` provide the minimal structure through which paradox can be held, traversed, inverted, and returned from without collapse.

The plugin therefore should not be organized as:

- a flat prompt package
- a loose bag of unrelated skills
- a hardcoded state machine that forces every run through one rigid path

It should instead be organized as a **guided field**:

- rich canonical resources preserve the ontology, topology, correspondences, and lens/position structure
- a small set of executables perform routing, paradox handling, traversal, synthesis, and artifact persistence
- the whole field remains architecturally present, while runtime activates only what the current inquiry honestly requires

The plugin's runtime backbone is:

1. choose **use modality**
2. identify **topological mode**
3. engage the **encounter axis** (`L4/L4'`)
4. apply paradox rubrics, especially **tetralemma** and **CMEA**
5. walk **positional coherence** from `P1` through `P4`
6. open `P5` only if coherence is real
7. return to renewed ground at `P0`
8. persist and compress `/Thought/*` artifacts when filesystem access exists

This specification is intended to be clean, unsurprising, and implementation-ready as a first pass.

## 2. Non-Negotiable Design Commitments

### 2.1 The system is organized around coherent paradox

The main methodological throughline is not generic "multi-perspectival reasoning" but **coherent paradox**. The plugin must orient around the claim that reality and inquiry require a structure capable of holding contradiction, inversion, complementarity, and return without flattening them into binary choices or losing them in incoherence.

### 2.2 `#` remains architecturally real

`#` is not a prompt prefix, not a preamble, not a "context block," and not an occupiable node. It is the image of inversion of inversion, the generative source-condition from which the topologies and all coordinate expressions emerge.

### 2.3 Positions and lenses are holographically related

There is no primacy split where positions are one subsystem and lenses are another. The positions are the **numerical nature of the lenses**, and the lenses are the **epistemic articulation of the positions**. The plugin must not dualize them into unrelated modules.

### 2.4 Pedagogy is a mode, not a separate world

Pedagogy matters, but it should not be overbuilt as a heavy parallel subsystem. It is a conversational mode in which the same resources, rubrics, and capabilities are surfaced explicitly to help a user understand the system.

### 2.5 Resources and executables must stay distinct

The cleanest architectural split is:

- **resources**: ontology, mappings, correspondences, topology, lens breakdowns, examples
- **executables**: rubrics, logics, heuristics, traversal behaviors, artifact lifecycles

No executable should be the only place where theory exists. No theory resource should be mistaken for runtime logic.

### 2.6 `/Thought/*` is a live working layer when persistence exists

`/Thought/*` is not passive filing. It is an active artifact layer for process support, especially during subagent execution, handoff, cross-session continuity, and compaction-time reflection. This applies only when filesystem access or equivalent persistent storage is available.

## 3. Translation of the Theory into Plugin Form

### 3.1 Source layer

The source layer preserves:

- `#` as generative condition
- paradox as origin-condition
- the claim that all later structure is an articulation of this inversion-image

Plugin consequence:

- source is preserved in canonical resources
- source informs runtime stance
- source is never treated as a normal skill entrypoint

### 3.2 Topological layer

The plugin should treat topology as executable logic, not symbolic ornament.

- **Möbius**: the image of self-inversion; paradox as such
- **Torus**: coherent one-sided circulation; stable traversal
- **Klein**: doubled inversion; inside/outside held together
- **Lemniscate**: recursive fold generating internal `.0-.5` nesting and transcendence

Plugin consequence:

Topological mode should be part of routing state.

### 3.3 Coordinate layer

The coordinate layer preserves:

- Day positions `P0-P5`
- Night positions `P0'-P5'`
- Day lenses `L0-L5`
- Night lenses `L0'-L5'`
- the three Klein V4 squares
- Möbius returns and complementary pairings

Plugin consequence:

The plugin should not merely expose a lens catalog. It should expose a field whose structural relations matter at runtime.

### 3.4 Rubric layer

The plugin's main rubrics should be:

- **tetralemma**
- **CMEA**
- the **L4' scientific loop**

These are not optional add-ons. They are the core executable means by which paradox is addressed, diagnosed, and carried into action.

## 4. The Plugin Architecture

The plugin should follow the same overall repo pattern as the local `superpowers` reference plugin, while remaining specific to the Epi-Logos ontology.

### 4.1 Core shape

```text
/README.md
/AGENTS.md

/resources/
  /canon/
  /raw/

/skills/

/commands/

/agents/

/hooks/

/docs/
  /specs/
  /architecture/

/tests/

/.claude-plugin/
/.codex/
```

### 4.2 Resource side

The canonical resource side should eventually contain:

- source doctrine
- topology doctrine
- position descriptions
- lens descriptions
- square relations
- paradox rubrics
- correspondences and mappings
- examples and worked traversals
- `/Thought/*` artifact schema

### 4.3 Executable side

The executable side should eventually contain:

- use-modality selection
- topological-mode selection
- encounter-axis engagement
- tetralemma enactment
- CMEA enactment
- positional coherence walk
- `L4'` scientific-loop enactment
- `/Thought/*` artifact management
- session-end / compaction reflection and compression
- light pedagogical conversation

## 5. The Fundamental Design Insight: Three Squares, Not Twelve Isolated Skills

The lens system should not be implemented as 12 independent executable personalities. The more faithful orchestration backbone is the **three Klein V4 squares**.

### 5.1 Square A: articulation axis

`L0`, `L5`, `L5'`, `L0'`

This square governs:

- question
- number
- speech
- articulation
- naming
- expression
- incarnation of meaning

Runtime role:

This square is the plugin's **grammar**. It is almost always present, but it is rarely the main foreground action. It governs how the system asks, names, articulates, and compresses.

### 5.2 Square B: encounter axis

`L1`, `L4`, `L4'`, `L1'`

This square governs:

- objective structure
- subjective immediacy
- phenomenological disclosure
- scientific intervention
- lived concern
- causal explanation

Runtime role:

This is the plugin's **main entry surface**. Most real tasks begin here because every inquiry has both lived and investigatory aspects.

### 5.3 Square C: transformation axis

`L2`, `L3`, `L3'`, `L2'`

This square governs:

- contradiction
- process
- history
- transmutation
- paradox
- emergent transformation

Runtime role:

This is the plugin's **engine of movement**. It is where contradiction is held, process is tracked, history is considered, and transformation becomes possible.

## 6. What Each Lens Actually Contributes

### 6.1 Articulation axis

#### L0 — Quaternal

Role:

- supplies question grammar
- establishes how the positions become askable
- governs presuppositional framing
- holds the analogical relation among different expressions of the same structure

Best kept:

- strongly resource-side
- lightly executable for framing prompts, questions, and transitions

#### L0' — Archetypal-Numerical

Role:

- reveals the numerical skeleton of the inquiry
- detects unity, polarity, triad, quaternity, quintessence, and hexadic completion
- protects the system from losing its psychoid number-ground

Best kept:

- mostly resource-side
- invoked when numeric/archetypal patterning matters

#### L5 — Para Vāk

Role:

- governs expression-density
- turns synthesis into speech, writing, code, or articulated output
- shapes how an insight becomes sayable

Best kept:

- partly executable
- important for final articulation, naming, and output compression

#### L5' — Divine Logos

Role:

- governs effective or incarnated expression
- translates articulation into world-bearing or historically effective form
- anchors expression in enacted consequence rather than pure abstraction

Best kept:

- partly executable
- important where outputs must land as decisions, directives, or world-facing artifacts

### 6.2 Encounter axis

#### L1 — Causal

Role:

- restores four-cause reasoning
- resists modern flattening into efficient causation alone
- asks what is materially given, what acts, what patterns, and what aims

Best used in:

- applicative mode
- explanatory mode
- any run needing a robust "why"

#### L1' — Phenomenal

Role:

- foregrounds qualia, psychic function, and immediate lived apprehension
- reveals how the issue is undergone from the inside

Best used in:

- diagnostic mode
- explanatory mode
- Klein runs where subjective and objective must be held together

#### L4 — Phenomenological

Role:

- gives the disclosed world of the issue
- reveals situation, concern, horizon, embodiment, and lived meaning
- clarifies how the knower is already implicated

Best used in:

- explorative mode
- explanatory mode
- diagnostic mode when the frame itself is suspect

#### L4' — Scientific

Role:

- gives the explicit current-state -> ideal-state loop
- operationalizes intervention and verification
- preserves paradigm-awareness while still moving toward concrete state change

Best used in:

- applicative mode
- diagnostic mode
- research tasks
- implementation and verification work

### 6.3 Transformation axis

#### L2 — Logical

Role:

- houses tetralemma
- protects paradox from binary reduction
- opens silence as a real fifth position

Best kept:

- highly executable
- one of the core rubrics of the plugin

#### L2' — Alchemical-Elemental

Role:

- assigns elemental charge
- identifies transformation medium
- clarifies what kind of transmutation is occurring

Best used in:

- diagnostic runs
- symbolic or psychological interpretation
- any work where the quality of transformation matters

#### L3 — Processual

Role:

- tracks becoming rather than static identity
- reveals concrescence, novelty, and subjective aim
- gives the micro-dynamics of emergence

Best used in:

- explorative mode
- applicative mode where unfolding matters
- any run needing process sensitivity

#### L3' — Chronological

Role:

- places the inquiry in macro-temporal or historical sequence
- tracks cycle, seasonality, decline, incubation, return

Best used in:

- diagnostic mode
- explanatory mode
- long-horizon or historical inquiries

## 7. Use Modalities

The plugin's first executable choice should be **use modality**.

### 7.1 Diagnostic

Purpose:

- identify incoherence
- surface hidden pattern
- expose blockage, contradiction, repression, or frame error

Typical emphasis:

- Klein mode
- `L4/L4'` together
- `L2`, `L3`, `L1'`, `L2'`
- CMEA
- tetralemma

### 7.2 Applicative

Purpose:

- move from a current state toward a desired state
- produce a working intervention

Typical emphasis:

- Torus mode first
- `L4'`, `L1`, `L3`
- tetralemma when contradiction appears
- verification at the end

### 7.3 Explorative

Purpose:

- open the field
- discover what the inquiry really is
- generate possibilities without premature closure

Typical emphasis:

- Torus or lemniscatic mode
- `L0`, `L4`, `L2`, `L3`
- light use of `L0'` and `L2'`

### 7.4 Explanatory

Purpose:

- make the system or a case intelligible
- communicate structure cleanly

Typical emphasis:

- Torus mode
- `L0`, `L1`, `L4`, `L5`
- pedagogical surfacing of distinctions where needed

## 8. Topological Modes in Runtime

The plugin should treat topology as executable mode.

### 8.1 Torus mode

Character:

- coherent one-sided traversal
- stable movement through the field
- foregrounds one expression of the encounter axis

Use when:

- the inquiry is coherent enough for straightforward movement
- the task is explanatory, exploratory, or applicative without hard doubling

### 8.2 Klein mode

Character:

- doubled traversal
- inside/outside must be held together
- subjective and objective cannot be cleanly separated

Use when:

- contradiction is active
- the inquiry's own frame is implicated
- diagnosis requires inversion
- the problem appears differently from inside and outside

### 8.3 Lemniscatic mode

Character:

- recursive fold at `P4`
- `.0-.5` internal nesting
- transcendence generated through recursion rather than imposed from above

Use when:

- existing framing is insufficient
- synthesis must emerge through recursive contextual folding
- the inquiry must generate its own transcendence toward `P5`

## 9. Positions as the Practical Coherence Walk

The runtime should not begin practically from `P0`. It should begin from manifestation.

### 9.1 Practical flow

`P1 -> P2 -> P3 -> P4 -> P5 -> P0`

### 9.2 Meaning of the flow

#### P1

Establish what is actually there.

#### P2

Expose movement, force, contradiction, obstruction, or dynamis.

#### P3

Identify pattern, form, type, or recurrent structure.

#### P4

Contextualize and recursively fold the inquiry.

#### P5

Open synthesis only if coherence across `P1-P4` is real.

#### P0

Receive the return as renewed ground.

### 9.3 Night movement

Night positions are not just "the same again but critical." They are the inverted analytic walk:

- `P0'`: radical question / abyss / origin-problem
- `P1'`: hidden form / residue / evidence
- `P2'`: obstruction / challenge / shadow dynamic
- `P3'`: hidden pattern / recurrence
- `P4'`: missed context / source opening / discovery
- `P5'`: crystallization / insight

Night is most important in Klein and diagnostic use.

## 10. Rubrics and Logics

### 10.1 Tetralemma

Tetralemma should be treated as a primary runtime rubric, not merely a logical note inside `L2`.

It lets the plugin ask:

- what **is**
- what **is not**
- what is **both**
- what is **neither**
- what must be left in **silence**

Use when:

- contradiction appears
- the field is polarized
- ordinary binary framing is collapsing
- synthesis is impossible without holding paradox first

### 10.2 CMEA

CMEA should be treated as the main diagnostic critique rubric.

It is most useful for:

- surfacing privilege/repression dynamics
- exposing what a system says explicitly versus what it depends on implicitly
- showing where a field's official story and its hidden operations diverge

Use when:

- diagnosis is needed
- critique is requested
- a system appears stable but anomalies persist

### 10.3 L4' scientific loop

The `L4'` loop is:

- Observe
- Think
- Plan
- Build
- Execute
- Verify

with outer:

- Learn

This does not add a new ontology coordinate. It is an executable loop nested inside `L4'`.

Use when:

- current-state -> ideal-state movement is needed
- intervention and verification are central
- code, research, or operational tasks require explicit state change

## 11. `/Thought/*` as Active Working Memory

This point should be unambiguous.

### 11.1 One shared field, 12 artifact families

The plugin should use one shared `/Thought/` field containing 12 active artifact families.

Objective six:

- `/Thought/Questions/`
- `/Thought/Traces/`
- `/Thought/Challenges/`
- `/Thought/Patterns/`
- `/Thought/Discovery/`
- `/Thought/Insight/`

Subjective six:

- `/Thought/Being/`
- `/Thought/Thrownness/`
- `/Thought/Presence/`
- `/Thought/Temporality/`
- `/Thought/Care/`
- `/Thought/Releasement/`

### 11.2 These are active, not archival

When filesystem access or equivalent persistence is available, these artifacts should be live during execution.

They are especially important for:

- subagent execution
- handoff between subagents
- cross-session persistence
- compaction-time continuity
- multi-step investigations

### 11.3 Filesystem condition

This layer applies only when persistent storage is actually available.

If filesystem access is unavailable:

- the same structure may be followed conceptually
- but no persistence should be promised

### 11.4 Compression and reflection

Near compaction, handoff, or session completion, the system should explicitly:

1. review current task state
2. review active `/Thought/*` artifacts
3. compress them toward level-5 synthesis

Compression targets:

- objective runs compress upward toward `/Thought/Insight/`
- subjective runs compress upward toward `/Thought/Releasement/`
- mixed runs should produce bridged compressed summaries in the relevant level-5 channels

This is how the plugin avoids raw artifact sprawl and turns process into durable learning.

## 12. Subagent and Cross-Session Design

### 12.1 Subagents

Subagents should be able to:

- inherit relevant `/Thought/*` state
- write back to assigned artifact families
- hand off compressed summaries instead of only raw notes

### 12.2 Cross-session continuity

When persistence exists, a new session should be able to recover:

- the active modality
- the recent topological mode
- the relevant coherence state
- the level-5 syntheses already achieved
- the unresolved artifact channels still in play

### 12.3 Compaction behavior

Near compaction, the plugin should prompt reflection and compression rather than silently dropping process state.

## 13. Pedagogy as Lightweight Conversational Mode

Pedagogy should not be over-specified as a separate giant subsystem.

The pedagogical mode should simply:

- explain distinctions clearly
- surface the same resources more explicitly
- compare coordinates, lenses, and rubrics
- walk users through actual traversals
- help users converse with the system rather than memorize a static doctrine

The information and the agent capabilities should carry most of the pedagogical work.

## 14. Recommended Executable Surface

The first-pass executable surface should stay small.

### 14.1 Core executables

- `choose-modality`
- `choose-topological-mode`
- `engage-encounter-axis`
- `apply-tetralemma`
- `apply-cmea`
- `run-positional-coherence`
- `run-l4-prime-loop`
- `manage-thought-artifacts`
- `compress-thought-artifacts`
- `converse-pedagogically`

### 14.2 Why small is better

The theory is expansive, but the executable surface should be disciplined. The plugin should rely on a rich resource field and a small number of powerful rubrics, not on dozens of narrowly specialized behavior-skills.

### 14.3 Specialist agent surface

The specialist agent layer should also stay small and theory-faithful.

Recommended first-pass agents:

- `ql-cartographer`
- `mef-diagnostician`

`ql-cartographer` should specialize in question-shaping, topological clarification, positional mapping, and tetralemmic expansion. It should help determine what sort of inquiry is actually in play before the system drifts into diagnosis or explanation.

`mef-diagnostician` should specialize in lens-aware diagnosis, CMEA, explicit-vs-implicit comparison, repression/anomaly analysis, and scalar critique. It should diagnose a field's fractures without losing connection to the live traversal.

The intended relation is:

1. `QL` clarifies the structural shape of the inquiry
2. `MEF` diagnoses the epistemic condition of the field
3. the main run continues through the chosen modality, topology, and coherence walk

## 15. Recommended Resource Inventory

The first-pass canonical resources should include:

- `source-hash.md`
- `topology-overview.md`
- `positions-day-night.md`
- `lenses-day.md`
- `lenses-night.md`
- `squares-and-mobius-returns.md`
- `tetralemma.md`
- `cmea.md`
- `thought-artifacts.md`
- `runtime-modes.md`
- `worked-traversals.md`

## 16. Design Tensions to Preserve

The plugin should preserve, not prematurely resolve, these tensions:

- source vs manifestation
- subjective vs objective
- paradox vs coherence
- question vs articulation
- number vs speech
- process vs form
- diagnosis vs application
- persistence vs ephemerality

These tensions are not signs of bad design. They are the very substance the plugin is meant to carry.

## 17. Suggested Next Phases After Spec Approval

### Phase 1: Canonical resource extraction

Create clean canonical resource files from the current corpus without losing nuance.

### Phase 2: Executable skeleton

Create the small executable surface described above, but do not overbuild.

### Phase 3: `/Thought/*` persistence layer

Implement artifact lifecycle behavior only where filesystem access exists.

### Phase 4: Host packaging

Add thin `.claude-plugin/` and `.codex/` packaging around the shared bundle.

### Phase 5: Real verification

Add tests for:

- skill triggering
- routing behavior
- artifact lifecycle
- compaction/reflection prompts
- cross-session continuity when persistence exists

## 18. Final Design Claim

The Epi-Logos plugin should be a **skills-centered paradox-coherence field**.

It is not mainly a prompt package.  
It is not mainly a lens encyclopedia.  
It is not mainly a pedagogy system.  
It is not mainly a task tracker.

It is a plugin that lets an agent:

- enter an inquiry honestly
- hold paradox coherently
- traverse manifestation and inversion without collapse
- generate synthesis through contextual recursion
- return to renewed ground
- persist and compress the process when persistence is available

That is the cleanest first-pass design implicit in the materials so far.
