# Mockup Shell Template

This is the skill's default single-page design workbench. It has a React version and a zero-build standalone HTML fallback.

It extracts the useful review idea from the larger HTML account shell without importing the full six-surface documentation layout.

## What stays outside the mockup

The workbench owns:

- state brief;
- design mode;
- geometry contract;
- reference ledger;
- viewport switching;
- review lenses;
- section/state-relative comments;
- recognition checks.

The nested mockup owns the target application interface.

Do not style the target application to match the workbench.

## Zero-build fallback

`static-single-page.html` preserves the same state / geometry / review separation without React. Replace only the contents of `#mockupRoot`. The right rail stores review comments and recognition checks in local storage.

Use it when the session needs a directly openable HTML artifact or when a React toolchain is not available.

## React seam

Replace `ExampleMockup` with any React component:

```tsx
<AppMockupShell {...designContext}>
  <CanvasWorkingState />
</AppMockupShell>
```

The nested component receives a fixed logical viewport. The shell scales it to fit the available centre region without changing its internal pixel geometry.

This makes screenshot proportions inspectable while the outer review UI remains responsive.

## Commenting model

Comments persist in `localStorage` under:

```text
app-mockup:<product>:<state-id>:comments
```

Each review lens has its own comment collection. Comments can be resolved or reopened.

Recognition checks persist separately.

This is derived from the section-relative note principle in the QL HTML Account template: commentary stays attached to the part of the design that gives it meaning.

## Suggested use in an agent session

1. Copy this template into the working directory.
2. Replace the example state brief.
3. Replace the geometry contract.
4. Replace `ExampleMockup` with the target product state.
5. Run the development server.
6. Capture the canonical viewport.
7. Review the render with the right rail.
8. Record visible failures as comments.
9. Revise the nested mockup.
10. Capture again.
11. Mark recognition checks only after visual verification.

## Screenshots are optional inputs

The template does not require a screenshot of an existing application.

Use current screenshots in Recovery-grounded or Hybrid mode when they answer a real design question. In Intent-led mode, the mockup can begin from product intent and external/domain references only.

## Export

The workbench is authoring infrastructure.

For a design account, export either:

- the nested mockup component;
- a canonical screenshot;
- a simplified embedded interactive state;
- or a standalone built page.

Do not force the authoring rails into the final product documentation when they are not useful to the reader.

