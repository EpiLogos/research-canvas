import {
  buildConstellationTree,
  type ConstellationTreeNode
} from "@research-canvas/desktop-api";

interface ConstellationTreeProps {
  constellations: ConstellationTreeNode[];
  selectedConstellationId: string;
  onSelectConstellation: (constellation: ConstellationTreeNode) => void;
}

export function ConstellationTree({
  constellations,
  selectedConstellationId,
  onSelectConstellation
}: ConstellationTreeProps) {
  const tree = flattenConstellations(buildConstellationTree(constellations));

  return (
    <section className="tree-section" aria-label="Constellation tree">
      <div className="tree-section__heading">
        <p className="eyebrow">Constellations</p>
        <h2>Timeline maps</h2>
      </div>
      <ul className="tree tree--constellations" role="tree">
        {tree.map((constellation) => (
          <TreeItem
            key={constellation.id}
            constellation={constellation}
            selectedConstellationId={selectedConstellationId}
            onSelectConstellation={onSelectConstellation}
          />
        ))}
      </ul>
    </section>
  );
}

interface TreeItemProps {
  constellation: ConstellationTreeNode;
  selectedConstellationId: string;
  onSelectConstellation: (constellation: ConstellationTreeNode) => void;
}

function TreeItem({
  constellation,
  selectedConstellationId,
  onSelectConstellation
}: TreeItemProps) {
  const selected = constellation.id === selectedConstellationId;

  return (
    <li className="tree__item" role="treeitem" aria-level={1} aria-selected={selected}>
      <button
        className="tree__button"
        aria-label={`${constellation.name} ${constellation.summary}`}
        data-selected={selected ? "true" : undefined}
        type="button"
        onClick={() => onSelectConstellation(constellation)}
      >
        <span className="tree__name">{constellation.name}</span>
        <span className="tree__summary">{constellation.summary}</span>
      </button>
    </li>
  );
}

function flattenConstellations(constellations: ConstellationTreeNode[]) {
  const flattened: ConstellationTreeNode[] = [];

  const visit = (constellation: ConstellationTreeNode) => {
    flattened.push(constellation);
    for (const child of constellation.children) {
      visit(child);
    }
  };

  for (const constellation of constellations) {
    visit(constellation);
  }

  return flattened;
}
