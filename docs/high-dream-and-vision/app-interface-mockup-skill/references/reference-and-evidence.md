# Reference and Evidence Protocol

Reference gathering is conditional. Use it when it materially reduces design uncertainty.

## 1. Evidence classes

Keep these classes separate.

### Current product evidence

Screenshots, running application states, components, tokens, field names, assets, routes, or prior design files from the product being designed.

This evidence can show current reality. It does not automatically define target intent.

### Adjacent product references

Images or live products selected because they solve a specific interaction, density, geometry, or visual-language problem.

### Domain references

Visual or material references from the product domain: historical maps, scientific instruments, editing suites, archival systems, media tools, diagrams, physical workspaces, or other relevant forms.

### Generated visual material

Purpose-made imagery used inside a mockup or as exploratory reference. It is not evidence of existing product reality.

## 2. Reference question first

Do not begin with “find inspiration.”

Write a question such as:

> How can a dense object inspector remain legible without turning every field into a card?

Search for references that can answer it.

## 3. Reference ledger

Keep a ledger like this:

```yaml
- id: ref-01
  source: product or URL
  type: current-product | adjacent-product | domain | generated
  question: what this reference is meant to answer
  lesson: exact principle retained
  measurements:
    stage_share: 0.74
    rail_ratio: 0.16
  authority: constraint | evidence | inspiration
  copy_boundary: what must not be copied literally
```

A retained reference without a question or lesson is moodboard noise.

## 4. Screenshot recovery

When current screenshots are useful, try these sources in order:

1. supplied screenshots or design artifacts;
2. repository images and issue attachments;
3. runnable application states;
4. storybook or component preview environments;
5. documented screenshots in project docs;
6. user-provided capture.

Do not block the design because screenshots are unavailable.

In Intent-led mode, skip this recovery unless a concrete question justifies it.

## 5. Running an existing app

If the application can be run safely and locally:

- capture representative current states;
- record viewport size;
- note which state is real and which data is seeded;
- inspect interaction behaviour, not only visual appearance;
- capture details that influence density and geometry.

Do not treat startup difficulty as a reason to invent current-state claims.

## 6. Reference diversity

Prefer several references with different jobs over one product treated as a master skin.

For example:

- one reference for stage proportion;
- one for timeline density;
- one for inspector behaviour;
- one for command access;
- one domain reference for product-specific atmosphere.

## 7. Translating a reference

Translate this:

> “Figma uses a narrow property rail and contextual selection controls; the stage remains dominant.”

Do not translate this:

> “Make our product look like Figma.”

The first carries a solved design relation. The second causes reference cosplay.

