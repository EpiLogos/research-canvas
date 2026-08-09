import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";

import {
  activeCue,
  cuesForTimestampRange,
  parseWebVtt,
  type VttCue,
} from "./vtt";
import {
  passageUnitLabel,
  type StoryPassageView,
} from "./storyPresentation";

/**
 * The story surface (vision §3.13/§3.16): a journey as a scene sequence with
 * per-scene language switching, consent-filtered passages (redactions as
 * gaps), and media playback with transcript sync. The surface is
 * presentation-only — all consent/language logic lives in
 * `presentStoryScene`/`consentedPassages`, which the export path shares.
 */

export interface StorySurfaceSceneData {
  sceneId: string;
  title: string;
  placeId: string;
  language: string;
  availableLanguages: string[];
  passages: StoryPassageView[];
  media: string[];
  transcriptPath: string | null;
}

export interface StorySurfaceProps {
  title: string;
  profileScope: string;
  scenes: StorySurfaceSceneData[];
  defaultLanguage: string;
  resolveAsset: (path: string) => string;
  loadTranscript?: (path: string) => Promise<string>;
  onLanguageChange?: (sceneId: string, language: string) => void;
}

export async function defaultLoadTranscript(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`transcript request failed with status ${response.status}`);
  }
  return response.text();
}

export function StorySurface({
  title,
  profileScope,
  scenes,
  defaultLanguage,
  resolveAsset,
  loadTranscript = defaultLoadTranscript,
  onLanguageChange,
}: StorySurfaceProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const [transcripts, setTranscripts] = useState<Record<string, VttCue[]>>({});
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({});
  const activeScene = scenes[activeIndex] ?? null;
  const publishedCount = activeScene
    ? activeScene.passages.length
    : 0;
  const redactedCount = activeScene
    ? activeScene.passages.filter((passage) => passage.redacted).length
    : 0;

  const loadTranscriptForScene = useCallback(
    async (scene: StorySurfaceSceneData) => {
      if (!scene.transcriptPath || transcripts[scene.sceneId]) return;
      try {
        const text = await loadTranscript(resolveAsset(scene.transcriptPath));
        setTranscripts((current) => ({
          ...current,
          [scene.sceneId]: parseWebVtt(text),
        }));
      } catch (cause) {
        setTranscriptErrors((current) => ({
          ...current,
          [scene.sceneId]: cause instanceof Error ? cause.message : String(cause),
        }));
      }
    },
    [loadTranscript, resolveAsset, transcripts],
  );

  useEffect(() => {
    if (activeScene) {
      void loadTranscriptForScene(activeScene);
    }
  }, [activeScene, loadTranscriptForScene]);

  const cues = activeScene ? transcripts[activeScene.sceneId] ?? [] : [];
  const activeMedia = activeScene?.media[0] ?? null;
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const highlightedCue = activeCue(cues, playbackTimeMs);
  const passageTexts = useMemo(() => {
    if (!activeScene) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const passage of activeScene.passages) {
      if (!isTimestampRange(passage.unit)) continue;
      const overlapping = cuesForTimestampRange(
        cues,
        passage.unit.startMs,
        passage.unit.endMs,
      );
      map.set(
        passage.key,
        overlapping.map((cue) => cue.text).join(" ").trim(),
      );
    }
    return map;
  }, [activeScene, cues]);

  const changeLanguage = (language: string) => {
    if (activeScene) {
      onLanguageChange?.(activeScene.sceneId, language);
    }
  };

  return (
    <section className="story-surface" data-testid="story-surface">
      <header className="story-surface__header">
        <p className="story-surface__eyebrow">{profileScope} profile · published story</p>
        <h2>{title}</h2>
      </header>

      {scenes.length === 0 ? (
        <p className="story-surface__empty" data-testid="story-surface-empty">
          No published scenes for this story yet.
        </p>
      ) : activeScene ? (
        <div className="story-surface__layout">
          <nav className="story-surface__nav" data-testid="story-scene-nav">
            <button
              type="button"
              disabled={activeIndex === 0}
              data-testid="story-prev"
              onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            >
              Previous
            </button>
            <ol>
              {scenes.map((scene, index) => (
                <li key={scene.sceneId}>
                  <button
                    type="button"
                    data-active={index === activeIndex ? "true" : undefined}
                    data-testid={`story-scene-${scene.sceneId}`}
                    onClick={() => setActiveIndex(index)}
                  >
                    {index + 1}. {scene.title}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              disabled={activeIndex >= scenes.length - 1}
              data-testid="story-next"
              onClick={() =>
                setActiveIndex((index) => Math.min(scenes.length - 1, index + 1))
              }
            >
              Next
            </button>
          </nav>

          <article className="story-surface__scene" data-testid="story-scene">
            <div className="story-surface__scene-head">
              <h3>{activeScene.title}</h3>
              <label className="story-surface__language">
                Language
                <select
                  value={activeScene.language}
                  data-testid="story-language"
                  onChange={(event) => changeLanguage(event.target.value)}
                >
                  {activeScene.availableLanguages.map((language) => (
                    <option key={language} value={language}>
                      {language === defaultLanguage
                        ? `${language} (original)`
                        : language}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="story-surface__consent">
              {publishedCount} published passage{publishedCount === 1 ? "" : "s"}
              {redactedCount > 0
                ? ` · ${redactedCount} redacted gap${redactedCount === 1 ? "" : "s"}`
                : ""}
            </p>

            {activeMedia && (
              <div className="story-surface__media" data-testid="story-media">
                <audio
                  controls
                  src={resolveAsset(activeMedia)}
                  data-testid="story-audio"
                  onTimeUpdate={(event) =>
                    setPlaybackTimeMs(
                      Math.floor((event.currentTarget.currentTime ?? 0) * 1000),
                    )
                  }
                />
              </div>
            )}

            {transcriptErrors[activeScene.sceneId] && (
              <p className="story-surface__transcript-error">
                Transcript unavailable: {transcriptErrors[activeScene.sceneId]}
              </p>
            )}

            <ul className="story-surface__passages" data-testid="story-passages">
              {activeScene.passages.map((passage, index) => {
                const text = passageTexts.get(passage.key);
                return (
                  <li
                    key={passage.key}
                    className="story-surface__passage"
                    data-redacted={passage.redacted ? "true" : "false"}
                    data-testid={`story-passage-${index}`}
                  >
                    <span className="story-surface__passage-label">
                      {passageUnitLabel({
                        artifactId: passage.artifactId,
                        unit: passage.unit,
                      })}
                    </span>
                    {passage.redacted ? (
                      <span className="story-surface__gap">
                        Redacted
                        {passage.gaps.length > 0
                          ? ` · ${passage.gaps.length} gap${passage.gaps.length === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    ) : text ? (
                      <blockquote className="story-surface__passage-text">{text}</blockquote>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {cues.length > 0 && (
              <ol className="story-surface__transcript" data-testid="story-transcript">
                {cues.map((cue) => (
                  <li
                    key={cue.id}
                    data-active={
                      highlightedCue?.id === cue.id ? "true" : "false"
                    }
                    data-testid={`story-cue-${cue.id}`}
                  >
                    {cue.text}
                  </li>
                ))}
              </ol>
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}

function isTimestampRange(
  unit: unknown,
): unit is { kind: "timestamp_range"; startMs: number; endMs: number } {
  return (
    typeof unit === "object" &&
    unit !== null &&
    (unit as { kind?: string }).kind === "timestamp_range"
  );
}
