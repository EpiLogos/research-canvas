import { useEffect } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

interface SettingsOverlayProps {
  onClose: () => void;
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const workspace = useCanvasWorkspace();
  const project = workspace.activeProject;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!project) {
    return (
      <div className="settings-overlay" onClick={onClose}>
        <div className="settings-overlay__inner">
          <p>No project selected</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-overlay__inner" onClick={(e) => e.stopPropagation()}>
        <header className="settings-overlay__header">
          <h2>Settings</h2>
          <button className="settings-overlay__close" onClick={onClose}>&times;</button>
        </header>

        <section className="settings-overlay__section">
          <h3>Project</h3>
          <div className="settings-overlay__field">
            <label>Display name</label>
            <span>{project.displayName}</span>
          </div>
          <div className="settings-overlay__field">
            <label>Slug</label>
            <span>{project.slug}</span>
          </div>
          <div className="settings-overlay__field">
            <label>Summary</label>
            <span>{project.summary}</span>
          </div>
          <div className="settings-overlay__field">
            <label>Root path</label>
            <span style={{ wordBreak: "break-all" }}>{project.rootPath}</span>
          </div>
        </section>

        <section className="settings-overlay__section">
          <h3>Publish</h3>
          <div className="settings-overlay__field">
            <label>Include resources</label>
            <span>{project.publishSettings.includeResources ? "Yes" : "No"}</span>
          </div>
          <div className="settings-overlay__field">
            <label>Theme</label>
            <span>{project.publishSettings.theme}</span>
          </div>
        </section>

        <section className="settings-overlay__section">
          <h3>App</h3>
          <div className="settings-overlay__field">
            <label>Theme</label>
            <span>Dark (only option)</span>
          </div>
        </section>
      </div>
    </div>
  );
}
