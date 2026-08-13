# App Interface Mockup Skill Package

This package contains a first complete draft of the `app-interface-mockup` skill and its design workbench.

## Contents

- `SKILL.md` — required runtime process and recognition gate.
- `references/professional-software.md` — professional tool posture and failure vocabulary.
- `references/state-and-geometry.md` — state brief and geometry contract.
- `references/reference-and-evidence.md` — optional current-state and visual-reference gathering.
- `references/review-and-recognition.md` — render critique and recognition protocol.
- `references/skill-authoring-notes.md` — meta guidance for the next skill-writing pass.
- `templates/mockup-shell/` — React/Vite single-page review workbench with nested mockup slot and local comments.
- `SKILL-FAMILY-MAP.md` — proposed six-family QL-aligned skill system around research, writing, mockups, HTML accounts, technical packs, and recognition.

## Design ancestry

The package preserves three existing decisions from the broader design-documentation work:

1. visual questions should become visual artifacts when that reduces ambiguity;
2. section-relative commentary should remain attached to its referent;
3. HTML/document shells should support understanding without becoming the semantic authority for product intent.

The workbench therefore provides context and review around the mockup while leaving the nested application component free to use its own composition.

