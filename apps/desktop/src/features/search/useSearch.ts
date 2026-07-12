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
  onSetLens?: (lens: "canvas" | "timeline" | "reading") => void;
  onToggleTerminal?: () => void;
}

export function useSearch(query: string, options: UseSearchOptions = {}) {
  const workspace = useCanvasWorkspace();
  const deferredQuery = useDeferredValue(query);
  const [backendItems, setBackendItems] = useState<SearchPaletteItem[]>([]);
  const { onSetLens, onToggleTerminal } = options;

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
          void workspace.createNoteNode();
        }
      }
    ];

    if (onSetLens) {
      commandItems.push(
        {
          id: "command:lens-canvas",
          kind: "command",
          title: "Go to Canvas",
          summary: "Switch to the canvas lens",
          onSelect: () => onSetLens("canvas")
        },
        {
          id: "command:lens-timeline",
          kind: "command",
          title: "Go to Timeline",
          summary: "Switch to the timeline lens",
          onSelect: () => onSetLens("timeline")
        },
        {
          id: "command:lens-reading",
          kind: "command",
          title: "Go to Reading",
          summary: "Switch to the reading lens",
          onSelect: () => onSetLens("reading")
        }
      );
    }
    if (onToggleTerminal) {
      commandItems.push({
        id: "command:toggle-terminal",
        kind: "command",
        title: "Toggle terminal",
        summary: "Show or hide the terminal dock",
        onSelect: () => onToggleTerminal()
      });
    }

    return [...fileItems, ...nodeItems, ...commandItems];
  }, [
    onSetLens,
    onToggleTerminal,
    workspace.createNoteNode,
    workspace.entries,
    workspace.nodes,
    workspace.selectEntry,
    workspace.selectNode
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
      .searchConstellation(deferredQuery, 8)
      .then((hits) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          const nextItems: SearchPaletteItem[] = hits
            .filter((hit) =>
              hit.entityType === "file" ||
              hit.entityType === "node" ||
              hit.entityType === "sequence" ||
              hit.entityType === "sequence_step"
            )
            .map((hit): SearchPaletteItem => ({
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
                if (hit.constellationId !== workspace.constellationId) {
                  workspace.selectConstellation(hit.constellationId);
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
            }));
          // Query transports can be recreated by an embedding surface while
          // still returning the same hits. Retaining equivalent state avoids
          // an effect → state update → render loop (and protects the command
          // palette from exhausting memory under a slow search transport).
          setBackendItems((current) => sameBackendItems(current, nextItems) ? current : nextItems);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setBackendItems((current) => current.length === 0 ? current : []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    deferredQuery,
    workspace.entries,
    workspace.constellationId,
    workspace.searchConstellation,
    workspace.selectEntry,
    workspace.selectNode,
    workspace.selectConstellation
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

function sameBackendItems(current: SearchPaletteItem[], next: SearchPaletteItem[]): boolean {
  return current.length === next.length
    && current.every((item, index) => {
      const candidate = next[index];
      return candidate !== undefined
        && item.id === candidate.id
        && item.kind === candidate.kind
        && item.title === candidate.title
        && item.summary === candidate.summary;
    });
}
