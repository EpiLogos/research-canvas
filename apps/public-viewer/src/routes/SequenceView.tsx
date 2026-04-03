import type { ExportBundle } from "@research-canvas/schema";

interface SequenceViewProps {
  bundle: ExportBundle;
}

export function SequenceView({ bundle }: SequenceViewProps) {
  const sequencingEdges = bundle.edges.filter((edge) => edge.sequencing);

  return (
    <main className="viewer viewer--sequence">
      <header className="viewer__hero">
        <p className="eyebrow">Sequence view</p>
        <h1>{bundle.project.displayName}</h1>
        <p>Guided traversal of the export</p>
      </header>
      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Steps</p>
          <h2>Published tour</h2>
        </header>
        <ol className="viewer__step-list">
          {sequencingEdges
            .sort((a, b) => a.sequencePriority - b.sequencePriority)
            .map((edge) => {
              const sourceNode = bundle.nodes.find((node) => node.id === edge.sourceNodeId);
              const targetNode = bundle.nodes.find((node) => node.id === edge.targetNodeId);

              return (
                <li key={edge.id}>
                  <strong>{sourceNode?.title ?? "Unknown"}</strong>
                  <span>{edge.relationKind}</span>
                  <strong>{targetNode?.title ?? "Unknown"}</strong>
                </li>
              );
            })}
        </ol>
      </section>
    </main>
  );
}
