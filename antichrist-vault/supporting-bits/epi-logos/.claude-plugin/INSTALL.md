# Installing Epi-Logos for Claude Code

The plugin bundle lives in the `epi-logos/` subdirectory of this repository.

## Local Testing

Run Claude Code pointing at the plugin directory:

```bash
claude --plugin-dir /path/to/repo/epi-logos
```

Inside Claude Code, verify the install:

- run `/help` and confirm plugin commands appear under the `epi-logos` namespace
- try `/epi-logos:diagnose`
- try `/epi-logos:explore`
- try `/epi-logos:apply`
- try `/epi-logos:explain`

While editing the plugin, reload without restarting:

```text
/reload-plugins
```

## Marketplace Distribution

Once this repository is hosted, add it as a marketplace source from inside Claude Code:

```text
/plugin marketplace add <owner-or-repo>
```

The marketplace entry is defined in `.claude-plugin/marketplace.json`.

## Claude Desktop Note

Claude Desktop uses `.mcpb` desktop extensions — a different host surface from Claude Code plugins. If you want Epi-Logos inside the Claude Desktop app, the next step is to build a thin desktop-extension wrapper around this plugin bundle. That wrapper should stay thin and should not redefine the Epi-Logos architecture.
