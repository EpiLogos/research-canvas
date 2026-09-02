from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old in text:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f"{path}: expected one target, found {count}")
        target.write_text(text.replace(old, new))
        return
    if new in text:
        return
    raise SystemExit(f"{path}: asserted pre/post forms not found")


map_path = "packages/canvas/src/psychogeographic/PsychogeographicMap.tsx"
replace_once(
    map_path,
    '  renderer?: MapSurfaceRenderer;\n  onOpenCanvasNode?: (graphNodeId: string) => void | Promise<void>;\n}',
    '  renderer?: MapSurfaceRenderer;\n  initialViewState?: MapViewState;\n  initialSelectedGraphNodeId?: string | null;\n  onViewStateChange?: (viewState: MapViewState) => void;\n  onSelectedGraphNodeIdChange?: (graphNodeId: string | null) => void;\n  onOpenCanvasNode?: (graphNodeId: string) => void | Promise<void>;\n}',
)
replace_once(
    map_path,
    '  renderer: rendererProp,\n  onOpenCanvasNode,\n}: PsychogeographicMapProps): JSX.Element {',
    '  renderer: rendererProp,\n  initialViewState,\n  initialSelectedGraphNodeId = null,\n  onViewStateChange,\n  onSelectedGraphNodeIdChange,\n  onOpenCanvasNode,\n}: PsychogeographicMapProps): JSX.Element {',
)
replace_once(
    map_path,
    '  const laneClickRef = useRef<(laneId: string) => void>(() => {});\n\n  const [renderer, setRenderer]',
    '  const laneClickRef = useRef<(laneId: string) => void>(() => {});\n  const initialViewStateRef = useRef<MapViewState | undefined>(initialViewState);\n  const onViewStateChangeRef = useRef(onViewStateChange);\n  const onSelectedGraphNodeIdChangeRef = useRef(onSelectedGraphNodeIdChange);\n  onViewStateChangeRef.current = onViewStateChange;\n  onSelectedGraphNodeIdChangeRef.current = onSelectedGraphNodeIdChange;\n\n  const [renderer, setRenderer]',
)
replace_once(
    map_path,
    '  const [viewState, setViewState] = useState<MapViewState>({ latitude: 20, longitude: 0, zoom: 1 });',
    '  const [viewState, setViewState] = useState<MapViewState>(() =>\n    initialViewState ?? { latitude: 20, longitude: 0, zoom: 1 },\n  );',
)
replace_once(
    map_path,
    '  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);',
    '  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialSelectedGraphNodeId);',
)
replace_once(
    map_path,
    '  const selectedExpressions = selectedNode\n    ? expressionsByPlace.get(selectedNode.graphNodeId) ?? []\n    : [];\n\n  const laneYearRange',
    '  const selectedExpressions = selectedNode\n    ? expressionsByPlace.get(selectedNode.graphNodeId) ?? []\n    : [];\n\n  useEffect(() => {\n    if (!selectedNodeId || !nodes.some((node) => node.graphNodeId === selectedNodeId)) {\n      setRelatedNodes([]);\n      setContextLoading(false);\n      return;\n    }\n    let cancelled = false;\n    setRelatedNodes([]);\n    setContextLoading(true);\n    void repository.getRelatedNodesForPlace(projectId, selectedNodeId)\n      .then((related) => {\n        if (!cancelled) setRelatedNodes(related);\n      })\n      .catch(() => {\n        if (!cancelled) setRelatedNodes([]);\n      })\n      .finally(() => {\n        if (!cancelled) setContextLoading(false);\n      });\n    return () => {\n      cancelled = true;\n    };\n  }, [nodes, projectId, repository, selectedNodeId]);\n\n  const laneYearRange',
)
replace_once(
    map_path,
    '  const selectPlace = useCallback((graphNodeId: string) => {\n    const node = nodes.find((candidate) => candidate.graphNodeId === graphNodeId);\n    if (!node) return;\n    setSelectedNodeId(graphNodeId);\n    setRelatedNodes([]);\n    setContextLoading(true);\n    const point = pointForPlace(node);\n    if (point) void mountedRenderer.current?.flyTo?.(point.latitude, point.longitude, Math.max(3, viewState.zoom));\n    void repository.getRelatedNodesForPlace(projectId, graphNodeId)\n      .then(setRelatedNodes)\n      .catch(() => setRelatedNodes([]))\n      .finally(() => setContextLoading(false));\n  }, [nodes, projectId, repository, viewState.zoom]);',
    '  const selectPlace = useCallback((graphNodeId: string) => {\n    const node = nodes.find((candidate) => candidate.graphNodeId === graphNodeId);\n    if (!node) return;\n    setSelectedNodeId(graphNodeId);\n    onSelectedGraphNodeIdChangeRef.current?.(graphNodeId);\n    const point = pointForPlace(node);\n    if (point) void mountedRenderer.current?.flyTo?.(point.latitude, point.longitude, Math.max(3, viewState.zoom));\n  }, [nodes, viewState.zoom]);',
)
replace_once(
    map_path,
    '        renderer.setLaneClickHandler?.((laneId) => laneClickRef.current(laneId));\n        renderer.onViewChange?.(setViewState);\n        return Promise.all([',
    '        renderer.setLaneClickHandler?.((laneId) => laneClickRef.current(laneId));\n        renderer.onViewChange?.((nextViewState) => {\n          setViewState(nextViewState);\n          onViewStateChangeRef.current?.(nextViewState);\n        });\n        const restoredViewState = initialViewStateRef.current;\n        if (restoredViewState) {\n          void renderer.flyTo?.(\n            restoredViewState.latitude,\n            restoredViewState.longitude,\n            restoredViewState.zoom,\n          );\n        }\n        return Promise.all([',
)

lens_path = "apps/desktop/src/features/psychogeographic/PsychogeographicLens.tsx"
replace_once(
    lens_path,
    '  renderer?: MapSurfaceRenderer;\n  resolveAsset?: (artifactPath: string) => string;',
    '  renderer?: MapSurfaceRenderer;\n  initialViewState?: { latitude: number; longitude: number; zoom: number };\n  initialSelectedGraphNodeId?: string | null;\n  onViewStateChange?: (viewState: { latitude: number; longitude: number; zoom: number }) => void;\n  onSelectedGraphNodeIdChange?: (graphNodeId: string | null) => void;\n  resolveAsset?: (artifactPath: string) => string;',
)
replace_once(
    lens_path,
    '  renderer,\n  resolveAsset,\n  onOpenCanvasNode,',
    '  renderer,\n  initialViewState,\n  initialSelectedGraphNodeId,\n  onViewStateChange,\n  onSelectedGraphNodeIdChange,\n  resolveAsset,\n  onOpenCanvasNode,',
)
replace_once(
    lens_path,
    '        renderer={renderer}\n        onOpenCanvasNode={onOpenCanvasNode}\n      />',
    '        renderer={renderer}\n        initialViewState={initialViewState}\n        initialSelectedGraphNodeId={initialSelectedGraphNodeId}\n        onViewStateChange={onViewStateChange}\n        onSelectedGraphNodeIdChange={onSelectedGraphNodeIdChange}\n        onOpenCanvasNode={onOpenCanvasNode}\n      />',
)

stage_path = "apps/desktop/src/layout/Stage.tsx"
replace_once(
    stage_path,
    '  const commonStageSurfaceStyle: React.CSSProperties = { position: "absolute", inset: 0 };\n\n  const openPlaceOnCanvas',
    '  const commonStageSurfaceStyle: React.CSSProperties = { position: "absolute", inset: 0 };\n  const placesTabState = workspace.activeTab?.state.surfaceId === "places"\n    ? workspace.activeTab.state\n    : null;\n\n  const openPlaceOnCanvas',
)
replace_once(
    stage_path,
    '            onOpenCanvasNode={openPlaceOnCanvas}\n          />',
    '            initialViewState={placesTabState ? {\n              longitude: placesTabState.viewport.x,\n              latitude: placesTabState.viewport.y,\n              zoom: placesTabState.viewport.zoom,\n            } : undefined}\n            initialSelectedGraphNodeId={placesTabState?.selectedGraphNodeId ?? null}\n            onViewStateChange={(nextViewState) => {\n              if (!placesTabState) return;\n              workspace.updateTabState({\n                ...placesTabState,\n                viewport: {\n                  x: nextViewState.longitude,\n                  y: nextViewState.latitude,\n                  zoom: nextViewState.zoom,\n                },\n              });\n            }}\n            onSelectedGraphNodeIdChange={(graphNodeId) => {\n              if (!placesTabState) return;\n              workspace.updateTabState({\n                ...placesTabState,\n                selectedGraphNodeId: graphNodeId,\n              });\n            }}\n            onOpenCanvasNode={openPlaceOnCanvas}\n          />',
)
