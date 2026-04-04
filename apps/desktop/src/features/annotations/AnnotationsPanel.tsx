import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

const STROKE_COLOURS = ["#f97316", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#ffffff"];

interface AnnotationsPanelProps {
  drawingMode: boolean;
  onToggleDrawing: () => void;
  strokeColour: string;
  onSetStrokeColour: (colour: string) => void;
}

export function AnnotationsPanel({
  drawingMode,
  onToggleDrawing,
  strokeColour,
  onSetStrokeColour,
}: AnnotationsPanelProps) {
  const workspace = useCanvasWorkspace();
  const annotations = workspace.annotations;

  const handleDelete = (id: string) => {
    const state = workspace.annotationStore.getState();
    const next = state.annotations.filter((a) => a.id !== id);
    state.hydrate(next);
  };

  return (
    <div className="annotations-panel">
      <div className="annotations-panel__tools">
        <div className="annotations-panel__section-title">Drawing</div>
        <button
          className="annotations-panel__draw-btn"
          data-active={drawingMode ? "true" : "false"}
          onClick={onToggleDrawing}
        >
          {drawingMode ? "Stop drawing" : "Start drawing"}
        </button>
        <div className="annotations-panel__colours">
          {STROKE_COLOURS.map((c) => (
            <button
              key={c}
              className="colour-swatch"
              data-active={strokeColour === c ? "true" : "false"}
              style={{ background: c }}
              onClick={() => onSetStrokeColour(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="annotations-panel__list">
        <div className="annotations-panel__section-title">
          Annotations ({annotations.length})
        </div>
        {annotations.length === 0 && (
          <div className="lo-empty">No annotations yet. Use the draw tool to create strokes.</div>
        )}
        {annotations.map((ann) => (
          <div key={ann.id} className="annotations-panel__item">
            <span className="annotations-panel__item-type">{ann.annotationType}</span>
            <span className="annotations-panel__item-points">{ann.points.length} pts</span>
            <button
              className="annotations-panel__item-delete"
              onClick={() => handleDelete(ann.id)}
              title="Delete"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
