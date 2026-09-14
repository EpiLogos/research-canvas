# Archetypal expression Cypher (ticket #32)

The `ARCHETYPE_EXPRESSES_AT` relationship links an `Archetype` graph node to a
`Place` graph node. It records that the archetype shows up — is *expressed* —
at that place within a temporal window, with the expression kind and the source
coordinates that justify the claim.

This document is the canonical statement of the relationship shape. The TypeScript
contract in `packages/schema/src/archetype.ts` (`archetypalExpressionSchema`) is
the mirror of these statements; when they drift, the schema is authoritative.

## Relationship shape

```
(:GraphNode {entityType: "Archetype"})-[:ARCHETYPE_EXPRESSES_AT {
  timeWindow: {start: <ISO-8601>, end: <ISO-8601|null>, precision: <unit>},
  expressionKind: <kind>,
  sourceCoordinates: [<coordinate>, ...]
}]->(:GraphNode {entityType: "Place"})
```

- `timeWindow` — closed or half-open window; `precision` is one of
  `millennium | century | decade | year | month | day | instant | unspecified`
- `expressionKind` — one of
  `mythic | ritual | literary | visual | theoretical`
- `sourceCoordinates` — passage/source identifiers that support the claim

## Seed statements

Three root archetypes with a small expression footprint across two anchor places
(Rome, Babylon). Run inside a project namespace by prefixing `graphNodeId`
values with the workspace namespace.

```cypher
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
  timeWindow: {start: "-0027-01-01", end: "0476-01-01", precision: "century"}
}]->(rome)

CREATE (empire)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["enuma-elish"],
  expressionKind: "ritual",
  timeWindow: {start: "-0189-01-01", end: "-0539-01-01", precision: "century"}
}]->(babylon)

CREATE (fall)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["ammianus-31"],
  expressionKind: "literary",
  timeWindow: {start: "0376-01-01", end: "0476-01-01", precision: "century"}
}]->(rome)

CREATE (law)-[:ARCHETYPE_EXPRESSES_AT {
  sourceCoordinates: ["codex-hammurabi"],
  expressionKind: "theoretical",
  timeWindow: {start: "-1750-01-01", end: null, precision: "century"}
}]->(babylon)
```

## Querying the heatmap

```cypher
// All expressions of a given archetype, with place details
MATCH (a:GraphNode {entityType: "Archetype"})-[:ARCHETYPE_EXPRESSES_AT]->(p:GraphNode {entityType: "Place"})
WHERE a.graphNodeId = $archetypeId
RETURN a.graphNodeId AS archetypeId,
       p.graphNodeId AS placeGraphNodeId,
       r.timeWindow AS timeWindow,
       r.expressionKind AS expressionKind,
       r.sourceCoordinates AS sourceCoordinates

// Expression footprint for the spectral background layer
MATCH (a:GraphNode {entityType: "Archetype"})-[r:ARCHETYPE_EXPRESSES_AT]->(p:GraphNode {entityType: "Place"})
RETURN a.graphNodeId AS archetypeId,
       a.title AS title,
       collect({place: p.graphNodeId, timeWindow: r.timeWindow,
                kind: r.expressionKind, sources: r.sourceCoordinates}) AS expressions
```

## Notes

- The heatmap read path is exposed through the `ArchetypeRepository` port
  (`listExpressions`, `listExpressionsForTimeWindow`, `listExpressionsForPlace`,
  `getArchetypeHeatmap`) with a fake adapter in
  `packages/domain/src/archetype.test.ts`.
- No SQLite layout table backs this relationship; expressions live in Neo4j as
  graph substance. If a local projection is ever needed for surface rendering,
  add it deliberately with its own migration and test.
