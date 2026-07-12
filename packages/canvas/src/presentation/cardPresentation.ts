import type { CanvasNode, GraphNodeContract } from "@research-canvas/schema";

export type KnowledgePaletteId =
  | "historical-event"
  | "claim"
  | "interpretation"
  | "archetype"
  | "myth-in-time"
  | "myth"
  | "speculation-contested"
  | "source"
  | "book-writing"
  | "constellation"
  | "institution-network-figure";

export interface KnowledgePalette {
  id: KnowledgePaletteId;
  label: string;
  accent: string;
  surface: string;
  text: string;
}

export interface KnowledgeCardPresentation {
  title: string;
  pith: string;
  tags: string[];
  badges: string[];
  coverUrl: string | undefined;
  palette: KnowledgePalette;
}

export type CardPresentationInput = Pick<
  CanvasNode,
  "title" | "summary" | "dotColour" | "bgColour" | "textColour" | "thumbnail"
>;

const PALETTES: Record<KnowledgePaletteId, Omit<KnowledgePalette, "id">> = {
  "historical-event": { label: "Historical event", accent: "#79c0d4", surface: "#102633", text: "#e6f6fb" },
  claim: { label: "Claim", accent: "#e0b86f", surface: "#302817", text: "#fff1cc" },
  interpretation: { label: "Interpretation", accent: "#cf91c7", surface: "#2b1d2a", text: "#ffeaff" },
  archetype: { label: "Archetype", accent: "#d0a24a", surface: "#2d2414", text: "#fff2cb" },
  "myth-in-time": { label: "Myth in time", accent: "#b98cff", surface: "#281f35", text: "#f2e7ff" },
  myth: { label: "Myth", accent: "#a994d6", surface: "#241f31", text: "#eee8ff" },
  "speculation-contested": { label: "Contested / speculative", accent: "#e07a6f", surface: "#321b1b", text: "#ffe4df" },
  source: { label: "Source", accent: "#5fb8a0", surface: "#102a24", text: "#defaf0" },
  "book-writing": { label: "Book / writing", accent: "#b9a784", surface: "#29251d", text: "#f5ecd9" },
  constellation: { label: "Constellation", accent: "#8fd3ff", surface: "#102436", text: "#e4f6ff" },
  "institution-network-figure": { label: "Institution / network / figure", accent: "#9aa6b8", surface: "#1b2430", text: "#e9edf4" },
};

/**
 * Resolves the tiny amount of information a card may disclose.  Graph
 * substance is canonical; CanvasNode contributes only view-local layout and
 * appearance overrides.  In particular, raw note content is never a card
 * headline or pith.
 */
export function resolveKnowledgeCardPresentation(
  node: CardPresentationInput,
  graphNode: GraphNodeContract | null | undefined,
): KnowledgeCardPresentation {
  const paletteId = derivePalette(graphNode);
  const basePalette: KnowledgePalette = { id: paletteId, ...PALETTES[paletteId] };
  const palette: KnowledgePalette = {
    ...basePalette,
    accent: node.dotColour ?? basePalette.accent,
    surface: node.bgColour ?? basePalette.surface,
    text: node.textColour ?? basePalette.text,
  };
  const title = graphNode?.title.trim() || node.title?.trim() || "Untitled";
  const pith = graphNode?.summary.trim() || node.summary?.trim() || "";
  const tags = graphNode?.evidenceTags.slice(0, 2) ?? [];

  return {
    title,
    pith,
    tags,
    badges: badgeList(graphNode),
    coverUrl: node.thumbnail,
    palette,
  };
}

export function knowledgePaletteForGraphNode(graphNode: GraphNodeContract): KnowledgePalette {
  const id = derivePalette(graphNode);
  return { id, ...PALETTES[id] };
}

function derivePalette(node: GraphNodeContract | null | undefined): KnowledgePaletteId {
  if (!node) return "book-writing";
  if (["hypothesis", "allegation"].includes(node.claimKind ?? "")
    || ["contested", "alleged", "unverified"].includes(node.evidenceStatus ?? "")) return "speculation-contested";
  if (node.entityType === "Source") return "source";
  if (node.entityType === "Claim") return "claim";
  if (node.entityType === "Interpretation") return "interpretation";
  if (node.entityType === "Myth" && node.historicity === "mythic" && node.temporalRole === "myth_located_at") return "myth-in-time";
  if (node.entityType === "Myth") return "myth";
  if (node.entityType === "Work") return "book-writing";
  if (node.entityType === "Constellation") return "constellation";
  if (["Archetype", "Dynamic", "PsychoidOperator"].includes(node.entityType)) return "archetype";
  if (["Institution", "Figure", "People"].includes(node.entityType)) return "institution-network-figure";
  return "historical-event";
}

function badgeList(node: GraphNodeContract | null | undefined): string[] {
  if (!node) return [];
  const badges: string[] = [];
  if (node.historicity === "historical") badges.push("Historical");
  if (node.evidenceStatus === "documented") badges.push("Documented");
  if (node.evidenceStatus === "contested") badges.push("Contested");
  if (node.claimKind) badges.push(titleCase(node.claimKind));
  if (node.validFrom) badges.push(node.validFrom.slice(0, 4));
  for (const tag of node.evidenceTags.filter((tag) => tag.startsWith("place:"))) {
    badges.push(formatGeographicTag(tag));
  }
  if (node.placeCoverage === "resolved") badges.push("Place resolved");
  if (node.qlUnitId) badges.push(`QL ${node.qlUnitId}`);
  return Array.from(new Set(badges));
}

function formatGeographicTag(tag: string): string {
  return tag
    .slice("place:".length)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
