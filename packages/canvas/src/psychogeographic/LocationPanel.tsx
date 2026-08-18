import type { ArchetypalExpression, GraphNodeContract } from "@research-canvas/schema";
import type { LocatedGraphNode } from "@research-canvas/domain";
import type { JSX } from "react";

export interface LocationPanelProps {
  node: LocatedGraphNode;
  relatedNodes: GraphNodeContract[];
  expressions: ArchetypalExpression[];
  loadingContext?: boolean;
}

/** Focused context panel for one selected location on Surface #3. */
export function LocationPanel({
  node,
  relatedNodes,
  expressions,
  loadingContext = false,
}: LocationPanelProps): JSX.Element {
  const coordinate = pointForPlace(node);
  const precision = node.place.coordinate.precision;
  const archetypesById = new Map(
    relatedNodes.map((related) => [related.graphNodeId, related.title] as const),
  );

  return (
    <aside
      className="places-location-panel"
      data-testid="places-location-panel"
      aria-label={`Location details for ${node.title}`}
      style={{
        position: "absolute",
        top: 56,
        right: 12,
        bottom: 48,
        zIndex: 8,
        width: "min(340px, calc(100% - 32px))",
        overflow: "auto",
        padding: "16px 16px 18px",
        border: "1px solid var(--ob-line-3, #3a4e64)",
        borderRadius: 12,
        background: "rgba(17, 24, 37, 0.94)",
        boxShadow: "0 22px 50px -20px rgba(0,0,0,.9)",
        backdropFilter: "blur(14px)",
        color: "var(--ob-ink, #e4ebf4)",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ob-faint, #7a8ca4)" }}>
          {node.entityType} · {precision}
        </div>
        <h2 style={{ margin: "5px 0 0", fontSize: 18, fontWeight: 600 }}>{node.title}</h2>
      </header>

      <dl style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: "6px 10px", margin: 0, fontSize: 12 }}>
        <dt style={{ color: "var(--ob-faint, #7a8ca4)" }}>Coordinates</dt>
        <dd data-testid="place-coordinates" style={{ margin: 0 }}>
          {coordinate
            ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
            : precision === "region"
              ? "Regional geometry"
              : "Unlocated"}
        </dd>
        <dt style={{ color: "var(--ob-faint, #7a8ca4)" }}>Precision</dt>
        <dd data-testid="place-precision" style={{ margin: 0 }}>{precision}</dd>
        <dt style={{ color: "var(--ob-faint, #7a8ca4)" }}>Height</dt>
        <dd data-testid="place-height" style={{ margin: 0 }}>Not recorded</dd>
      </dl>

      <section style={{ marginTop: 18 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ob-dim, #8797ab)" }}>
          Related nodes
        </h3>
        {loadingContext ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--ob-faint, #7a8ca4)" }}>Loading context…</p>
        ) : relatedNodes.length > 0 ? (
          <ul data-testid="place-related-nodes" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {relatedNodes.map((related) => (
              <li key={related.graphNodeId}>{related.title} · {related.entityType}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--ob-faint, #7a8ca4)" }}>No related nodes in the local projection.</p>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ob-dim, #8797ab)" }}>
          Archetypal expressions
        </h3>
        {expressions.length > 0 ? (
          <ul data-testid="place-archetype-expressions" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {expressions.map((expression) => (
              <li key={expression.id}>
                {archetypesById.get(expression.archetypeGraphNodeId) ?? expression.archetypeGraphNodeId}
                {" · "}{expression.expressionKind}
                {" · "}{expression.timeWindow.start}
                {expression.timeWindow.end ? `–${expression.timeWindow.end}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--ob-faint, #7a8ca4)" }}>No archetypal expressions at this place.</p>
        )}
      </section>
    </aside>
  );
}

export function pointForPlace(node: LocatedGraphNode): { latitude: number; longitude: number } | null {
  const coordinate = node.place.coordinate;
  if (coordinate.precision === "exact" || coordinate.precision === "approximate") {
    return { latitude: coordinate.latitude, longitude: coordinate.longitude };
  }
  if (coordinate.precision !== "region") return null;

  const polygons = coordinate.geometry.type === "Polygon"
    ? [coordinate.geometry.coordinates]
    : coordinate.geometry.coordinates;
  const outerRings = polygons.map((polygon) => polygon[0]).filter(Boolean);
  const positions = outerRings.flat();
  if (positions.length === 0) return null;
  const totals = positions.reduce(
    (sum, [longitude, latitude]) => ({
      latitude: sum.latitude + latitude,
      longitude: sum.longitude + longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / positions.length,
    longitude: totals.longitude / positions.length,
  };
}
