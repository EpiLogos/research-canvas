import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type {
  GraphNode,
  TimelineView,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { GazetteerIndex } from "@research-canvas/geography";
import {
  geographyEdgeSchema,
  type GeographyEdge,
  type GeographyEdgeMode,
  type GeographyEdgeTimeWindow,
} from "@research-canvas/schema";
import { greatCircleArc, type LatLng } from "@research-canvas/canvas";

import { gazetteerEntryForPlace } from "./assembleWalk";

/**
 * Movement-stream corpus seed (refinement-2 D2, ticket #19): four real
 * geography edges — VOC Amsterdam→Banda (shipping), Rhodes's Oxford↔Kimberley
 * journeys (overland), Rudolf II's Vienna→Prague court move (overland), and
 * the Cult of Reason's intra-Paris events (overland loop). Every lane resolves
 * to a real located Place graph node and a real corpus passage; the seed
 * FAILS LOUDLY — naming the lane seedKey and the missing piece — if a place or
 * its coordinate cannot be resolved, so a movement stream is never seeded from
 * a phantom location. Seeding is idempotent per (profileScope, seedKey).
 */

export interface GeographyEdgeLane {
  seedKey: string;
  mode: GeographyEdgeMode;
  label: string;
  sourcePlaceTitle: string;
  targetPlaceTitle: string;
  timeWindow: GeographyEdgeTimeWindow;
  /** Non-great-circle routes pass exactly through these points. */
  controlPoints?: LatLng[];
  corpus: {
    /** Corpus-relative artifact path (same coordinate space as graph sources). */
    filePath: string;
    /** Sluggified markdown heading anchoring the passage span. */
    anchor: string;
  };
}

export const GEOGRAPHY_EDGE_LANES: GeographyEdgeLane[] = [
  {
    seedKey: "voc:amsterdam-to-banda",
    mode: "shipping",
    label: "VOC shipping lane Amsterdam → Banda",
    sourcePlaceTitle: "Amsterdam",
    targetPlaceTitle: "Banda Islands",
    timeWindow: { start: "1602-03-20", end: "1621-05-08" },
    corpus: {
      filePath:
        "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
      anchor: "the-banda-genocide-corporate-sovereignty-s-first-atrocity",
    },
  },
  {
    seedKey: "rhodes:oxford-to-kimberley",
    mode: "overland",
    label: "Rhodes's Oxford ↔ Kimberley shuttle",
    sourcePlaceTitle: "Oxford",
    targetPlaceTitle: "Kimberley",
    timeWindow: { start: "1873-10-13", end: "1881-01-01" },
    corpus: {
      filePath:
        "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report3.md",
      anchor: "oxford-ruskin-and-the-intellectual-architecture-of-supremacism",
    },
  },
  {
    seedKey: "rudolf-ii:vienna-to-prague",
    mode: "overland",
    label: "Rudolf II's court move Vienna → Prague",
    sourcePlaceTitle: "Vienna",
    targetPlaceTitle: "Prague",
    timeWindow: { start: "1583", end: "1583" },
    corpus: {
      filePath:
        "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
      anchor: "rudolf-ii-s-prague-where-alchemy-met-astronomy",
    },
  },
  {
    seedKey: "cult-of-reason:paris-loop",
    mode: "overland",
    label: "Cult of Reason intra-Paris events",
    sourcePlaceTitle: "Paris",
    targetPlaceTitle: "Paris",
    timeWindow: { start: "1793-11-10", end: "1794-06-08" },
    // A same-place lane needs a synthetic control-point loop so the LineString
    // is a real closed arc rather than a zero-length degenerate.
    controlPoints: [
      { latitude: 48.97, longitude: 2.3 },
      { latitude: 48.9, longitude: 2.55 },
      { latitude: 48.74, longitude: 2.4 },
    ],
    corpus: {
      filePath:
        "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
      anchor: "the-revolution-s-failed-experiments-with-manufactured-religion",
    },
  },
];

export interface GeographyEdgeSeedInput {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  /** Monorepo root; corpus source coordinates are relative to it. */
  corpusRoot: string;
  gazetteer: GazetteerIndex;
  /** Active project/namespace profile scope. Required; no fallback. */
  profileScope: string;
  /**
   * Injectable file reader so tests can read the real corpus with node:fs.
   * Defaults to the workspace transport's file reader.
   */
  readFile?: (absolutePath: string) => Promise<string>;
}

export interface GeographyEdgeSeedResult {
  seededCount: number;
  edges: GeographyEdge[];
}

export interface BuildGeographyEdgeDeps {
  view: TimelineView;
  gazetteer: GazetteerIndex;
  corpusRoot: string;
  profileScope: string;
  now: string;
  readFile: (absolutePath: string) => Promise<string>;
}

export async function ensureGeographyEdgeSeed(
  input: GeographyEdgeSeedInput,
): Promise<GeographyEdgeSeedResult> {
  const profileScope = input.profileScope?.trim();
  if (!profileScope) {
    throw new Error("ensureGeographyEdgeSeed requires a non-empty profileScope");
  }
  const readFile =
    input.readFile ?? ((absolutePath) => readWorkspaceTextFile(absolutePath));
  const existing = await input.transport.listGeographyEdges({
    databasePath: input.databasePath,
    profileScope,
  });
  const existingKeys = new Set(existing.map((edge) => edge.seedKey));
  const view = await input.transport.loadTimelineView({
    workspaceId: input.workspaceId,
  });
  const now = new Date().toISOString();

  const edges: GeographyEdge[] = [...existing];
  let seededCount = 0;
  for (const lane of GEOGRAPHY_EDGE_LANES) {
    if (existingKeys.has(lane.seedKey)) continue;
    const edge = await buildGeographyEdge(lane, {
      view,
      gazetteer: input.gazetteer,
      corpusRoot: input.corpusRoot,
      profileScope,
      now,
      readFile,
    });
    const saved = await input.transport.upsertGeographyEdge({
      databasePath: input.databasePath,
      edge,
    });
    edges.push(saved);
    seededCount += 1;
  }
  return { seededCount, edges };
}

/** Builds and schema-validates one lane, resolving the real graph places and
 * corpus passage. Throws with the lane's seedKey when anything is missing. */
export async function buildGeographyEdge(
  lane: GeographyEdgeLane,
  deps: BuildGeographyEdgeDeps,
): Promise<GeographyEdge> {
  const source = resolveLanePlace(deps.view, lane.sourcePlaceTitle, lane.seedKey);
  const target = resolveLanePlace(deps.view, lane.targetPlaceTitle, lane.seedKey);
  const sourceEntry = gazetteerEntryForPlace(deps.gazetteer, lane.sourcePlaceTitle);
  const targetEntry = gazetteerEntryForPlace(deps.gazetteer, lane.targetPlaceTitle);
  if (!sourceEntry || sourceEntry.latitude === undefined || sourceEntry.longitude === undefined) {
    throw new Error(
      `geography-edge seed "${lane.seedKey}": gazetteer has no point coordinate for source place "${lane.sourcePlaceTitle}"`,
    );
  }
  if (!targetEntry || targetEntry.latitude === undefined || targetEntry.longitude === undefined) {
    throw new Error(
      `geography-edge seed "${lane.seedKey}": gazetteer has no point coordinate for target place "${lane.targetPlaceTitle}"`,
    );
  }
  const from: LatLng = {
    latitude: sourceEntry.latitude,
    longitude: sourceEntry.longitude,
  };
  const to: LatLng = {
    latitude: targetEntry.latitude,
    longitude: targetEntry.longitude,
  };
  const coordinates = greatCircleArc(from, to, 64, lane.controlPoints ?? []);
  const passage = await corpusPassageForLane(
    lane.corpus,
    deps.corpusRoot,
    deps.readFile,
  ).catch((error: unknown) => {
    throw new Error(
      `geography-edge seed "${lane.seedKey}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });

  const edge: GeographyEdge = {
    // App-minted UUIDv4: `id` is the SQLite PRIMARY KEY, so it must be
    // globally unique. A per-profile deterministic id (`geo:{seedKey}`) would
    // collide across profiles — profile B's seed would silently UPDATE profile
    // A's lane (the id-based upsert path). Seeding idempotency is keyed on
    // (profileScope, seedKey), never on `id`.
    id: crypto.randomUUID(),
    profileScope: deps.profileScope,
    mode: lane.mode,
    sourcePlaceId: source.graphNodeId,
    targetPlaceId: target.graphNodeId,
    label: lane.label,
    timeWindow: lane.timeWindow,
    geometry: { type: "LineString", coordinates },
    provenance: { sourceRefs: [passage] },
    seedKey: lane.seedKey,
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  geographyEdgeSchema.parse(edge);
  return edge;
}

/** Resolves a Place graph node from the timeline view by exact title match.
 * Throws — the seed must fail loudly, never seed a phantom place. */
export function resolveLanePlace(
  view: TimelineView,
  title: string,
  seedKey?: string,
): GraphNode {
  const normalized = title.trim().toLowerCase();
  const record = view.nodes.find(({ node }) => {
    if (node.entityType !== "Place") return false;
    return node.title.trim().toLowerCase() === normalized;
  });
  if (!record) {
    throw new Error(
      `geography-edge seed ${seedKey ? `"${seedKey}" ` : ""}could not resolve a graph Place node titled "${title}"`,
    );
  }
  return record.node;
}

/** Builds a passage ref anchored at the corpus section documenting the lane,
 * with real character offsets measured from the file. Fails loudly when the
 * artifact file or section cannot be located. */
export async function corpusPassageForLane(
  corpus: GeographyEdgeLane["corpus"],
  corpusRoot: string,
  readFile: (absolutePath: string) => Promise<string>,
): Promise<{ artifactId: string; unit: { kind: "text_span"; startOffset: number; endOffset: number } }> {
  const absolutePath = `${corpusRoot.replace(/\/+$/, "")}/${corpus.filePath}`;
  const content = await readFile(absolutePath);
  const section = findSection(content, corpus.anchor);
  if (!section) {
    throw new Error(
      `geography-edge seed could not locate section "#${corpus.anchor}" in ${corpus.filePath}`,
    );
  }
  return {
    artifactId: corpus.filePath,
    unit: {
      kind: "text_span",
      startOffset: section.start,
      endOffset: section.end,
    },
  };
}

interface Section {
  start: number;
  end: number;
}

function findSection(content: string, anchor: string | null): Section | null {
  const headingIndex = anchor ? findSluggedHeading(content, anchor) : 0;
  // A lane always cites a heading. When the anchor is missing the corpus does
  // not document this movement — the seed must fail loudly, never silently
  // fall back to the first paragraph of the file.
  if (anchor && headingIndex < 0) return null;
  const searchStart = headingIndex >= 0 ? headingIndex : 0;
  const paragraphStart = content.indexOf("\n\n", searchStart);
  const start = paragraphStart >= 0 ? paragraphStart + 2 : Math.max(0, searchStart);
  const nextBreak = content.indexOf("\n\n", start);
  const end = nextBreak >= 0 ? nextBreak : content.length;
  return end > start ? { start, end } : null;
}

function findSluggedHeading(content: string, anchor: string): number {
  let offset = 0;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/^#+\s*/, "");
    if (slugify(line) === anchor) {
      return offset;
    }
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
