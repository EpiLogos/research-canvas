import type {
  StoryNodeOption,
  StorySceneInput,
  StoryTransition,
} from "@research-canvas/domain";
import { useEffect, useState, type FormEvent, type JSX } from "react";

export interface SceneEditorProps {
  nodeOptions: StoryNodeOption[];
  initial?: StorySceneInput | null;
  submitLabel?: string;
  onSubmit: (input: StorySceneInput) => Promise<void> | void;
  onCancel?: () => void;
}

const EMPTY: StorySceneInput = {
  title: "",
  nodeIds: [],
  mediaAssetIds: [],
  narrationText: "",
  transition: "fade",
  durationMs: 4000,
};

export function SceneEditor({
  nodeOptions,
  initial = null,
  submitLabel = "Add scene",
  onSubmit,
  onCancel,
}: SceneEditorProps): JSX.Element {
  const [value, setValue] = useState<StorySceneInput>(initial ?? EMPTY);
  const [mediaText, setMediaText] = useState((initial?.mediaAssetIds ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = initial ?? EMPTY;
    setValue(next);
    setMediaText(next.mediaAssetIds.join(", "));
  }, [initial]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.title.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...value,
        mediaAssetIds: mediaText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      if (!initial) {
        setValue(EMPTY);
        setMediaText("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="story-composer__editor" data-testid="story-scene-editor" onSubmit={submit}>
      <label>
        Scene title
        <input
          data-testid="story-scene-title"
          value={value.title}
          onChange={(event) => setValue((current) => ({ ...current, title: event.target.value }))}
          required
        />
      </label>

      <fieldset data-testid="story-scene-node-select">
        <legend>Constellation nodes</legend>
        <div className="story-composer__node-options">
          {nodeOptions.map((node) => {
            const selected = value.nodeIds.includes(node.graphNodeId);
            return (
              <label key={node.graphNodeId}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => setValue((current) => ({
                    ...current,
                    nodeIds: selected
                      ? current.nodeIds.filter((id) => id !== node.graphNodeId)
                      : [...current.nodeIds, node.graphNodeId],
                  }))}
                />
                {node.title} · {node.entityType}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label data-testid="story-media-drop-zone">
        Media assets
        <span>Project-relative paths or imported assets, comma separated.</span>
        <input
          data-testid="story-scene-media"
          value={mediaText}
          onChange={(event) => setMediaText(event.target.value)}
          placeholder="assets/image.jpg, audio/voice.mp3"
        />
      </label>

      <label>
        Narration
        <textarea
          data-testid="story-scene-narration"
          value={value.narrationText}
          onChange={(event) => setValue((current) => ({ ...current, narrationText: event.target.value }))}
        />
      </label>

      <div className="story-composer__editor-row">
        <label>
          Transition
          <select
            data-testid="story-scene-transition"
            value={value.transition}
            onChange={(event) => setValue((current) => ({
              ...current,
              transition: event.target.value as StoryTransition,
            }))}
          >
            <option value="cut">Cut</option>
            <option value="fade">Fade</option>
            <option value="dissolve">Dissolve</option>
          </select>
        </label>
        <label>
          Duration (ms)
          <input
            data-testid="story-scene-duration"
            type="number"
            min={250}
            step={250}
            value={value.durationMs}
            onChange={(event) => setValue((current) => ({
              ...current,
              durationMs: Number(event.target.value),
            }))}
          />
        </label>
      </div>

      <div className="story-composer__editor-actions">
        <button type="submit" data-testid="story-scene-save" disabled={saving || !value.title.trim()}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}
