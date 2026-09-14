import { describe, expect, it } from "vitest";

import {
  assertAcyclicEncapsulation,
  constellationRecordSchema,
  encapsulationCycle,
  type ConstellationRecord,
  type EncapsulationEdge,
} from "./index";

const now = "2026-08-10T10:00:00.000Z";

const UUID = "b3f2c1a4-5d6e-4f80-9abc-1234567890ab";
const UUID_2 = "c4a3d2b5-6e7f-4a91-8bcd-23456789abcd";

/** Real corpus anchors — passage-level provenance always points back at raw
 * corpus files. */
const DOC_PASSAGE = {
  artifactId:
    "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report5.md",
  unit: { kind: "text_span", startOffset: 210, endOffset: 540 },
} as const;

const CHAT_PASSAGE = {
  artifactId:
    "antichrist-vault/episodes/1/ep-0.1-(now-ep-1.0)/Chat-Log-ep-0.1.md",
  unit: { kind: "text_span", startOffset: 12_000, endOffset: 18_400 },
} as const;

function baseRecord(overrides: Partial<ConstellationRecord> = {}): ConstellationRecord {
  return {
    id: UUID,
    profileScope: "bootstrapping",
    kind: "document",
    title: "Report 5 — parsed into a QL document constellation",
    slug: "report-5-document",
    parentConstellationId: null,
    metadata: {
      time: { start: "1945-05-08", end: "1945-09-02" },
      placeId: "place-berlin",
      ql: {
        shape: "quaternity",
        qlPositions: [0, 1, 2, 3],
        resonanceTags: ["#0", "#1", "#2", "#3"],
      },
      fileRefs: [
        {
          path: "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report5.md",
          kind: "document",
          passageRefs: [DOC_PASSAGE],
        },
      ],
      content: "Deep details of the parsed report structure.",
    },
    assembly: {
      source: "agent_parse",
      parseKind: "ql",
      rawSourceRefs: [DOC_PASSAGE],
      derivedAt: now,
    },
    curationEvents: [{ type: "title", at: now, detail: "user retitled" }],
    seedKey: "report-5:document",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("constellation kind", () => {
  it("accepts episode / document / conceptual kinds", () => {
    for (const kind of ["episode", "document", "conceptual"] as const) {
      expect(
        constellationRecordSchema.safeParse(baseRecord({ kind })).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({ kind: "movement" as never }),
      ).success,
    ).toBe(false);
  });
});

describe("flexible constellation shapes", () => {
  it("accepts living partial structures — dyad, triad, quaternity, 4+2, nested", () => {
    for (const shape of [
      "dyad",
      "triad",
      "quaternity",
      "four_plus_two",
      "sixfold",
      "nested",
      "partial",
    ] as const) {
      expect(
        constellationRecordSchema.safeParse(
          baseRecord({
            metadata: {
              ...baseRecord().metadata,
              ql: { shape, qlPositions: [], resonanceTags: [] },
            },
          }),
        ).success,
      ).toBe(true);
    }
  });

  it("never requires the full six slots and keeps QL resonance tags optional", () => {
    const dyad = baseRecord({
      metadata: {
        time: null,
        placeId: null,
        ql: null,
        fileRefs: [],
        content: "A dyad is a living partial structure.",
      },
    });
    expect(constellationRecordSchema.safeParse(dyad).success).toBe(true);
  });

  it("rejects an unknown shape", () => {
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          metadata: {
            ...baseRecord().metadata,
            ql: { shape: "pentad" as never, qlPositions: [], resonanceTags: [] },
          },
        }),
      ).success,
    ).toBe(false);
  });
});

describe("assembly provenance", () => {
  it("accepts agent-parse and construct assemblies", () => {
    expect(
      constellationRecordSchema.safeParse(baseRecord()).success,
    ).toBe(true);
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          assembly: {
            source: "construct",
            rawSourceRefs: [DOC_PASSAGE],
            derivedAt: now,
          },
        }),
      ).success,
    ).toBe(true);
  });

  it("requires at least one passage-level raw source ref", () => {
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          assembly: {
            source: "agent_parse",
            parseKind: "ql",
            rawSourceRefs: [],
            derivedAt: now,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects an uncontrolled assembly source", () => {
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          assembly: {
            source: "system" as never,
            rawSourceRefs: [DOC_PASSAGE],
            derivedAt: now,
          },
        }),
      ).success,
    ).toBe(false);
  });
});

describe("curation events", () => {
  it("accepts controlled curation events and rejects uncontrolled ones", () => {
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          curationEvents: [
            { type: "encapsulate", at: now, detail: "nested into parent" },
          ],
        }),
      ).success,
    ).toBe(true);
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          curationEvents: [{ type: "delete" as never, at: now }],
        }),
      ).success,
    ).toBe(false);
  });
});

describe("encapsulation contract", () => {
  const edges: EncapsulationEdge[] = [
    { containerGraphNodeId: "a", memberGraphNodeId: "b", mode: "outgoing" },
    { containerGraphNodeId: "b", memberGraphNodeId: "c", mode: "outgoing" },
  ];

  it("allows recursion (nested constellations)", () => {
    expect(encapsulationCycle(edges, "c", "d")).toBeNull();
    expect(encapsulationCycle(edges, "b", "d")).toBeNull();
    expect(assertAcyclicEncapsulation(edges)).toBeNull();
  });

  it("prohibits a self-encapsulation", () => {
    expect(encapsulationCycle([], "a", "a")).toEqual(["a", "a"]);
    expect(
      assertAcyclicEncapsulation([
        { containerGraphNodeId: "a", memberGraphNodeId: "a", mode: "ingoing" },
      ]),
    ).toEqual(["a", "a"]);
  });

  it("prohibits a transitive self-encapsulation cycle", () => {
    // a → b → c already exists. Adding c → a would close a → b → c → a.
    const cycle = encapsulationCycle(edges, "c", "a");
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(["a", "b", "c", "a"]);
    expect(
      assertAcyclicEncapsulation([
        ...edges,
        { containerGraphNodeId: "c", memberGraphNodeId: "a", mode: "ingoing" },
      ]),
    ).toEqual(["a", "b", "c", "a"]);
  });

  it("prohibits a direct back-edge that closes a cycle", () => {
    // a → b exists. Adding b → a closes a → b → a.
    expect(
      encapsulationCycle(
        [{ containerGraphNodeId: "a", memberGraphNodeId: "b", mode: "outgoing" }],
        "b",
        "a",
      ),
    ).toEqual(["a", "b", "a"]);
  });

  it("allows a DAG regardless of insertion order", () => {
    // Same DAG, different order — still acyclic.
    const dag: EncapsulationEdge[] = [
      { containerGraphNodeId: "b", memberGraphNodeId: "c", mode: "outgoing" },
      { containerGraphNodeId: "a", memberGraphNodeId: "b", mode: "outgoing" },
    ];
    expect(assertAcyclicEncapsulation(dag)).toBeNull();
  });
});

describe("constellation record cross-check", () => {
  it("round-trips a real episode constellation from a chat log", () => {
    const episode: ConstellationRecord = {
      id: UUID_2,
      profileScope: "bootstrapping",
      kind: "episode",
      title: "Episode 0.1 — the naked face",
      slug: "ep-0-1-naked-face",
      parentConstellationId: null,
      metadata: {
        time: { start: "2025-01-01", end: "2025-12-31" },
        placeId: null,
        ql: null,
        fileRefs: [
          {
            path: "antichrist-vault/episodes/1/ep-0.1-(now-ep-1.0)/Chat-Log-ep-0.1.md",
            kind: "chat",
            passageRefs: [CHAT_PASSAGE],
          },
        ],
        content: "QL reading of the event the chat carries.",
      },
      assembly: {
        source: "agent_parse",
        parseKind: "ql",
        agentSessionId: "research-canvas-a7f3",
        rawSourceRefs: [CHAT_PASSAGE],
        derivedAt: now,
      },
      curationEvents: [],
      seedKey: "chat-log-0.1:episode",
      createdAt: now,
      updatedAt: now,
    };
    expect(constellationRecordSchema.safeParse(episode).success).toBe(true);
  });

  it("rejects an inverted constellation time window", () => {
    expect(
      constellationRecordSchema.safeParse(
        baseRecord({
          metadata: {
            ...baseRecord().metadata,
            time: { start: "1945-09-02", end: "1945-05-08" },
          },
        }),
      ).success,
    ).toBe(false);
  });
});
