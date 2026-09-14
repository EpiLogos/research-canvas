# Professional Software Design Reference

Use this reference to keep a mockup in the design space of serious working software.

## 1. Design for repeated work

Assume the user can spend hours in the product.

The interface should support concentration, orientation, fast repeated actions, state recovery, inspection, and correction. It should not require the visual rhetoric of a landing page to stay understandable.

A professional interface can be beautiful. Its beauty normally comes from proportion, rhythm, information structure, precision, material restraint, and confident behaviour.

## 2. Stage dominance

Identify the main work surface for the current state.

Examples include:

- spatial canvas;
- source document;
- code editor;
- timeline;
- map or globe;
- media preview;
- 3D environment;
- diagram editor;
- data table;
- terminal.

Give that surface the largest meaningful share of the viewport.

A permanent panel must justify the area it removes from the work.

## 3. Density is a design variable

Do not equate clarity with large spacing.

Professional users often benefit from:

- compact rows;
- small stable labels;
- thin rules;
- efficient metadata placement;
- progressive disclosure;
- keyboard access;
- hover or selection controls;
- resizeable panes;
- narrow status regions.

Increase density where repetition and comparison benefit from it. Preserve larger space where manipulation, reading, mapping, or visual perception needs it.

## 4. Tool versus dashboard

A dashboard reports on work. A tool performs work.

If the primary screen is mostly summaries, cards, metrics, and launch buttons, check whether the task actually needs a dashboard.

For authoring and analysis surfaces, prefer direct access to the material being authored or analysed.

## 5. Contextual controls

Keep frequent global operations stable. Reveal local operations near the selected object or in a context region.

Use:

- selection toolbars;
- context menus;
- command palettes;
- inspectors;
- keyboard shortcuts;
- transient overlays;
- drag handles;
- direct manipulation.

Do not turn every command into a permanent button.

## 6. Shared shell, specialised workspace

Preserve product identity through shared typography, command language, navigation, selection semantics, tokens, and status treatment.

Let each workspace reorganise around its dominant act.

A map can be almost all map. A timeline can use the horizontal axis aggressively. A 3D workspace can hide most chrome until summoned.

## 7. Failure vocabulary

Use these terms during critique.

### Generic SaaS smell

The design uses a generic web-dashboard grammar where specialist working software needs a tool grammar.

Signals include feature cards, oversized panels, roomy marketing spacing, large rounded containers, summary metrics, and permanent primary buttons.

### Mockup inflation

Type, controls, padding, rails, or icons are much larger than sustained working software requires.

### Panel symmetry

Columns receive similar width or weight because a grid is convenient, not because the task needs it.

### Feature exhibition

The screen shows many capabilities simultaneously to prove they exist. The working state becomes unclear.

### Dead stage

The main work surface contains less meaningful information than the chrome around it.

### Decorative density

Badges, pills, labels, cards, mini charts, and metadata make the screen busy without increasing usable state information.

### Button leakage

Commands that belong in context menus, commands, shortcuts, drag actions, or selection tools become standing buttons.

### Surface homogenisation

Distinct workflows become cosmetic variants of one layout.

### Agent colonisation

AI occupies permanent prime space without the working state requiring conversation.

### Reference cosplay

The mockup copies the visible skin of a reference instead of translating the design principle that solved the underlying problem.

### False minimalism

Controls or state information are removed to achieve visual cleanliness, but the user loses orientation or power.

### Card capture

Every semantic unit becomes a rounded card. Spatial and relational structure is flattened into containers.

### Demo-state unreality

The interface contains clean placeholder content, convenient counts, perfect labels, or empty areas that a real session would not produce.

## 8. Positive review questions

Ask:

- What work can the user perform immediately?
- What occupies most of the visible area, and should it?
- Which controls stay visible because they are frequent or global?
- Which controls appear because of selection or mode?
- Does the density match prolonged use?
- Can the user recover their current scope and selection?
- Does each panel have a stable informational role?
- Does the interface explain itself through state and affordance rather than labels alone?
- Does this surface differ from adjacent surfaces for a good reason?
- Can the user imagine returning to this state tomorrow and continuing?

