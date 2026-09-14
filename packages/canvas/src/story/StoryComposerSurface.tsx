import type {
  StoryAuthoringScene,
  StoryJourney,
  StoryNodeOption,
  StoryRepository,
  StorySceneInput,
} from "@research-canvas/domain";
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";

import { JourneyList } from "./JourneyList";
import { PreviewPlayer } from "./PreviewPlayer";
import { SceneEditor } from "./SceneEditor";

export interface StoryComposerSurfaceProps {
  repository: StoryRepository;
  constellationId: string;
  resolveAsset: (assetId: string) => string;
  onActiveJourneyChange?: (journeyId: string | null) => void;
}

/** Surface #4 authoring shell. Durable data always flows through StoryRepository. */
export function StoryComposerSurface({
  repository,
  constellationId,
  resolveAsset,
  onActiveJourneyChange,
}: StoryComposerSurfaceProps): JSX.Element {
  const [journeys, setJourneys] = useState<StoryJourney[]>([]);
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<StoryAuthoringScene[]>([]);
  const [nodeOptions, setNodeOptions] = useState<StoryNodeOption[]>([]);
  const [newJourneyTitle, setNewJourneyTitle] = useState("");
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [addingScene, setAddingScene] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJourneys = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [nextJourneys, nextNodeOptions] = await Promise.all([
        repository.listJourneys(constellationId),
        repository.listNodeOptions(constellationId),
      ]);
      setJourneys(nextJourneys);
      setNodeOptions(nextNodeOptions);
      const nextActive = preferredId && nextJourneys.some((item) => item.id === preferredId)
        ? preferredId
        : activeJourneyId && nextJourneys.some((item) => item.id === activeJourneyId)
          ? activeJourneyId
          : nextJourneys[0]?.id ?? null;
      setActiveJourneyId(nextActive);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [activeJourneyId, constellationId, repository]);

  const loadScenes = useCallback(async (journeyId: string | null) => {
    if (!journeyId) {
      setScenes([]);
      return;
    }
    try {
      setScenes(await repository.getJourneyScenes(journeyId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [repository]);

  useEffect(() => {
    void loadJourneys();
  }, [constellationId, repository]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadScenes(activeJourneyId);
    setAddingScene(false);
    setEditingSceneId(null);
    setPreviewing(false);
    onActiveJourneyChange?.(activeJourneyId);
  }, [activeJourneyId, loadScenes, onActiveJourneyChange]);

  const createJourney = async (event: FormEvent) => {
    event.preventDefault();
    const title = newJourneyTitle.trim();
    if (!title) return;
    try {
      const created = await repository.createJourney(constellationId, title);
      setNewJourneyTitle("");
      await loadJourneys(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const addScene = async (input: StorySceneInput) => {
    if (!activeJourneyId) return;
    try {
      await repository.addScene(activeJourneyId, input);
      await Promise.all([loadScenes(activeJourneyId), loadJourneys(activeJourneyId)]);
      setAddingScene(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const updateScene = async (sceneId: string, input: StorySceneInput) => {
    try {
      await repository.updateScene(sceneId, input);
      await loadScenes(activeJourneyId);
      setEditingSceneId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const moveScene = async (sceneId: string, direction: -1 | 1) => {
    if (!activeJourneyId) return;
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scenes.length) return;
    const currentScene = scenes[index];
    const targetScene = scenes[target];
    if (!currentScene || !targetScene) return;
    const next = [...scenes];
    next[index] = targetScene;
    next[target] = currentScene;
    try {
      await repository.reorderScenes(activeJourneyId, next.map((scene) => scene.id));
      setScenes(next);
      await loadJourneys(activeJourneyId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const editingScene = scenes.find((scene) => scene.id === editingSceneId) ?? null;

  return (
    <section className="story-composer" data-testid="story-surface">
      <header className="story-composer__header">
        <div>
          <p>Surface #4 · Story</p>
          <h2>Scene journeys</h2>
          <span>Compose media-rich journeys from this constellation. Scenes persist locally in the canonical scene store.</span>
        </div>
        <form className="story-composer__new-journey" onSubmit={createJourney}>
          <input
            aria-label="Journey title"
            data-testid="story-new-journey-title"
            value={newJourneyTitle}
            onChange={(event) => setNewJourneyTitle(event.target.value)}
            placeholder="New journey title"
          />
          <button type="submit" data-testid="story-create-journey" disabled={!newJourneyTitle.trim()}>
            Create journey
          </button>
        </form>
      </header>

      {error && <p className="story-composer__error" data-testid="story-error">{error}</p>}
      {loading ? (
        <p data-testid="story-loading">Loading Story…</p>
      ) : (
        <div className="story-composer__layout">
          <JourneyList
            journeys={journeys}
            activeJourneyId={activeJourneyId}
            onSelect={setActiveJourneyId}
          />

          <main className="story-composer__main">
            {!activeJourneyId ? (
              <p data-testid="story-empty">Create a journey to begin composing scenes.</p>
            ) : (
              <>
                <div className="story-composer__toolbar">
                  <button
                    type="button"
                    data-testid="story-add-scene"
                    onClick={() => {
                      setEditingSceneId(null);
                      setAddingScene((value) => !value);
                    }}
                  >
                    Add scene
                  </button>
                  <button
                    type="button"
                    data-testid="story-preview"
                    disabled={scenes.length === 0}
                    onClick={() => setPreviewing(true)}
                  >
                    Preview journey
                  </button>
                </div>

                <ol className="story-composer__scene-strip" data-testid="story-scene-strip">
                  {scenes.map((scene, index) => (
                    <li key={scene.id}>
                      <button
                        type="button"
                        data-testid={`story-scene-${scene.id}`}
                        data-active={editingSceneId === scene.id ? "true" : undefined}
                        onClick={() => {
                          setAddingScene(false);
                          setEditingSceneId(scene.id);
                        }}
                      >
                        <span>{index + 1}</span>
                        <strong>{scene.title}</strong>
                        <small>{scene.durationMs}ms · {scene.transition}</small>
                      </button>
                      <span className="story-composer__reorder">
                        <button
                          type="button"
                          aria-label={`Move ${scene.title} earlier`}
                          disabled={index === 0}
                          onClick={() => void moveScene(scene.id, -1)}
                        >↑</button>
                        <button
                          type="button"
                          aria-label={`Move ${scene.title} later`}
                          disabled={index === scenes.length - 1}
                          onClick={() => void moveScene(scene.id, 1)}
                        >↓</button>
                      </span>
                    </li>
                  ))}
                </ol>

                {addingScene && (
                  <SceneEditor
                    nodeOptions={nodeOptions}
                    onSubmit={addScene}
                    onCancel={() => setAddingScene(false)}
                  />
                )}

                {editingScene && (
                  <SceneEditor
                    nodeOptions={nodeOptions}
                    submitLabel="Save scene"
                    initial={{
                      title: editingScene.title,
                      nodeIds: editingScene.nodeIds,
                      mediaAssetIds: editingScene.mediaAssetIds,
                      narrationText: editingScene.narrationText,
                      transition: editingScene.transition,
                      durationMs: editingScene.durationMs,
                    }}
                    onSubmit={(input) => updateScene(editingScene.id, input)}
                    onCancel={() => setEditingSceneId(null)}
                  />
                )}
              </>
            )}
          </main>
        </div>
      )}

      {previewing && (
        <PreviewPlayer scenes={scenes} resolveAsset={resolveAsset} onClose={() => setPreviewing(false)} />
      )}
    </section>
  );
}
