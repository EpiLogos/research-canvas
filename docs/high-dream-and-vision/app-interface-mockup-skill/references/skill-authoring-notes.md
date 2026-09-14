# Skill Authoring Notes

Use this file when refining the skill system itself.

## 1. Predictable process, variable output

Matt Pocock's `writing-great-skills` frames predictability as the root virtue of a skill: the same class of task should receive the same process, even when the output should differ.

Source:
`https://github.com/mattpocock/skills/blob/main/docs/productivity/writing-great-skills.md`

This mockup skill follows that principle through a fixed sequence:

```text
brief → state → evidence/reference decision → geometry → build → render → critique → revise → recognise
```

The visual result is intentionally not deterministic.

## 2. Invocation choice

This skill keeps a description because another skill, such as an HTML design-account skill, may need to reach it when a consequential app mockup is required.

Keep the description narrow. It should trigger for professional application mockups and interactive product-state prototypes, not for ordinary diagrams or decorative web layouts.

## 3. Progressive disclosure

Keep the required execution steps in `SKILL.md`.

Move branch-specific detail behind explicit pointers:

- professional-software rules;
- evidence/reference recovery;
- state and geometry forms;
- render-review criteria;
- template implementation.

Pull a rule back into `SKILL.md` only when agents repeatedly miss it because the pointer is too weak.

## 4. Co-location

Keep a concept with its rules and caveats.

Do not scatter “generic SaaS” guidance through six files. Define the failure clearly in one reference and keep only the non-negotiable statement in `SKILL.md`.

## 5. Pruning tests

For each instruction, ask:

- Does removing it change agent behaviour?
- Does another line already say the same thing?
- Is it required on every run or only one branch?
- Is it current design law or sediment from one project?

Delete no-op, duplicate, and stale instructions.

## 6. Leading concepts

Useful leading concepts for this skill are:

- **working state** — keeps the agent from designing feature exhibitions;
- **instrument** — pulls specialist software away from generic SaaS assumptions;
- **geometry contract** — makes proportion explicit before styling;
- **render evidence** — makes visual inspection part of reasoning;
- **recognition gate** — prevents premature completion.

Use these terms consistently.

## 7. ASD-STE100

ASD-STE100 Issue 9 became the current international standard in January 2025. Its controlled-language discipline is useful for procedures and technical review because it emphasizes stable terminology, clear sentence structure, and direct instructions.

Official source:
`https://www.asd-ste100.org/`

Use STE as a clarity discipline. Do not falsely claim compliance without checking the standard and dictionary.

