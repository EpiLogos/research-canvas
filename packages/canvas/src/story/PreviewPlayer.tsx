import type { StoryAuthoringScene } from "@research-canvas/domain";
import { useEffect, useState, type JSX } from "react";

export interface PreviewPlayerProps {
  scenes: StoryAuthoringScene[];
  resolveAsset: (assetId: string) => string;
  onClose: () => void;
}

export function PreviewPlayer({ scenes, resolveAsset, onClose }: PreviewPlayerProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const scene = scenes[index] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [scenes]);

  useEffect(() => {
    if (!scene || scenes.length < 2) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, scenes.length - 1));
    }, Math.max(250, scene.durationMs));
    return () => window.clearTimeout(timer);
  }, [scene, scenes.length]);

  return (
    <div className="story-preview" data-testid="story-preview-player" role="dialog" aria-modal="true">
      <header>
        <span>Preview · {Math.min(index + 1, scenes.length)} / {scenes.length}</span>
        <button type="button" data-testid="story-preview-close" onClick={onClose}>Close preview</button>
      </header>
      {scene ? (
        <article
          key={scene.id}
          data-testid="story-preview-scene"
          data-scene-id={scene.id}
          data-transition={scene.transition}
        >
          <h2>{scene.title}</h2>
          {scene.narrationText && <p>{scene.narrationText}</p>}
          {scene.mediaAssetIds.length > 0 && (
            <div className="story-preview__media" data-testid="story-preview-media">
              {scene.mediaAssetIds.map((assetId) => (
                <StoryMedia key={assetId} assetId={assetId} resolveAsset={resolveAsset} />
              ))}
            </div>
          )}
        </article>
      ) : (
        <p data-testid="story-preview-empty">This journey has no scenes yet.</p>
      )}
      {scene && scenes.length > 1 && (
        <footer>
          <button
            type="button"
            data-testid="story-preview-prev"
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >Previous</button>
          <button
            type="button"
            data-testid="story-preview-next"
            disabled={index >= scenes.length - 1}
            onClick={() => setIndex((current) => Math.min(scenes.length - 1, current + 1))}
          >Next</button>
        </footer>
      )}
    </div>
  );
}

function StoryMedia({ assetId, resolveAsset }: { assetId: string; resolveAsset: (assetId: string) => string }): JSX.Element {
  const src = resolveAsset(assetId);
  const lower = assetId.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(lower)) {
    return <img src={src} alt="" data-testid="story-preview-image" />;
  }
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) {
    return <video src={src} controls data-testid="story-preview-video" />;
  }
  if (/\.(mp3|wav|ogg|m4a|flac)$/.test(lower)) {
    return <audio src={src} controls data-testid="story-preview-audio" />;
  }
  return <a href={src} data-testid="story-preview-asset">{assetId}</a>;
}
