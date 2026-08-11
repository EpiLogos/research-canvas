import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

/**
 * Stub surface/tab API for T5 project system UI.
 *
 * T7 will introduce the real global tab manager. Until then, this provider
 * wires constellation/canvas selection into the existing workspace tab seams
 * (openConstellationTab, openCanvas) and no-ops for sequence/scene surfaces
 * with a documented TODO.
 */
export interface ProjectTabActions {
  /** Open the constellation's primary canvas in a tab. */
  openConstellation: (constellationId: string, surface?: "canvas" | "timeline" | "places" | "story" | "palace") => void;
  /** Open a specific canvas in a tab. */
  openCanvas: (canvasId: string) => void;
  /** Open a sequence in the appropriate surface tab (T7). */
  openSequence: (sequenceId: string) => void;
  /** Open a scene in the appropriate surface tab (T7). */
  openScene: (sceneId: string) => void;
  /** Select a graph node in the active canvas. */
  selectNode: (nodeId: string) => void;
}

const ProjectTabContext = createContext<ProjectTabActions>({
  openConstellation: () => {},
  openCanvas: () => {},
  openSequence: () => {},
  openScene: () => {},
  selectNode: () => {},
});

export function ProjectTabProvider({ children }: { children: ReactNode }) {
  const workspace = useCanvasWorkspace();

  const openConstellation = useCallback(
    (constellationId: string, _surface?: "canvas" | "timeline" | "places" | "story" | "palace") => {
      // TODO(T7): route to the real global tab API instead of workspace seam.
      workspace.openConstellationTab?.(constellationId)?.catch(() => {});
    },
    [workspace],
  );

  const openCanvas = useCallback(
    (canvasId: string) => {
      // TODO(T7): route to the real global tab API instead of workspace seam.
      workspace.openCanvas?.(canvasId)?.catch(() => {});
    },
    [workspace],
  );

  const openSequence = useCallback(
    (_sequenceId: string) => {
      // TODO(T7): open sequence in the global tab API / sequence surface.
    },
    [],
  );

  const openScene = useCallback(
    (_sceneId: string) => {
      // TODO(T7): open scene in the global tab API / scene surface.
    },
    [],
  );

  const selectNode = useCallback(
    (nodeId: string) => {
      workspace.selectNode?.(nodeId);
    },
    [workspace],
  );

  return (
    <ProjectTabContext.Provider
      value={{ openConstellation, openCanvas, openSequence, openScene, selectNode }}
    >
      {children}
    </ProjectTabContext.Provider>
  );
}

export function useProjectTabs(): ProjectTabActions {
  return useContext(ProjectTabContext);
}
