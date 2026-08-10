import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import type {
  TimelineView,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import { GazetteerIndex } from "@research-canvas/geography";
import type { GeographyEdge } from "@research-canvas/schema";
import { loadBundledGeographyPack } from "@research-canvas/canvas";

import { graphNode, timelineView } from "./walkFixture";
import {
  buildGeographyEdge,
  ensureGeographyEdgeSeed,
  GEOGRAPHY_EDGE_LANES,
} from "./seedGeographyEdges";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const REPORT_8 = path.join(
  REPO_ROOT,
  "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
);
const REPORT_3 = path.join(
  REPO_ROOT,
  "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report3.md",
);

const readRealCorpus = (absolutePath: string) =>
  fs.promises.readFile(absolutePath, "utf8");

function findHeadingOffset(content: string, anchor: string): number {
  let offset = 0;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/^#+\s*/, "");
    if (slugify(line) === anchor) return offset;
    offset += rawLine.length + 1;
  }
  return -1;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The real timeline view plus the movement-stream places the seed resolves. */
function movementView(): TimelineView {
  const base = timelineView();
  return {
    ...base,
    nodes: [
      ...base.nodes,
      {
        node: graphNode("root-archetypal-field:place-oxford", "Oxford", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode(
          "root-archetypal-field:place-kimberley",
          "Kimberley",
          "Place",
          {
            isTemporal: false,
            validFrom: null,
            validTo: null,
            temporalPrecision: null,
          },
        ),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("root-archetypal-field:place-vienna", "Vienna", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
    ],
  };
}

function transportFixture(view: TimelineView): {
  transport: WorkspaceTransport;
  savedEdges: GeographyEdge[];
} {
  const savedEdges: GeographyEdge[] = [];
  const transport = {
    async loadTimelineView() {
      return view;
    },
    async listGeographyEdges() {
      return savedEdges;
    },
    async upsertGeographyEdge({ edge }: { edge: GeographyEdge }) {
      const existing = savedEdges.findIndex((candidate) => candidate.id === edge.id);
      if (existing >= 0) savedEdges[existing] = edge;
      else savedEdges.push(edge);
      return edge;
    },
  } as unknown as WorkspaceTransport;
  return { transport, savedEdges };
}

describe("ensureGeographyEdgeSeed", () => {
  test("seeds all four real movement lanes against real places, gazetteer, and corpus", async () => {
    const { transport, savedEdges } = transportFixture(movementView());
    const pack = loadBundledGeographyPack();

    const result = await ensureGeographyEdgeSeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: REPO_ROOT,
      gazetteer: pack.gazetteer,
      profileScope: "bootstrapping",
      readFile: readRealCorpus,
    });

    expect(result.seededCount).toBe(4);
    expect(savedEdges).toHaveLength(4);

    for (const lane of GEOGRAPHY_EDGE_LANES) {
      const edge = savedEdges.find((candidate) => candidate.seedKey === lane.seedKey);
      expect(edge).toBeDefined();
      expect(edge?.profileScope).toBe("bootstrapping");
      expect(edge?.mode).toBe(lane.mode);
      expect(edge?.label).toBe(lane.label);
      expect(edge?.timeWindow).toEqual(lane.timeWindow);
      // Real graph node ids of Temporal Places.
      expect(edge?.sourcePlaceId).toContain("place-");
      expect(edge?.targetPlaceId).toContain("place-");
      // Geometry is a closed great-circle LineString with real WGS84 span.
      expect(edge?.geometry.type).toBe("LineString");
      expect(edge?.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      // Passage provenance points at the real corpus file.
      expect(edge?.provenance.sourceRefs).toHaveLength(1);
      const ref = edge?.provenance.sourceRefs[0];
      expect(ref?.artifactId).toBe(lane.corpus.filePath);
    }

    // The VOC arc is anchored at Amsterdam and terminates at the Banda Islands.
    const voc = savedEdges.find((edge) => edge.seedKey === "voc:amsterdam-to-banda");
    const first = voc?.geometry.coordinates[0];
    const last = voc?.geometry.coordinates[voc.geometry.coordinates.length - 1];
    expect(first?.[0]).toBeCloseTo(4.8936, 2);
    expect(first?.[1]).toBeCloseTo(52.3728, 2);
    expect(last?.[0]).toBeCloseTo(129.9, 1);
    expect(last?.[1]).toBeCloseTo(-4.55, 1);

    // The same-place Cult of Reason lane is a real control-point loop, not a
    // zero-length degenerate LineString.
    const paris = savedEdges.find((edge) => edge.seedKey === "cult-of-reason:paris-loop");
    expect(paris?.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(paris?.sourcePlaceId).toBe(paris?.targetPlaceId);
  });

  test("passage refs point at real corpus text that documents each lane", async () => {
    const { transport, savedEdges } = transportFixture(movementView());
    const pack = loadBundledGeographyPack();

    await ensureGeographyEdgeSeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: REPO_ROOT,
      gazetteer: pack.gazetteer,
      profileScope: "bootstrapping",
      readFile: readRealCorpus,
    });

    const report8 = await fs.promises.readFile(REPORT_8, "utf8");
    const report3 = await fs.promises.readFile(REPORT_3, "utf8");
    const contentByFile = new Map([
      [
        "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
        report8,
      ],
      [
        "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report3.md",
        report3,
      ],
    ]);

    for (const lane of GEOGRAPHY_EDGE_LANES) {
      const edge = savedEdges.find((candidate) => candidate.seedKey === lane.seedKey);
      const ref = edge?.provenance.sourceRefs[0];
      expect(ref).toBeDefined();
      if (ref?.unit.kind !== "text_span") continue;
      const content = contentByFile.get(ref.artifactId);
      if (!content) {
        throw new Error(`missing corpus content for ${ref.artifactId}`);
      }
      expect(ref.unit.endOffset).toBeGreaterThan(ref.unit.startOffset);
      // The measured span is the section body paragraph that immediately
      // follows the slugged heading the lane cites — a real, local span.
      const headingOffset = findHeadingOffset(content, lane.corpus.anchor);
      expect(headingOffset).toBeGreaterThanOrEqual(0);
      expect(ref.unit.startOffset).toBeGreaterThanOrEqual(headingOffset);
      expect(ref.unit.startOffset - headingOffset).toBeLessThan(300);
      expect(ref.unit.endOffset - ref.unit.startOffset).toBeGreaterThan(40);
    }
  });

  test("is idempotent: a second run never rewrites existing lanes", async () => {
    const { transport, savedEdges } = transportFixture(movementView());
    const pack = loadBundledGeographyPack();
    const input = {
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: REPO_ROOT,
      gazetteer: pack.gazetteer,
      profileScope: "bootstrapping",
      readFile: readRealCorpus,
    };

    const first = await ensureGeographyEdgeSeed(input);
    expect(first.seededCount).toBe(4);
    const afterFirst = savedEdges.map((edge) => ({ ...edge }));

    const second = await ensureGeographyEdgeSeed(input);
    expect(second.seededCount).toBe(0);
    expect(savedEdges).toEqual(afterFirst);
  });

  test("writes lanes into the active profile scope", async () => {
    const { transport, savedEdges } = transportFixture(movementView());
    const pack = loadBundledGeographyPack();

    await ensureGeographyEdgeSeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: REPO_ROOT,
      gazetteer: pack.gazetteer,
      profileScope: "project:alpha-field",
      readFile: readRealCorpus,
    });

    expect(savedEdges).toHaveLength(4);
    for (const edge of savedEdges) {
      expect(edge.profileScope).toBe("project:alpha-field");
    }
  });

  test("fails loudly when a lane's graph place is missing", async () => {
    // walkFixture alone has no Oxford/Kimberley/Vienna places.
    const pack = loadBundledGeographyPack();
    const rhodes = GEOGRAPHY_EDGE_LANES.find(
      (lane) => lane.seedKey === "rhodes:oxford-to-kimberley",
    );
    await expect(
      buildGeographyEdge(rhodes!, {
        view: timelineView(),
        gazetteer: pack.gazetteer,
        corpusRoot: REPO_ROOT,
        profileScope: "bootstrapping",
        now: new Date().toISOString(),
        readFile: readRealCorpus,
      }),
    ).rejects.toThrow("rhodes:oxford-to-kimberley");
  });

  test("fails loudly when the gazetteer cannot resolve a lane place", async () => {
    // A hand-picked index that has Oxford but not Kimberley.
    const sparse = GazetteerIndex.fromEntries([
      {
        id: "wikidata:Q152",
        source: "wikidata",
        names: [{ language: "en", name: "Oxford" }],
        latitude: 51.752,
        longitude: -1.2577,
        precision: "approximate",
      },
    ]);
    const rhodes = GEOGRAPHY_EDGE_LANES.find(
      (lane) => lane.seedKey === "rhodes:oxford-to-kimberley",
    );
    await expect(
      buildGeographyEdge(rhodes!, {
        view: movementView(),
        gazetteer: sparse,
        corpusRoot: REPO_ROOT,
        profileScope: "bootstrapping",
        now: new Date().toISOString(),
        readFile: readRealCorpus,
      }),
    ).rejects.toThrow("Kimberley");
  });
});
