# Research Canvas

Research Canvas is a local-first Tauri v2 workspace for building research maps, guided sequences, and static public exports.

## Getting Started

```bash
pnpm install
pnpm exec tsc -b tsconfig.json
pnpm vitest run
pnpm playwright test
```

## Workspace Layout

- `apps/desktop`: Tauri desktop app shell and frontend.
- `apps/public-viewer`: Static viewer for exported projects.
- `packages/schema`: Shared runtime-validated domain schema.
- `tests/e2e`: Browser-driven integration tests for app workflows.

