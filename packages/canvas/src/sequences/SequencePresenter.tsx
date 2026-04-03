import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";
import { walkSequenceGraph } from "./walkSequenceGraph";
import { initialPlaybackState, playbackReducer } from "./playbackReducer";

interface SequencePresenterProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onClose: () => void;
  renderNodeContent: (node: CanvasNode) => React.ReactNode;
  onNavigateToNode?: (nodeId: string, viewport?: { x: number; y: number; zoom: number } | null) => void;
  projectName?: string;
}

export function SequencePresenter({
  nodes,
  edges,
  onClose,
  renderNodeContent,
  onNavigateToNode,
}: SequencePresenterProps) {
  const graph = useMemo(() => walkSequenceGraph(nodes, edges), [nodes, edges]);
  const [playback, dispatch] = useReducer(playbackReducer, initialPlaybackState);

  useEffect(() => {
    if (!playback.active && playback.path.length === 0 && graph.roots.length === 1) {
      dispatch({ type: "enter", rootNodeId: graph.roots[0] });
    }
  }, [graph.roots, playback.active, playback.path.length]);

  const currentNode = useMemo(
    () => (playback.currentNodeId ? nodes.find((n) => n.id === playback.currentNodeId) ?? null : null),
    [nodes, playback.currentNodeId]
  );

  const currentExits = useMemo(
    () => (playback.currentNodeId ? graph.adjacency.get(playback.currentNodeId) ?? [] : []),
    [graph.adjacency, playback.currentNodeId]
  );

  const arrivalEdge = useMemo(() => {
    if (playback.path.length < 2) return null;
    const prevNodeId = playback.path[playback.path.length - 2];
    return edges.find(
      (e) => e.sequencing && e.sourceNodeId === prevNodeId && e.targetNodeId === playback.currentNodeId
    ) ?? null;
  }, [edges, playback.path, playback.currentNodeId]);

  const handleAdvance = useCallback(
    (exitIndex: number) => {
      const exit = currentExits[exitIndex];
      if (!exit) return;
      dispatch({ type: "advance", targetNodeId: exit.targetNodeId });
    },
    [currentExits]
  );

  useEffect(() => {
    if (playback.currentNodeId) {
      const node = nodes.find((n) => n.id === playback.currentNodeId);
      onNavigateToNode?.(playback.currentNodeId, node?.sequenceViewport);
    }
  }, [playback.currentNodeId, nodes, onNavigateToNode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Backspace") { e.preventDefault(); dispatch({ type: "back" }); return; }
      if (e.key === "Home") { e.preventDefault(); dispatch({ type: "home" }); return; }
      if (e.key === " " && currentExits.length === 1) { e.preventDefault(); handleAdvance(0); return; }
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9 && digit <= currentExits.length) { e.preventDefault(); handleAdvance(digit - 1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, currentExits, handleAdvance]);

  // Root picker
  if (playback.path.length === 0) {
    if (graph.roots.length === 0) {
      return (
        <div className="sequence-presenter">
          <div className="sp-empty">
            <p>No sequence roots found. Mark edges as sequence arrows to create a path.</p>
            <button className="sp-close-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      );
    }

    return (
      <div className="sequence-presenter">
        <div className="sp-root-picker">
          <h2>Choose a starting point</h2>
          <div className="sp-root-list">
            {graph.roots.map((rootId, i) => {
              const rootNode = nodes.find((n) => n.id === rootId);
              return (
                <button key={rootId} className="sp-root-option" onClick={() => dispatch({ type: "enter", rootNodeId: rootId })}>
                  <span className="sp-root-key">{i + 1}</span>
                  <span className="sp-root-title">{rootNode?.title ?? rootId}</span>
                </button>
              );
            })}
          </div>
          <button className="sp-close-btn" onClick={onClose}>Cancel (Esc)</button>
        </div>
      </div>
    );
  }

  if (!currentNode) return null;

  const caption = currentNode.sequenceCaption ?? currentNode.summary ?? "";

  return (
    <div className="sequence-presenter">
      <header className="sp-breadcrumb">
        <nav>
          {playback.path.map((nodeId, i) => {
            const pathNode = nodes.find((n) => n.id === nodeId);
            const isCurrent = i === playback.path.length - 1;
            return (
              <span key={nodeId}>
                {i > 0 && <span className="sp-sep">&rsaquo;</span>}
                <button className="sp-crumb" data-current={isCurrent ? "true" : "false"} onClick={() => { if (!isCurrent) dispatch({ type: "jump", nodeId, pathFromRoot: playback.path.slice(0, i + 1) }); }} disabled={isCurrent}>
                  {pathNode?.title ?? nodeId}
                </button>
              </span>
            );
          })}
        </nav>
        <button className="sp-close-btn" onClick={onClose} title="Back to canvas (Esc)">&larr; Back</button>
      </header>

      <main className="sp-main">
        <div className="sp-content">
          {renderNodeContent(currentNode)}
        </div>
        <div className="sp-overlay">
          <h1 className="sp-title">{currentNode.title}</h1>
          {arrivalEdge && <div className="sp-arrival">via: {arrivalEdge.label}</div>}
          {caption && <p className="sp-caption">{caption}</p>}
        </div>
      </main>

      <footer className="sp-exits">
        {currentExits.length === 0 ? (
          <div className="sp-terminal">End of sequence &middot; <kbd>Backspace</kbd> to go back &middot; <kbd>Esc</kbd> to exit</div>
        ) : currentExits.length === 1 ? (
          <button className="sp-exit-btn" onClick={() => handleAdvance(0)}>
            <kbd>Space</kbd> {currentExits[0].label} &rarr;
          </button>
        ) : (
          currentExits.map((exit, i) => {
            const isRevisit = playback.path.includes(exit.targetNodeId);
            return (
              <button key={exit.edgeId} className="sp-exit-btn" data-revisit={isRevisit ? "true" : "false"} onClick={() => handleAdvance(i)}>
                <kbd>{i + 1}</kbd> {exit.label}
                {isRevisit && <span className="sp-revisit-badge">revisiting</span>}
              </button>
            );
          })
        )}
      </footer>
    </div>
  );
}

