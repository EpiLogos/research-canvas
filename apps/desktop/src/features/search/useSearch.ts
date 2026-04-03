import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { rankSearchResults } from "@research-canvas/search";

import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

export interface SearchPaletteItem {
  id: string;
  kind: "command" | "file" | "node" | "sequence";
  summary: string;
  title: string;
  onSelect: () => void;
}

interface UseSearchOptions {
  onOpenExport?: () => void;
}

export function useSearch(query: string, options: UseSearchOptions = {}) {
  const workspace = useCanvasWorkspace();
  const deferredQuery = useDeferredValue(query);
  const [backendItems, setBackendItems] = useState<SearchPaletteItem[]>([]);
  const { onOpenExport } = options;

  const localItems = useMemo<SearchPaletteItem[]>(() => {
    const fileItems = workspace.entries
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({
        id: `file:${entry.id}`,
        kind: "file" as const,
        summary: entry.relativePath,
        title: entry.name,
        onSelect: () => {
          workspace.selectEntry(entry.id);
        }
      }));

    const nodeItems = workspace.nodes.map((node) => ({
      id: `node:${node.id}`,
      kind: "node" as const,
      summary: node.summary,
      title: node.title,
      onSelect: () => {
        workspace.selectNode(node.id);
      }
    }));

    const commandItems: SearchPaletteItem[] = [
      {
        id: "command:create-note",
        kind: "command",
        summary: "Create a new note node on the canvas",
        title: "Create note",
        onSelect: () => {
          const node = workspace.store.getState().createNoteNode({
            title: "Opening note",
            content:
              "# Opening note\n\nThe thesis starts here.\n\n- first supporting point\n- second supporting point"
          });
          workspace.selectNode(node.id);
        }
      },
      {
        id: "command:export-project",
        kind: "command",
        summary: "Open the publish/export flow",
        title: "Export project",
        onSelect: () => {
          onOpenExport?.();
        }
      },
      {
        id: "command:focus-terminal",
        kind: "command",
        summary: "Keep the shell ready for project work",
        title: "Focus terminal",
        onSelect: () => {}
      }
    ];

    return [...fileItems, ...nodeItems, ...commandItems];
  }, [
    onOpenExport,
    workspace.entries,
    workspace.nodes,
    workspace.selectEntry,
    workspace.selectNode,
    workspace.store
  ]);

  const rankedLocalItems = useMemo(() => {
    const ranking = rankSearchResults(
      deferredQuery,
      localItems.map((item) => ({
        id: item.id,
        text: `${item.title} ${item.summary}`
      }))
    );
    const itemsById = new Map(localItems.map((item) => [item.id, item]));

    return ranking
      .map((candidate) => itemsById.get(candidate.id))
      .filter((item): item is SearchPaletteItem => Boolean(item))
      .slice(0, 8);
  }, [deferredQuery, localItems]);

  useEffect(() => {
    if (!deferredQuery.trim()) {
      setBackendItems((current) => (current.length === 0 ? current : []));
      return;
    }

    let cancelled = false;

    void workspace
      .searchProject(deferredQuery, 8)
      .then((hits) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setBackendItems(
            hits
              .filter((hit) =>
                hit.entityType === "file" ||
                hit.entityType === "node" ||
                hit.entityType === "sequence" ||
                hit.entityType === "sequence_step"
              )
              .map((hit) => ({
                id: `backend:${hit.entityType}:${hit.entityId}`,
                kind:
                  hit.entityType === "file"
                    ? "file"
                    : hit.entityType === "node"
                      ? "node"
                      : "sequence",
                summary: hit.relativePath ?? hit.summary ?? hit.snippet,
                title: hit.title,
                onSelect: () => {
                  if (hit.projectId !== workspace.projectId) {
                    workspace.selectProject(hit.projectId);
                    return;
                  }

                  if (hit.entityType === "file" && hit.relativePath) {
                    const entry = workspace.entries.find(
                      (candidate) => candidate.relativePath === hit.relativePath
                    );
                    if (entry) {
                      workspace.selectEntry(entry.id);
                    }
                  }

                  if (hit.entityType === "node") {
                    workspace.selectNode(hit.entityId);
                  }
                }
              }))
          );
        });
      })
      .catch(() => {
        if (!cancelled) {
          setBackendItems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    deferredQuery,
    workspace.entries,
    workspace.projectId,
    workspace.searchProject,
    workspace.selectEntry,
    workspace.selectNode,
    workspace.selectProject
  ]);

  const items = useMemo(() => {
    const merged = new Map<string, SearchPaletteItem>();

    for (const item of [...rankedLocalItems, ...backendItems]) {
      const key = `${item.kind}:${item.title.toLowerCase()}`;
      if (!merged.has(key)) {
        merged.set(key, item);
      }
    }

    return Array.from(merged.values()).slice(0, 12);
  }, [backendItems, rankedLocalItems]);

  return items;
}
