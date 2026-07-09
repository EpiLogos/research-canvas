import { useMemo } from "react";
import { walkSequenceGraph } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { WorkspaceFilePickerButton } from "../canvas/WorkspaceFilePickerButton";

const DOT_PRESETS = ["#4a4aff","#9b59b6","#27ae60","#e67e22","#e74c3c","#1abc9c","#f39c12","#888888"];
const BG_PRESETS  = ["#0e0e22","#140a0a","#0a140a","#14100a","#0a0a14","#111111"];
const TXT_PRESETS = ["#c0c0e0","#ffffff","#e74c3c","#f39c12","#7c6fff","#888888"];

function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function ColourRow({
  label,
  presets,
  current,
  onChange,
}: {
  label: string;
  presets: string[];
  current?: string;
  onChange: (colour: string) => void;
}) {
  const effectiveCurrent = current ?? presets[0];
  return (
    <div className="inspector-field">
      <label className="inspector-label">{label}</label>
      <div className="colour-row">
        {presets.map((c) => (
          <button
            key={c}
            className="colour-swatch"
            data-active={effectiveCurrent === c ? "true" : "false"}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <input
          type="color"
          className="colour-custom-input"
          value={effectiveCurrent}
          onChange={(e) => onChange(e.target.value)}
          title="Custom colour"
        />
      </div>
    </div>
  );
}

export function InspectorTab() {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;

  const sequenceGraph = useMemo(
    () => walkSequenceGraph(workspace.nodes, workspace.edges),
    [workspace.nodes, workspace.edges]
  );

  const nodeInSequence = node ? sequenceGraph.nodeSet.has(node.id) : false;

  if (!node) {
    return (
      <div className="inspector-empty">
        <p>Select a node to inspect it</p>
      </div>
    );
  }

  return (
    <div className="inspector-tab">
      <div className="inspector-field">
        <label className="inspector-label">Title</label>
        <div className="inspector-value">{node.title}</div>
      </div>
      <div className="inspector-field">
        <label className="inspector-label">Type</label>
        <div className="inspector-value inspector-value--type">{node.type}</div>
      </div>
      <div className="inspector-section-title">Appearance</div>
      <ColourRow
        label="Dot colour"
        presets={DOT_PRESETS}
        current={node.dotColour}
        onChange={(c) => workspace.updateNodeStyle(node.id, { dotColour: c })}
      />
      <ColourRow
        label="Background"
        presets={BG_PRESETS}
        current={node.bgColour}
        onChange={(c) => workspace.updateNodeStyle(node.id, { bgColour: c })}
      />
      <ColourRow
        label="Text colour"
        presets={TXT_PRESETS}
        current={node.textColour}
        onChange={(c) => workspace.updateNodeStyle(node.id, { textColour: c })}
      />
      <div className="inspector-field">
        <label className="inspector-label">Thumbnail</label>
        <WorkspaceFilePickerButton
          buttonClassName="inspector-value inspector-value--btn"
          buttonLabel={node.thumbnail ? node.thumbnail.split("/").pop() ?? "Set image…" : "Set image…"}
          entries={workspace.entries}
          filter={(entry) => entry.kind === "image"}
          onSelect={(entry) => {
            void workspace.setNodeThumbnailFromAbsolutePath(node.id, entry.absolutePath);
          }}
        />
      </div>
      {node.type === "note" && (
        <div className="inspector-field">
          <label className="inspector-label" htmlFor="inspector-note-tags">Tags</label>
          <input
            id="inspector-note-tags"
            className="inspector-value inspector-value--input"
            type="text"
            value={node.tags.join(", ")}
            onChange={(event) => workspace.updateNodeTags(node.id, parseTagInput(event.target.value))}
          />
        </div>
      )}
      {nodeInSequence && (
        <>
          <div className="inspector-section-title">Sequence</div>
          <div className="inspector-field">
            <label className="inspector-label">Caption</label>
            <input
              className="inspector-value inspector-value--input"
              type="text"
              value={node.sequenceCaption ?? ""}
              placeholder={node.summary || "No caption"}
              onChange={(e) =>
                workspace.store.getState().updateNodeSequenceCaption(node.id, e.target.value || null)
              }
            />
          </div>
          <div className="inspector-field">
            <label className="inspector-label">Viewport</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="inspector-value inspector-value--btn"
                onClick={() => workspace.store.getState().setNodeSequenceViewport(node.id, workspace.captureViewport())}
              >
                Capture current
              </button>
              {node.sequenceViewport && (
                <button
                  className="inspector-value inspector-value--btn"
                  onClick={() => workspace.store.getState().setNodeSequenceViewport(node.id, null)}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
