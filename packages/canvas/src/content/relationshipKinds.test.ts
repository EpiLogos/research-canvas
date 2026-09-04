import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_KINDS,
  isRelationshipKind,
  type RelationshipKind,
} from "./relationshipKinds";

describe("relationshipKinds", () => {
  it("distinguishes structural, historical, epistemic, geographic, and archetypal relationships", () => {
    expect(RELATIONSHIP_KINDS.map((option) => option.kind)).toEqual([
      "RELATES_TO",
      "CONTAINS",
      "PART_OF",
      "NESTS",
      "INSTANTIATES",
      "ECHOES",
      "CAUSES",
      "INFLUENCES",
      "OPPOSES",
      "INHERITS",
      "TRANSFORMS_INTO",
      "LOCATED_AT",
      "SOURCED_FROM",
      "SUPPORTS",
      "QUALIFIES",
      "CONTESTS",
      "CONTRADICTS",
      "ARCHETYPE_EXPRESSES_AT",
      "RESONATES_WITH",
      "SEQUENCE_NEXT",
      "UNCLASSIFIED_RESEARCH_CONNECTION",
      "ENCAPSULATES",
    ]);
  });

  it("gives every kind a non-empty human label and description", () => {
    for (const option of RELATIONSHIP_KINDS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it("recognises valid SCREAMING_SNAKE kinds and rejects others", () => {
    expect(isRelationshipKind("CAUSES")).toBe(true);
    expect(isRelationshipKind("CONTAINS")).toBe(true);
    expect(isRelationshipKind("UNCLASSIFIED_RESEARCH_CONNECTION")).toBe(true);
    expect(isRelationshipKind("causes")).toBe(false);
    expect(isRelationshipKind("RELATES")).toBe(false);
  });

  it("narrows the type through the guard", () => {
    const raw = "OPPOSES";
    if (isRelationshipKind(raw)) {
      const kind: RelationshipKind = raw;
      expect(kind).toBe("OPPOSES");
    }
  });
});
