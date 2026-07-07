import { useCallback, useEffect, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import type { SavedSequence } from "@research-canvas/desktop-api";
import type { CanvasNode, CanvasEdge } from "@research-canvas/schema";

interface SequencesManagerProps {
  onClose: () => void;
  onPlaySequence: () => void;
}

export function SequencesManager({ onClose, onPlaySequence }: SequencesManagerProps) {
  const workspace = useCanvasWorkspace();
  const [sequences, setSequences] = useState<SavedSequence[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = sequences.find((s) => s.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!workspace.databasePath || !workspace.canvasId) return;
    try {
      const list = await workspace.listSavedSequences({
        databasePath: workspace.databasePath,
        projectId: workspace.activeProject?.id ?? "",
        canvasId: workspace.canvasId,
      });
      setSequences(list);
    } catch { /* ignore */ }
  }, [workspace]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!workspace.databasePath || !workspace.activeProject) return;
    try {
      const seq = await workspace.createSavedSequence({
        databasePath: workspace.databasePath,
        projectId: workspace.activeProject.id,
        canvasId: workspace.canvasId,
        name: `Sequence ${sequences.length + 1}`,
      });
      setSequences((prev) => [...prev, seq]);
      setSelectedId(seq.id);
    } catch { /* ignore */ }
  }, [workspace, sequences.length]);

  const handleUpdate = useCallback(async (updates: Partial<Pick<SavedSequence, "name" | "rootNodeId" | "edgeIds">>) => {
    if (!workspace.databasePath || !selected) return;
    try {
      const updated = await workspace.updateSavedSequence({
        databasePath: workspace.databasePath,
        id: selected.id,
        name: updates.name ?? selected.name,
        rootNodeId: updates.rootNodeId !== undefined ? updates.rootNodeId : selected.rootNodeId,
        edgeIds: updates.edgeIds ?? selected.edgeIds,
      });
      setSequences((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch { /* ignore */ }
  }, [workspace, selected]);

  const handleDelete = useCallback(async () => {
    if (!workspace.databasePath || !selected) return;
    try {
      await workspace.deleteSavedSequence({ databasePath: workspace.databasePath, id: selected.id });
      setSequences((prev) => prev.filter((s) => s.id !== selected.id));
      setSelectedId(null);
    } catch { /* ignore */ }
  }, [workspace, selected]);

  const handlePlay = useCallback(() => {
    if (!selected) return;
    // Activate this sequence's edges on the canvas store
    const state = workspace.store.getState();
    for (const edge of state.edges) {
      const shouldBeSequencing = selected.edgeIds.includes(edge.id);
      if (edge.sequencing !== shouldBeSequencing) {
        workspace.store.getState().toggleEdgeSequencing(edge.id);
      }
    }
    onClose();
    onPlaySequence();
  }, [selected, workspace, onClose, onPlaySequence]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="sequences-overlay__backdrop"
      data-testid="sequences-overlay-backdrop"
      onClick={onClose}
    >
      <div
        className="sequences-overlay__card"
        data-testid="sequences-overlay-card"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="sm-sidebar">
          <div className="sm-sidebar__header">
            <h2>Sequences</h2>
            <button className="sm-sidebar__add" onClick={() => { void handleCreate(); }}>+ New</button>
          </div>
          <div className="sm-sidebar__list">
            {sequences.map((seq) => (
              <button
                key={seq.id}
                className="sm-sidebar__item"
                data-active={seq.id === selectedId ? "true" : "false"}
                onClick={() => setSelectedId(seq.id)}
              >
                <span className="sm-sidebar__item-name">{seq.name}</span>
                <span className="sm-sidebar__item-count">{seq.edgeIds.length} edges</span>
              </button>
            ))}
            {sequences.length === 0 && (
              <div className="sm-sidebar__empty">No sequences saved. Create one to define a guided path.</div>
            )}
          </div>
        </aside>

        <main className="sm-main">
          {selected ? (
            <SequenceEditor
              sequence={selected}
              nodes={workspace.nodes}
              edges={workspace.edges}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onPlay={handlePlay}
            />
          ) : (
            <div className="sm-main__empty">Select a sequence or create a new one</div>
          )}
        </main>

        <button className="sm-close" onClick={onClose} title="Close (Esc)">&times;</button>
      </div>
    </div>
  );
}

function SequenceEditor({
  sequence,
  nodes,
  edges,
  onUpdate,
  onDelete,
  onPlay,
}: {
  sequence: SavedSequence;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onUpdate: (updates: Partial<Pick<SavedSequence, "name" | "rootNodeId" | "edgeIds">>) => Promise<void>;
  onDelete: () => Promise<void>;
  onPlay: () => void;
}) {
  const edgeSet = new Set(sequence.edgeIds);

  const toggleEdge = (edgeId: string) => {
    const next = edgeSet.has(edgeId)
      ? sequence.edgeIds.filter((id) => id !== edgeId)
      : [...sequence.edgeIds, edgeId];
    void onUpdate({ edgeIds: next });
  };

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.title ?? id.slice(0, 8);

  return (
    <div className="sm-editor">
      <div className="sm-editor__header">
        <input
          className="sm-editor__name"
          value={sequence.name}
          onChange={(e) => { void onUpdate({ name: e.target.value }); }}
        />
        <div className="sm-editor__actions">
          <button className="sm-editor__play" onClick={onPlay} disabled={sequence.edgeIds.length === 0}>
            Play
          </button>
          <button className="sm-editor__delete" onClick={() => { void onDelete(); }}>Delete</button>
        </div>
      </div>

      <div className="sm-editor__section">
        <label className="sm-editor__label">Root node</label>
        <select
          className="sm-editor__select"
          value={sequence.rootNodeId ?? ""}
          onChange={(e) => { void onUpdate({ rootNodeId: e.target.value || null }); }}
        >
          <option value="">Auto-detect</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>{node.title}</option>
          ))}
        </select>
      </div>

      <div className="sm-editor__section">
        <label className="sm-editor__label">Edges ({sequence.edgeIds.length} of {edges.length})</label>
        <div className="sm-editor__edge-list">
          {edges.map((edge) => (
            <label key={edge.id} className="sm-editor__edge-row">
              <input
                type="checkbox"
                checked={edgeSet.has(edge.id)}
                onChange={() => toggleEdge(edge.id)}
              />
              <span>{nodeName(edge.sourceNodeId)} → {nodeName(edge.targetNodeId)}</span>
              <span className="sm-editor__edge-label">{edge.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
