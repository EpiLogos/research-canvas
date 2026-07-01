import { useCallback, useEffect, useState } from "react";

import {
  RELATIONSHIP_KINDS,
  type RelationshipKind,
} from "@research-canvas/canvas";
import type { GraphNode } from "@research-canvas/desktop-api";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface LinkNodePickerProps {
  sourceGraphNodeId: string;
}

export function LinkNodePicker({ sourceGraphNodeId }: LinkNodePickerProps) {
  const workspace = useCanvasWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [kind, setKind] = useState<RelationshipKind>("INSTANTIATES");

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    void workspace.transport.searchGraph({ query, limit: 10 }).then((hits) => {
      if (!cancelled) {
        setResults(hits.filter((hit) => hit.graphNodeId !== sourceGraphNodeId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, sourceGraphNodeId, workspace.transport]);

  const link = useCallback(
    async (targetGraphNodeId: string) => {
      await workspace.contentLinkingActions.linkNodes({
        sourceGraphNodeId,
        targetGraphNodeId,
        kind,
      });
      setQuery("");
      setResults([]);
    },
    [kind, sourceGraphNodeId, workspace.contentLinkingActions],
  );

  return (
    <div className="link-node-picker">
      <select
        className="link-node-picker__kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as RelationshipKind)}
      >
        {RELATIONSHIP_KINDS.map((option) => (
          <option key={option.kind} value={option.kind} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        className="link-node-picker__query"
        placeholder="Link to…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="link-node-picker__results">
        {results.map((node) => (
          <li key={node.graphNodeId}>
            <button onClick={() => void link(node.graphNodeId)}>{node.title}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
