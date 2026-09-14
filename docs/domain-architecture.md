# Domain architecture (#2)

The Research Canvas domain layer lives in `packages/domain`. It defines repository
**ports** for every aggregate in the two-lens model, plus a small fake adapter
used by surface tests. Concrete desktop implementations are in
`packages/desktop-api/src/repositories.ts` and wrap the `WorkspaceTransport`
contract.

## Aggregate ports

| Port | Aggregate | Key methods |
|---|---|---|
| `ProjectRepository` | Project (a top-level constellation) | `listProjects`, `createProject`, `setActiveProject` |
| `ConstellationRepository` | Constellation tree | `listConstellations`, `createConstellation`, `getConstellationTree` |
| `NodeRepository` | Graph node substance | `listNodes`, `getNode`, `createNode`, `updateNode`, `deleteNode` |
| `EdgeRepository` | Graph relationship | `listEdges`, `createEdge`, `updateEdge`, `deleteEdge` |
| `CanvasRepository` | Canvas + layout join | `listCanvases`, `getCanvasView`, `persistCanvasView` |
| `SequenceRepository` | Saved sequence | `listSequences`, `getSequence`, `persistSequence` |
| `SceneRepository` | Profile scene | `listScenes`, `getScene` |

## Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Surfaces (desktop features / public-viewer / tests)        │
├─────────────────────────────────────────────────────────────┤
│  Domain ports  ──►  FakeDomainAdapter  (unit tests)         │
│       │                                              │       │
│       └───────────────►  desktop-api repositories  ──┘     │
│                                │                             │
├────────────────────────────────┼─────────────────────────────┤
│  WorkspaceTransport  ◄─────────┘                            │
├─────────────────────────────────────────────────────────────┤
│  Rust commands  →  SQLite (layout)  +  Neo4j/Graphiti (sub.)  │
└─────────────────────────────────────────────────────────────┘
```

## Design choices

- **Domain owns the repository contract, not the data store.** Ports are
  intentionally free of persistence details; `graphNodeId` is the only join key
  that crosses the SQLite / graph-substance boundary.
- **Schema types are reused.** `Project`, `Canvas`, `CanvasNode`, `CanvasEdge`,
  `GraphNodeContract` and `Scene` come from `@research-canvas/schema`. Domain
  only introduces aggregates that the schema does not yet model (sequence) or
  that benefit from a simplified contract (constellation tree node, domain edge).
- **Desktop implementations are thin.** `DesktopProjectRepository`,
  `DesktopSequenceRepository` and `DesktopSceneRepository` delegate to existing
  transport commands. Remaining repositories currently throw
  `Not yet implemented` because the underlying Rust commands are added by later
  tickets in the redemption map; the TypeScript contracts and fake adapter
  unblock surface work immediately.
- **Fake adapter is the canonical unit-test harness.** `FakeDomainAdapter`
  implements every port in memory so surfaces can exercise repository behavior
  without a Tauri back-end or database.

## Migration rule

When a new persistence command lands in `WorkspaceTransport`, the matching
`Desktop*Repository` implementation must be updated before the ticket is closed.
Stubs are allowed only as explicit placeholders tracked by an open blocker.
