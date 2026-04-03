import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { WorkspaceFilePickerButton } from "../canvas/WorkspaceFilePickerButton";

const DOT_PRESETS = ["#4a4aff","#9b59b6","#27ae60","#e67e22","#e74c3c","#1abc9c","#f39c12","#888888"];
const BG_PRESETS  = ["#0e0e22","#140a0a","#0a140a","#14100a","#0a0a14","#111111"];
const TXT_PRESETS = ["#c0c0e0","#ffffff","#e74c3c","#f39c12","#7c6fff","#888888"];

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
    </div>
  );
}
