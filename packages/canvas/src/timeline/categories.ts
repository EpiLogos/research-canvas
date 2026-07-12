import type { GraphNode } from "./contracts";

export type TimelineCategory =
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

export interface TimelineCategoryDefinition {
  id: TimelineCategory;
  label: string;
  color: string;
  background: string;
}

export const TIMELINE_CATEGORIES: readonly TimelineCategoryDefinition[] = [
  { id: "historical-event", label: "Historical event", color: "#79c0d4", background: "#102633" },
  { id: "claim", label: "Claim", color: "#e0b86f", background: "#302817" },
  { id: "interpretation", label: "Interpretation", color: "#cf91c7", background: "#2b1d2a" },
  { id: "archetype", label: "Archetype", color: "#d0a24a", background: "#2d2414" },
  { id: "myth-in-time", label: "Myth in time", color: "#b98cff", background: "#281f35" },
  { id: "myth", label: "Myth", color: "#a994d6", background: "#241f31" },
  { id: "speculation-contested", label: "Speculation / contested", color: "#e07a6f", background: "#321b1b" },
  { id: "source", label: "Source", color: "#5fb8a0", background: "#102a24" },
  { id: "book-writing", label: "Book / writing", color: "#b9a784", background: "#29251d" },
  { id: "constellation", label: "Constellation", color: "#8fd3ff", background: "#102436" },
  { id: "institution-network-figure", label: "Institution / network / figure", color: "#9aa6b8", background: "#1b2430" },
] as const;

export function categoryDefinition(category: TimelineCategory): TimelineCategoryDefinition {
  return TIMELINE_CATEGORIES.find((definition) => definition.id === category) ?? TIMELINE_CATEGORIES[0];
}

export function deriveTimelineCategory(node: GraphNode): TimelineCategory {
  if (node.entityType === "Source") return "source";
  if (node.entityType === "Claim") return "claim";
  if (node.entityType === "Interpretation") return "interpretation";
  if (
    node.entityType === "Myth" &&
    node.historicity === "mythic" &&
    node.temporalRole === "myth_located_at"
  ) return "myth-in-time";
  if (node.entityType === "Myth") return "myth";
  if (node.entityType === "Work") return "book-writing";
  if (node.entityType === "Constellation") return "constellation";
  if (
    node.entityType === "Archetype" ||
    node.entityType === "Dynamic" ||
    node.entityType === "PsychoidOperator"
  ) {
    return "archetype";
  }
  if (
    node.claimKind === "hypothesis" ||
    node.claimKind === "allegation" ||
    node.evidenceStatus === "contested" ||
    node.evidenceStatus === "alleged" ||
    node.evidenceStatus === "unverified"
  ) return "speculation-contested";
  if (node.entityType === "Institution" || node.entityType === "Figure" || node.entityType === "People") {
    return "institution-network-figure";
  }
  return "historical-event";
}
