import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import type { SearchHit } from "@research-canvas/desktop-api";

export function SearchPanel() {
  const workspace = useCanvasWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const hits = await workspace.searchProject(q.trim(), 20);
      setResults(hits);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [workspace]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 200);
  }, [runSearch]);

  const handleClickResult = useCallback((hit: SearchHit) => {
    if (hit.entityType === "node" || hit.entityType === "note" || hit.entityType === "resource") {
      workspace.selectNode(hit.entityId);
      workspace.flyToNode(hit.entityId);
    } else if (hit.entityType === "file") {
      workspace.selectEntry(hit.entityId);
    }
  }, [workspace]);

  return (
    <div className="search-panel">
      <div className="search-panel__input-row">
        <input
          ref={inputRef}
          className="search-panel__input"
          type="text"
          placeholder="Search nodes, files..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
        {searching && <span className="search-panel__spinner" />}
      </div>
      <div className="search-panel__results">
        {results.length === 0 && query.trim() && !searching && (
          <div className="lo-empty">No results</div>
        )}
        {results.map((hit) => (
          <button
            key={hit.documentKey}
            className="search-panel__hit"
            onClick={() => handleClickResult(hit)}
            title={hit.sourcePath ?? hit.title}
          >
            <span className="search-panel__hit-type">{hit.entityType}</span>
            <span className="search-panel__hit-title">{hit.title}</span>
            {hit.snippet && <span className="search-panel__hit-snippet">{hit.snippet}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
