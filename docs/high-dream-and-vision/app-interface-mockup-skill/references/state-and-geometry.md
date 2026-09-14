# State Brief and Geometry Contract

## 1. State brief

Write the state brief before layout.

Use this form:

```yaml
state_id: stable-kebab-case-id
surface: exact product surface
mode: recovery-grounded | intent-led | hybrid
actor: who is working
primary_goal: one concrete goal
entry_context: what the user was doing immediately before this state
active_scope: project / document / object / scene / workspace scope
active_objects:
  - meaningful object currently visible or selected
selection: exact selection state
primary_action: action the user is performing or preparing
secondary_actions:
  - only actions relevant to this state
visible_consequence: what changed or will change because of the action
supporting_information:
  - information that must stay visible
hidden_or_deferred:
  - information intentionally not visible until requested
agent_role: absent | contextual | primary
network_state: offline | local | opt-in live | not relevant
open_design_questions:
  - unresolved question
```

The state must be specific enough to constrain the interface.

## 2. Representative reality

Use realistic values.

Avoid:

- Item 1 / Item 2;
- Lorem ipsum;
- “Project Alpha” unless the domain requires anonymisation;
- convenient round counts;
- placeholder charts that do not relate to the state;
- showing every object type once.

Representative content does not need to be production data. It must behave like production content.

## 3. Geometry contract

Write the geometry contract before detailed visual styling.

Use this form:

```yaml
viewport:
  canonical: [1600, 1000]
  alternate: [1366, 768]
logical_scale: 1
regions:
  app_bar: { height: 38, permanent: true }
  project_rail: { width: 232, mode: docked }
  stage: { min_share: 0.68 }
  inspector: { width: 304, mode: selection-dependent }
  status_bar: { height: 24, permanent: true }
density:
  dense_row: 28
  normal_row: 34
  control_height: 28
  icon: 14
  ui_text: 12
  metadata_text: 11
  body_text: 15
spatial_rules:
  - stage remains the largest region
  - inspector is absent without a meaningful selection
  - local object actions stay near the selected object or inspector
collapse_rules:
  - at 1366px project rail can narrow or overlay
  - inspector overlays or closes before stage becomes unusable
```

These values are examples, not defaults.

## 4. Measuring references

When a reference is useful, estimate or measure ratios such as:

- top bar height / viewport height;
- side rail width / viewport width;
- stage area / visible area;
- row height / UI text size;
- inspector width / stage width;
- timeline height / preview height;
- map chrome area / map area.

Prefer ratios when source screenshots have unknown physical size.

## 5. Geometry critique

Before styling, ask:

- Can the primary task be identified from the rectangles alone?
- Does any permanent region consume space without a frequent role?
- Is the stage large enough for the actual work?
- Are panels too symmetrical?
- Is the information density believable?
- Does the geometry change appropriately for the surface?
- Does a smaller viewport collapse panels in the correct order?

Do not proceed to visual polish until these questions have acceptable answers.

