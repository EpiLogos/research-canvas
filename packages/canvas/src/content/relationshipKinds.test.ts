import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_KINDS,
  isRelationshipKind,
  type RelationshipKind,
} from "./relationshipKinds";

describe("relationshipKinds", () => {
  it("lists exactly the ten spec relationship kinds in order", () => {
    expect(RELATIONSHIP_KINDS.map((option) => option.kind)).toEqual([
      "INSTANTIATES",
      "ECHOES",
      "CAUSES",
      "INFLUENCES",
      "OPPOSES",
      "INHERITS",
      "TRANSFORMS_INTO",
      "LOCATED_AT",
      "SOURCED_FROM",
      "RESONATES_WITH",
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
