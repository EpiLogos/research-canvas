import { useMemo } from "react";
import type { GraphNodePatch } from "@research-canvas/desktop-api";
import { walkSequenceGraph } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { WorkspaceFilePickerButton } from "../canvas/WorkspaceFilePickerButton";
import { attachNodeMedia } from "../viewer/nodeAttachmentActions";

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

  const canonicalTags = node.graph?.evidenceTags ?? [];
  const hasGraphRecord = Boolean(node.graphNodeId);
  const saveMetadata = (patch: GraphNodePatch) => {
    void workspace.updateNodeMetadata(node.id, patch).catch(() => {
      // The provider exposes the transport failure in the persistent workspace
      // error surface. Keeping the last confirmed graph cache avoids lying in
      // the card, inspector, or reader after a rejected write.
    });
  };

  const metadataRows = [
    ["Historicity", node.graph?.historicity],
    ["Claim", node.graph?.claimKind],
    ["Evidence", node.graph?.evidenceStatus],
    ["Temporal role", node.graph?.temporalRole],
    ["Place", node.graph?.placeCoverage],
    ["QL form", node.graph?.qlForm],
    ["QL unit", node.graph?.qlUnitId],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  return (
    <div className="inspector-tab">
      <div className="inspector-field">
        <label className="inspector-label">Title</label>
        <input
          key={`${node.id}:${node.title}`}
          aria-label="Canonical title"
          className="inspector-value inspector-value--input"
          type="text"
          defaultValue={node.title}
          disabled={!hasGraphRecord}
          onBlur={(event) => {
            const title = event.currentTarget.value.trim();
            if (title && title !== node.title) saveMetadata({ title });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
      <div className="inspector-field">
        <label className="inspector-label">Type</label>
        <div className="inspector-value inspector-value--type">{node.type}</div>
      </div>
      <div className="inspector-field">
        <label className="inspector-label" htmlFor="inspector-semantic-tags">Knowledge tags</label>
        <input
          key={`${node.id}:${canonicalTags.join("|")}`}
          id="inspector-semantic-tags"
          className="inspector-value inspector-value--input"
          type="text"
          defaultValue={canonicalTags.join(", ")}
          disabled={!hasGraphRecord}
          placeholder="documented, archive, institution"
          onBlur={(event) => {
            const tags = parseTagInput(event.currentTarget.value);
            if (tags.join("|") !== canonicalTags.join("|")) saveMetadata({ evidenceTags: tags });
          }}
        />
      </div>
      {node.graph?.summary && (
        <div className="inspector-field">
          <label className="inspector-label">Card pith</label>
          <div className="inspector-value">{node.graph.summary}</div>
        </div>
      )}
      {metadataRows.length > 0 && (
        <>
          <div className="inspector-section-title">Knowledge record</div>
          <dl className="inspector-metadata-list">
            {metadataRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value.replaceAll("_", " ")}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
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
            if (!node.graphNodeId) {
              return;
            }
            void attachNodeMedia({
              transport: workspace.transport,
              databasePath: workspace.databasePath,
              workspaceRoot: workspace.workingRoot,
              graphNodeId: node.graphNodeId,
              sourceAbsolutePath: entry.absolutePath,
              kind: "image",
              role: "cover",
            })
              .then(({ attachment }) => {
                // Layout keeps only a portable reference. The card and reader
                // resolve this through the same workspace asset system as an
                // inline image, never through a stale absolute asset URL.
                workspace.updateNodeStyle(node.id, { thumbnail: attachment.managedPath });
              })
              .catch(() => {
                // The shared workspace error surface should own transport
                // failures; do not optimistically write a thumbnail URL.
              });
          }}
        />
      </div>
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
