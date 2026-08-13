# Design and Knowledge Artifact Skill Family

This map is a planning frame for the next skill-writing pass. It is not a requirement that every task invoke six skills.

The six families form a QL-aligned descent from ground to recognised design object.

| QL | Skill family | Primary work | Candidate subskills |
|---|---|---|---|
| `#0` | Research & Grounding | Recover the real information horizon before design claims are made. | source recovery; repo archaeology; web research; evidence ledger; screenshot/reference recovery; current-state audit |
| `#1` | Writing & Definition | Turn ground into exact intent, terminology, requirements, scenarios, and explanatory prose. | product intent; experience writing; technical writing; ASD-STE100 edit; terminology control; requirements formulation |
| `#2` | Mockup & Interaction | Make behaviour spatial, manipulable, and experientially inspectable. | app-interface-mockup; state prototype; interaction flow; screen sequence; media/3D prototype; command/terminal transcript |
| `#3` | HTML Account & Visual Structure | Compose the materials into one navigable representational object. | ql-html-account; diagram composition; data display; navigation shell; annotation/review UI; standalone export |
| `#4` | Technical Design Pack | Descend from intended experience into system and program form. | domain model; system architecture; program design; interfaces; invariants; data/state flow; file/module map; validation design |
| `#5` | Synthesis, Review & Recognition | Harmonise the package, expose open decisions, recognise the current design, and prepare developmental continuation. | design harmonisation; critique; recognition gate; decision record; vertical-slice map; handoff pack; canonicalisation |

## 1. Why this division is useful

The split protects distinct kinds of judgement.

Research should not silently design the product. Writing should not substitute for interaction. Mockups should not become architecture. HTML should not become the semantic authority. Technical design should not rewrite intent. Recognition should integrate the layers without flattening their differences.

## 2. Router direction

If these skills become granular, add one lightweight user-facing router that answers:

> Which artifact are we trying to make true next?

It can route to the six families without loading every detailed skill into every session.

This follows the skill-writing distinction between context load and cognitive load: a small number of discoverable family skills can point to more specific procedures through progressive disclosure.

## 3. Natural package for a foundational product design run

A strong full design run can use this sequence:

```text
#0  recover project, sources, precedents, current state
 ↓
#1  write intent, experience, requirements, terms, scenarios
 ↓
#2  prototype consequential working states and interactions
 ↓
#3  compose the navigable HTML design account
 ↓
#4  derive system + program design from recognised experience
 ↓
#5  harmonise, review, recognise, and produce vertical development slices
```

The flow is recursive. A mockup can expose a missing requirement. A technical design can expose an impossible interaction. The work then returns to the earlier coordinate with a concrete reason.

## 4. Candidate first-pass skills

Start with a small set before splitting further:

1. `research-grounding` — evidence recovery and source ledger.
2. `design-spec-writing` — intent, experience, requirements, STE editorial discipline.
3. `app-interface-mockup` — the skill in this package.
4. `ql-html-account` — the existing navigable HTML skill.
5. `technical-design-pack` — system and program design with executable specificity.
6. `design-recognition` — cross-surface harmonisation, critique, decision and handoff.

Split a family only after recurring tasks reveal a stable branch with a distinct process.

