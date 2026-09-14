# Render Review and Recognition

The rendered image is the primary review object.

## 1. Minimum review loop

Use this loop at least once:

```text
BUILD
  ↓
RENDER AT TARGET VIEWPORT
  ↓
INSPECT AT 100%
  ↓
WRITE SPECIFIC FINDINGS
  ↓
REVISE SOURCE
  ↓
RENDER AGAIN
  ↓
COMPARE
```

A critique with no resulting change does not count unless every finding is explicitly accepted with reason.

## 2. Review lenses

### Working state

- Is the primary task obvious?
- Is the current selection or mode legible?
- Does each visible control belong to this moment?
- Does the content look inhabited rather than demonstrated?

### Geometry

- Does the main stage dominate?
- Are panels proportioned by task?
- Is any rail permanently wider than its information warrants?
- Is the viewport filled with useful work rather than framing?

### Density

- Are text and controls sized for sustained use?
- Are rows and lists too loose?
- Are cards used where separators or grouping would be stronger?
- Does metadata compete with primary content?

### Hierarchy

- What does the eye see first, second, and third?
- Does the hierarchy match the task?
- Are important states distinguishable without shouting?

### Interaction

- Are frequent actions stable and reachable?
- Are local actions contextual?
- Are direct-manipulation opportunities visible?
- Is command access present where a professional tool would benefit?

### Surface specificity

- Could this be another surface with labels changed?
- Does the composition fit the medium: map, timeline, editor, canvas, 3D space, media sequence, or other?

### Product specificity

- Which visible structures could only come from this product model?
- Is provenance, relationship, domain state, or specialist behaviour visible where relevant?
- Would removing the logo make the product anonymous?

### Agent posture

- Is agent UI proportional to its role in the state?
- Can the agent act on the current selection or scope?
- Are proposals reversible and legible?
- Has chat become a default layout habit?

### Visual language

- Are borders, radii, shadows, colour, and type roles systematic?
- Is depth used because elements occupy different layers?
- Are accents semantic?
- Are icons at professional working scale?

## 3. Named failure scan

Explicitly scan for:

- generic SaaS smell;
- mockup inflation;
- panel symmetry;
- feature exhibition;
- dead stage;
- decorative density;
- button leakage;
- surface homogenisation;
- agent colonisation;
- reference cosplay;
- false minimalism;
- card capture;
- demo-state unreality.

Write a finding when one is present. Do not hide it behind “could be polished.”

## 4. Recognition status

Use:

- `draft` — geometry or working state is still forming;
- `review` — the state is coherent and rendered, with unresolved critique;
- `recognised` — recognition gate passed;
- `superseded` — a later recognised mockup replaced this state.

## 5. Recognition record

Keep a compact record:

```yaml
status: review
render: canvas-relations-1600x1000-v3.png
critical_findings:
  - inspector still too wide for ordinary relation selection
  - top command row duplicates two context actions
accepted_tradeoffs:
  - project rail remains docked in this state because cross-constellation drag is active
next_revision:
  - reduce inspector by 36px and move relation action to selection popover
```

## 6. Final recognition questions

A mockup is ready to recognise when the answer to each question is yes:

- Does this look like software intended for real work?
- Does the working state feel specific and inhabited?
- Does the geometry support the task before the styling impresses?
- Is the interface free of accidental generic SaaS grammar?
- Does the surface have its own spatial logic?
- Does the product reveal its own information model?
- Did rendered critique materially improve the result?

