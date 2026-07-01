import { describe, expect, it } from "vitest";
import { buildNewGraphNodeInput } from "./nodeCreation";

describe("buildNewGraphNodeInput", () => {
  it("maps a note to a Work entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "note", title: "T" });
    expect(result).toEqual({
      entityType: "Work",
      title: "T",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
    });
  });

  it("maps a group to a Work entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "group", title: "G" });
    expect(result).toEqual({
      entityType: "Work",
      title: "G",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
    });
  });

  it("maps a resource to a Source entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "resource", title: "R" });
    expect(result).toEqual({
      entityType: "Source",
      title: "R",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
    });
  });
});
