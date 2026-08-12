import { useCallback, useEffect, useMemo, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import type {
  ProjectTreeCanvas,
  ProjectTreeConstellation,
  ProjectTreeGraphNode,
  ProjectTreeNode,
  ProjectTreeRoot,
  ProjectTreeScene,
  ProjectTreeSequence,
} from "./types";

interface ProjectTreeSelectionState {
  selectedId: string | null;
  selectNode: (id: string) => void;
}

interface UseProjectTreeResult extends ProjectTreeSelectionState {
  tree: ProjectTreeNode | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Build the project tree from the active workspace state.
 *
 * The tree is scoped to the active project. Constellation hierarchy is taken
 * from the workspace's already-resolved constellation list. The active
 * constellation is populated with canvases, sequences, scenes, and graph nodes
 * grouped by entity type; child constellations are always shown so the library
 * structure is visible even before a constellation is opened.
 */
export function useProjectTree(): UseProjectTreeResult {
  const workspace = useCanvasWorkspace();
  const [sequences, setSequences] = useState<ProjectTreeSequence[]>([]);
  const [scenes, setScenes] = useState<ProjectTreeScene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const root: ProjectTreeRoot | null = useMemo(() => {
    if (!workspace.activeProjectId) return null;
    const project = workspace.constellations.find(
      (constellation) => constellation.id === workspace.activeProjectId,
    );
    if (!project) return null;
    return {
      id: project.id,
      displayName: project.name,
      rootPath: project.rootPath ?? "",
      rootType: project.rootType ?? "directory",
    };
  }, [workspace.activeProjectId, workspace.constellations]);

  const activeConstellationId = workspace.activeConstellationId;
  const databasePath = workspace.databasePath;
  const profileScope = workspace.activeProfileScope;
  const transport = workspace.transport;

  useEffect(() => {
    setSequences([]);
    setScenes([]);
    if (!activeConstellationId || !databasePath || !profileScope) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const [seqResult, sceneResult] = await Promise.all([
          transport?.listSavedSequences?.({
            databasePath,
            constellationId: activeConstellationId,
            canvasId: "",
          }) ?? Promise.resolve([]),
          transport?.listScenes?.({
            databasePath,
            profileScope,
          }) ?? Promise.resolve([]),
        ]);
        if (cancelled) return;
        setSequences(
          seqResult.map((s) => ({ id: s.id, name: s.name, canvasId: s.canvasId })),
        );
        setScenes(
          sceneResult.map((s) => ({ id: s.id, name: (s as { name?: string }).name ?? s.id })),
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConstellationId, databasePath, profileScope, transport]);

  const canvases: ProjectTreeCanvas[] = useMemo(() => {
    if (
      activeConstellationId !== workspace.activeConstellation?.id ||
      !workspace.activeConstellation?.primaryCanvasId
    ) {
      return [];
    }
    return [
      {
        id: workspace.activeConstellation.primaryCanvasId,
        name: "Primary canvas",
      },
    ];
  }, [activeConstellationId, workspace.activeConstellation]);

  const nodesByEntityType: Record<string, ProjectTreeGraphNode[]> = useMemo(() => {
    if (activeConstellationId !== workspace.activeConstellation?.id) return {};
    const groups: Record<string, ProjectTreeGraphNode[]> = {};
    for (const node of workspace.nodes) {
      const entityType = node.graph?.entityType ?? node.type;
      const list = groups[entityType] ?? [];
      list.push({ id: node.id, name: node.title, entityType });
      groups[entityType] = list;
    }
    return groups;
  }, [activeConstellationId, workspace.activeConstellation, workspace.nodes]);

  const decorate = useCallback(
    (source: (typeof workspace.constellations)[number]): ProjectTreeConstellation => {
      const isActive = source.id === activeConstellationId;
      const children = source.children.map((child) => decorate(child));
      return {
        id: source.id,
        name: source.name,
        children,
        canvases: isActive ? canvases : [],
        sequences: isActive ? sequences : [],
        scenes: isActive ? scenes : [],
        nodes: isActive ? nodesByEntityType : {},
      };
    },
    [activeConstellationId, canvases, nodesByEntityType, scenes, sequences],
  );

  const tree: ProjectTreeNode | null = useMemo(() => {
    if (!root) return null;
    const topLevel = workspace.constellations.filter(
      (constellation) =>
        constellation.parentId === workspace.activeProjectId ||
        (constellation.parentId === null && constellation.id === workspace.activeProjectId),
    );
    return {
      root,
      constellations: topLevel.map((constellation) => decorate(constellation)),
    };
  }, [root, workspace.activeProjectId, workspace.constellations, decorate]);

  const refresh = useCallback(async () => {
    // Re-running the effect is enough today; future versions will re-fetch the
    // repository tree directly.
    setSequences((current) => [...current]);
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return { tree, isLoading, error, selectedId, selectNode, refresh };
}
