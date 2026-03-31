import { useState } from "react";

import type { ResourceRoot } from "@research-canvas/desktop-api";

interface ResourceRootsPanelProps {
  onAttach: (rootPath: string, displayName?: string) => Promise<void>;
  onDetach: (rootPath: string) => Promise<void>;
  resourceRoots: ResourceRoot[];
  workingRoot: string | null;
}

export function ResourceRootsPanel({
  onAttach,
  onDetach,
  resourceRoots,
  workingRoot
}: ResourceRootsPanelProps) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [rootPath, setRootPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const submit = async () => {
    if (!rootPath.trim()) {
      setErrorMessage("Enter an absolute folder path.");
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      await onAttach(rootPath.trim(), displayName.trim() || undefined);
      setRootPath("");
      setDisplayName("");
      setIsComposerOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to attach folder."
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="tree-section" aria-label="Resource pools">
      <div className="tree-section__heading resource-roots__heading">
        <div>
          <p className="eyebrow">Pools</p>
          <h2>Folders</h2>
        </div>
        <button
          className="resource-roots__toggle"
          type="button"
          onClick={() => setIsComposerOpen((current) => !current)}
        >
          {isComposerOpen ? "Close" : "Attach folder"}
        </button>
      </div>

      <div className="resource-roots__working">
        <span>Active root</span>
        <code>{workingRoot ?? "Loading…"}</code>
      </div>

      {isComposerOpen ? (
        <div className="resource-roots__composer">
          <label>
            <span>Path</span>
            <input
              placeholder="/absolute/path/to/folder"
              type="text"
              value={rootPath}
              onChange={(event) => setRootPath(event.target.value)}
            />
          </label>
          <label>
            <span>Name</span>
            <input
              placeholder="Optional display name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          {errorMessage ? <p className="resource-roots__error">{errorMessage}</p> : null}
          <button
            className="resource-roots__submit"
            disabled={isPending}
            type="button"
            onClick={() => {
              void submit();
            }}
          >
            {isPending ? "Attaching…" : "Attach folder"}
          </button>
        </div>
      ) : null}

      <div className="resource-roots__list">
        {resourceRoots.length === 0 ? (
          <p>No attached folders yet.</p>
        ) : (
          resourceRoots.map((root) => (
            <article className="resource-roots__item" key={root.id}>
              <div>
                <strong>{root.displayName}</strong>
                <code>{root.rootPath}</code>
              </div>
              <button
                className="resource-roots__detach"
                type="button"
                onClick={() => {
                  void onDetach(root.rootPath);
                }}
              >
                Remove
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
