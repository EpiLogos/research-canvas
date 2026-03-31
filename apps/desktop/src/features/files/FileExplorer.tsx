import {
  buildIndexedEntryTree,
  type IndexedEntry
} from "@research-canvas/desktop-api";

interface FileExplorerProps {
  entries: IndexedEntry[];
  projectName: string;
  selectedEntryId: string;
  onSelectEntry: (entry: IndexedEntry) => void;
}

export function FileExplorer({
  entries,
  projectName,
  selectedEntryId,
  onSelectEntry
}: FileExplorerProps) {
  const tree = buildIndexedEntryTree(entries);

  return (
    <section className="tree-section" aria-label="Project files">
      <div className="tree-section__heading">
        <p className="eyebrow">Files</p>
        <h2>{projectName}</h2>
      </div>
      <ul className="tree" role="tree">
        {tree.map((entry) => (
          <EntryNode
            key={entry.id}
            entry={entry}
            selectedEntryId={selectedEntryId}
            onSelectEntry={onSelectEntry}
            level={1}
          />
        ))}
      </ul>
    </section>
  );
}

interface EntryNodeProps {
  entry: ReturnType<typeof buildIndexedEntryTree>[number];
  selectedEntryId: string;
  onSelectEntry: (entry: IndexedEntry) => void;
  level: number;
}

function EntryNode({
  entry,
  selectedEntryId,
  onSelectEntry,
  level
}: EntryNodeProps) {
  const selected = entry.id === selectedEntryId;

  return (
    <li
      className="tree__item"
      role="treeitem"
      aria-level={level}
      aria-selected={selected}
    >
      <button
        className="tree__button"
        aria-label={`${entry.name} ${entry.kind}`}
        data-selected={selected ? "true" : undefined}
        type="button"
        onClick={() => onSelectEntry(entry)}
      >
        <span className="tree__name" data-selected={selected ? "true" : undefined}>
          {entry.name}
        </span>
        <span className="tree__summary">{entry.kind}</span>
      </button>

      {entry.children.length > 0 ? (
        <ul className="tree tree--nested" role="group">
          {entry.children.map((child) => (
            <EntryNode
              key={child.id}
              entry={child}
              selectedEntryId={selectedEntryId}
              onSelectEntry={onSelectEntry}
              level={level + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
