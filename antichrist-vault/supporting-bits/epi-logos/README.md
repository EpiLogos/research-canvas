# Epi-Logos Plugin

This is the plugin bundle. See the repository root README for full context, install instructions, and an overview of the architecture.

## Bundle Contents

```
epi-logos/
├── .claude-plugin/     Claude Code host manifests
├── .codex/             Codex host install notes
├── skills/             executable skills
├── commands/           command wrappers
├── resources/          canon summaries, pedagogy, topologicals
│   ├── canon/          primary skill-facing resources
│   ├── pedagogy/       structured teaching materials
│   └── ...             raw research corpus
├── agents/             specialist agent prompts
├── docs/               design specs and notes
├── scripts/            validation tooling
└── tests/              scaffold checks
```

## Entry Point

`skills/using-epi-logos` is the bootstrap. Every other skill routes through it.

## Validation

```bash
python3 scripts/validate_scaffold.py
```
