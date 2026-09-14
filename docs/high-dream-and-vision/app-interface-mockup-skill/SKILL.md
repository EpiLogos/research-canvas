---
name: app-interface-mockup
description: Design and iteratively refine consequential professional application interfaces as credible working-state mockups. Use when a product, feature, or design-intent artifact needs a realistic app screen, interaction surface, or visual prototype rather than a generic illustrative UI. Supports evidence-grounded, hybrid, and deliberately unconstrained future-state design; reference gathering is conditional, while render-inspect-revise validation is mandatory.
argument-hint: Give the product or surface, the intended user state or task, source/design material, desired design freedom, target viewports, and any implementation or visual references that should or should not constrain the mockup.
---

# App Interface Mockup

Design application interfaces that look and behave like credible professional software.

The skill does not make decorative pictures of software. It develops a specific working state through repeated design, rendering, inspection, critique, and revision.

The root virtue is **credible working reality**. The process must be predictable even when the visual result changes.

## 1. Governing rules

1. **State precedes screen.** Define the exact moment of use before you design the interface.
2. **Professional software is the default frame.** Design for sustained daily use, not for a marketing dashboard.
3. **The main work surface dominates.** Permanent chrome serves the work and does not compete with it.
4. **Geometry precedes decoration.** Establish viewport, regions, density, hierarchy, and proportions before visual polish.
5. **Representative reality replaces filler.** Use believable project names, objects, selections, content, counts, states, and actions.
6. **Different work deserves different composition.** Shared shell does not imply one panel layout for every surface.
7. **References answer questions.** Gather references to solve identified interaction, proportion, density, or visual-language problems.
8. **Current software is evidence, not a ceiling.** Use existing screenshots or implementation only when the chosen design mode requires them.
9. **Rendered output is the design evidence.** Do not approve a mockup from source code alone.
10. **Revision is mandatory.** A first render is a draft even when it looks plausible.
11. **Human authorship stays consequential.** Agentic help can gather, propose, test, and refine. It must not colonise the interface by default.
12. **Do not complete on generic plausibility.** Complete only when the mockup survives the recognition checks in this skill.

Read `references/professional-software.md` before substantial visual design. It defines the professional-software standard and recurring failure modes.

## 2. Choose the design mode

Choose one mode at the start. Record it in the state brief.

### A. Recovery-grounded

Use this when the current application state matters.

Inspect available implementation, screenshots, design files, components, tokens, icons, routes, and real data shapes. Recover the useful reality before you redesign it.

Do not preserve a current compromise merely because it exists.

### B. Intent-led

Use this when product design should be free from current implementation state.

Treat product intent, user work, domain semantics, and target experience as authority. Existing screenshots are optional and can be intentionally excluded.

Do not manufacture a fake legacy constraint.

### C. Hybrid

Use this when some current structures are valuable but the target experience can exceed them.

State what is retained, what is only evidence, and what is intentionally reopened.

## 3. Required workflow

Follow these steps in order. Do not skip directly to styling.

### Step 1 — Resolve the design brief

Identify:

- product and surface;
- target user and task;
- design mode;
- target viewport or viewport set;
- product intent and constraints;
- source material;
- required interactions;
- implementation constraints, if any;
- what must remain visually uncommitted.

**Complete when:** the authority and freedom of the design are explicit.

### Step 2 — Make the state brief

Use `references/state-and-geometry.md`.

Define one primary working state. Include the actor, goal, context, active objects, selection, visible consequence, primary action, supporting actions, and hidden or deferred information.

Do not design a surface called “Canvas.” Design a moment such as “a researcher selects a contested relation while editing the source-backed node that supports it.”

**Complete when:** another designer could describe what the screenshot depicts without seeing it.

### Step 3 — Recover evidence conditionally

If the mode is Recovery-grounded or Hybrid, inspect the current product before invention.

Look for:

- current screenshots;
- runnable frontend states;
- component and route structure;
- CSS variables or design tokens;
- existing icons and visual assets;
- real field names and object shapes;
- issue attachments and design files;
- real density and content constraints.

If these sources are unavailable, say so in the evidence ledger and continue.

If the mode is Intent-led, do not search for current screenshots unless they answer a specific open question.

**Complete when:** the agent knows what current-state evidence can and cannot constrain.

### Step 4 — Form reference questions

Before reference gathering, write 2–6 concrete questions.

Examples:

- How do mature editors expose relation controls without permanent button bars?
- What stage-to-inspector proportion remains useful during dense spatial work?
- How does a professional timeline show nested tracks without turning into cards?
- How can a map stay immersive while provenance remains reachable?

Gather visual references only for these questions.

Use `references/reference-and-evidence.md` for the reference protocol.

**Complete when:** every retained reference has a stated design lesson.

### Step 5 — Write the geometry contract

Fix the logical viewport and major dimensions before detailed styling.

Record:

- viewport size;
- permanent chrome dimensions;
- stage share of visible area;
- optional panel widths;
- row and control density;
- typography bands;
- spatial hierarchy;
- overlay and summon behaviour;
- responsive collapse rules.

Prefer measurements recovered from suitable references or the application type. Do not use generic dashboard spacing by habit.

**Complete when:** the interface can be blocked out as rectangles and still reads as the intended tool.

### Step 6 — Build the structural mockup

Start from `templates/mockup-shell/` unless the environment already supplies a stronger equivalent.

Use the nested `AppMockupShell` for review and viewport control. Put the actual application state inside its mockup slot.

At this stage:

- establish shell and workspace geometry;
- use real interaction regions;
- keep decoration restrained;
- keep the primary stage dominant;
- make panels conditional where the state permits it.

**Complete when:** the composition works without decorative polish.

### Step 7 — Add representative product state

Populate the interface with believable content.

Represent:

- actual object types;
- meaningful labels;
- realistic list lengths;
- selected and focused states;
- current action and consequence;
- real source or provenance forms where relevant;
- relevant empty, pending, loading, error, or unresolved state only when the brief needs it.

Do not add controls merely to demonstrate capability.

**Complete when:** every visible region has a reason to exist in this working state.

### Step 8 — Apply the product visual language

Now refine:

- type scale;
- spacing rhythm;
- separators;
- icon size;
- affordance hierarchy;
- selected, focused, disabled, and hover states;
- elevation only where depth has meaning;
- colour roles;
- surface-specific grammar;
- motion or transitions where they affect understanding.

Use HTML/CSS/SVG/React as the authority for application chrome and fine UI text.

Generated imagery can supply internal content such as environments, photographs, maps, illustrations, media, or scene imagery. Do not use generated raster UI as the authority for exact controls, tiny type, menus, or repeated components.

**Complete when:** the interface has a coherent visual system rather than decorative styling.

### Step 9 — Render and inspect

Render the mockup at the target viewport. Inspect the image at 100% and at fit-to-window scale.

Do not inspect only the DOM or CSS.

Use `references/review-and-recognition.md`.

Record concrete findings. Correct the failures. Render again.

**Complete when:** at least one critique-and-revision cycle has changed the rendered interface.

### Step 10 — Compare against references

Compare the revised mockup with the strongest retained references.

Ask which reference solves proportion, density, hierarchy, or interaction better. Translate the relevant principle. Do not copy the reference as a skin.

Render again after consequential changes.

**Complete when:** no retained reference exposes an obvious unresolved design weakness without an explicit reason.

### Step 11 — Strengthen product specificity

Ask whether the screen could belong to a generic adjacent product.

Strengthen the interface elements that express the actual product model, terminology, relationships, workflows, provenance, or specialist behaviour.

Do not add branding as a substitute for specificity.

**Complete when:** the working state is recognisable as this product because of its behaviour and information model.

### Step 12 — Validate alternate viewport

Validate the canonical viewport and at least one smaller realistic working viewport unless the user explicitly requests one fixed display.

Check:

- task remains legible;
- stage remains useful;
- side panels collapse or overlay intentionally;
- type does not inflate;
- critical actions remain reachable;
- no content becomes accidental overflow.

**Complete when:** the interface survives the intended working range.

### Step 13 — Deliver the mockup package

Return:

- editable mockup source;
- canonical rendered screenshot or captured view when the environment supports it;
- state brief;
- geometry contract;
- reference/evidence ledger when references were used;
- review notes and recognition status;
- unresolved design questions.

When the mockup is for a larger design document, provide an embeddable component or static capture without collapsing the standalone mockup source.

## 4. Non-negotiable professional-software posture

Professional software is designed for repeated work, concentration, speed, information density, recovery, and control.

Default toward:

- compact but legible controls;
- stage-first composition;
- thin separators instead of universal cards;
- context controls instead of standing button collections;
- toolbars that earn their permanent height;
- panels that can hide, overlay, resize, or change with the task;
- task-specific workspaces;
- consistent commands and selection behaviour;
- restrained rounding and elevation;
- realistic content density;
- keyboard and command access where appropriate;
- visible state without constant explanatory labels.

### Generic SaaS is a named failure mode

Do not default to a generic web dashboard grammar for specialist desktop or creative software.

A generic SaaS smell includes:

- feature cards as the primary workspace;
- large rounded rectangles around every information group;
- excessive whitespace caused by marketing-page spacing;
- oversized text and controls;
- equal three-column layouts with no task reason;
- permanent AI chat sidebars;
- prominent action buttons for commands that belong in context or command systems;
- friendly summary statistics that displace the actual work;
- every surface sharing the same panel composition;
- decorative gradients, badges, pills, and shadows used to manufacture richness.

These patterns are not prohibited in themselves. Use one only when the working state requires it.

## 5. Surface differentiation

A shared application shell supplies continuity. It must not erase workspace identity.

For each surface, decide independently:

- what must dominate the viewport;
- what information is permanent;
- what appears on selection;
- what appears on demand;
- which axis carries the work;
- what direct manipulation means;
- how density should feel;
- which other surfaces can be invoked without navigation loss.

Do not make every surface “left rail + cards + right inspector.”

## 6. Agent interface rule

Treat the agent as an intelligent participant in the work, not as a mandatory product column.

Prefer:

- contextual invocation;
- command or terminal access;
- selection-aware operations;
- reversible proposals;
- visible pending actions;
- concise activity traces;
- reopenable conversations attached to meaningful work context.

A permanent large chat region is justified only when conversation is the primary task of the state brief.

## 7. Writing standard

Use ASD-STE100 Simplified Technical English, Issue 9, as the default clarity discipline for technical instructions, state briefs, review findings, labels, and reference notes.

Use subject-specific technical nouns and verbs where precision requires them.

For skill procedures:

- use imperative sentences;
- put one instruction in a sentence where practical;
- put a necessary condition before its instruction;
- use stable terminology;
- prefer active voice;
- remove decorative transitions;
- keep technical precision when simplification would destroy meaning.

Do not claim formal ASD-STE100 compliance unless the actual text is checked against the current standard and dictionary.

Official source: `https://www.asd-ste100.org/`

## 8. Template contract

The default template lives at `templates/mockup-shell/`.

It provides:

- a fixed logical viewport with fit-to-container scaling;
- a nested React mockup slot;
- a zero-build standalone HTML fallback;
- state and geometry context;
- viewport selection;
- theme control;
- collapsible evidence rail;
- section/state-relative review rail;
- local review persistence;
- structured recognition checks;
- a place for product-specific mockup components without prescribing their layout.

The template is a **design workbench**, not the target application shell.

Do not preserve the template rails inside the application mockup unless the target product actually needs them.

Read `templates/mockup-shell/README.md` before modifying the workbench.

## 9. Recognition gate

A mockup can be marked `recognised` only when all of these are true:

- the state brief is specific;
- the geometry contract is explicit;
- the primary task is visually dominant;
- the interface has believable working density;
- the visible controls belong to the current state;
- the product is not reduced to generic SaaS grammar;
- the surface composition fits its own work;
- the product-specific information model is visible;
- at least one render-inspect-revise cycle occurred;
- critical review findings are resolved or explicitly accepted;
- the canonical viewport has been inspected at 100%;
- the alternate viewport was validated when required.

A polished first draft does not satisfy this gate by itself.

## 10. Progressive reference map

Read these files only when their branch becomes relevant:

- `references/professional-software.md` — always read for consequential app mockups.
- `references/state-and-geometry.md` — read while making the state brief and geometry contract.
- `references/reference-and-evidence.md` — read when current-state recovery or external visual reference gathering is used.
- `references/review-and-recognition.md` — read before the first visual critique pass.
- `references/skill-authoring-notes.md` — use when editing or splitting this skill itself.
- `SKILL-FAMILY-MAP.md` — use when deciding whether this task belongs in the wider design-documentation skill family.

