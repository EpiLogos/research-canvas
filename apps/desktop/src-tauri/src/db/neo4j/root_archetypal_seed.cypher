// Root archetypal seed (ticket #32).
// Three root archetypes and a small set of ARCHETYPE_EXPRESSES_AT relationships
// across two anchor places. Run inside a project namespace by prefixing graphNodeId
// values with the workspace namespace.

CREATE (empire:GraphNode {
  graphNodeId: "${namespace}:arch-empire",
  entityType: "Archetype",
  title: "Imperial Centre",
  summary: "The image of a single centre that claims to hold the whole field."
})

CREATE (fall:GraphNode {
  graphNodeId: "${namespace}:arch-fall",
  entityType: "Archetype",
  title: "Imperial Collapse",
  summary: "The image of a centre that can no longer hold and releases its fragments."
})

CREATE (law:GraphNode {
  graphNodeId: "${namespace}:arch-law",
  entityType: "Archetype",
  title: "Codified Law",
  summary: "The image of order written down and enforced from the centre."
})

CREATE (rome:GraphNode {
  graphNodeId: "${namespace}:place-rome",
  entityType: "Place",
  title: "Rome",
  placeCoverage: "resolved"
})

CREATE (babylon:GraphNode {
  graphNodeId: "${namespace}:place-babylon",
  entityType: "Place",
  title: "Babylon",
  placeCoverage: "resolved"
})

CREATE (empire)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["livvy-1"],
  expressionKind: "mythic",
  timeWindowStart: "-0027-01-01",
  timeWindowEnd: "0476-01-01",
  timeWindowPrecision: "century"
}]->(rome)

CREATE (empire)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["enuma-elish"],
  expressionKind: "ritual",
  timeWindowStart: "-0189-01-01",
  timeWindowEnd: "-0539-01-01",
  timeWindowPrecision: "century"
}]->(babylon)

CREATE (fall)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["ammianus-31"],
  expressionKind: "literary",
  timeWindowStart: "0376-01-01",
  timeWindowEnd: "0476-01-01",
  timeWindowPrecision: "century"
}]->(rome)

CREATE (law)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["codex-hammurabi"],
  expressionKind: "theoretical",
  timeWindowStart: "-1750-01-01",
  timeWindowEnd: null,
  timeWindowPrecision: "century"
}]->(babylon);
