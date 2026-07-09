# Installing Epi-Logos for Codex

Enable Epi-Logos through Codex native skill discovery.

## Installation

1. Clone this repository.

2. Create the skills symlink pointing at `epi-logos/skills/`:

```bash
mkdir -p ~/.agents/skills
ln -s /path/to/repo/epi-logos/skills ~/.agents/skills/epi-logos
```

3. Restart Codex.

## Verify

```bash
ls -la ~/.agents/skills/epi-logos
```

You should see a symlink pointing at `epi-logos/skills/`.

## Notes

- Canonical resources are in `epi-logos/resources/`.
- `Thought/` artifacts are active only when filesystem access is available in the current session or workspace. The `Thought/` directory lives at the repo root, not inside the plugin bundle.
- The bootstrap skill is `using-epi-logos`. Everything else in the plugin routes through it.
