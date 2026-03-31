import type {
  CanvasNode,
  ExportAsset,
  ExportBundle,
  Sequence
} from "@research-canvas/schema";
import { exportBundleSchema } from "@research-canvas/schema";

export interface ExportManifest {
  generatedAt: string;
  project: ExportBundle["project"];
  canvases: ExportBundle["canvases"];
  nodes: ExportBundle["nodes"];
  edges: ExportBundle["edges"];
  sequences: ExportBundle["sequences"];
  sequenceSteps: ExportBundle["sequenceSteps"];
  annotations: ExportBundle["annotations"];
  assets: ExportAsset[];
  nodePages: ExportNodePage[];
  sequencePages: ExportSequencePage[];
}

export interface ExportNodePage {
  nodeId: string;
  slug: string;
  fileName: string;
  href: string;
  title: string;
  type: CanvasNode["type"];
}

export interface ExportSequencePage {
  sequenceId: string;
  slug: string;
  fileName: string;
  href: string;
  name: string;
}

export function buildExportManifest(bundle: ExportBundle): ExportManifest {
  const parsed = exportBundleSchema.parse(bundle);

  return {
    annotations: parsed.annotations,
    assets: parsed.assets,
    canvases: parsed.canvases,
    edges: parsed.edges,
    generatedAt: parsed.generatedAt,
    nodePages: buildNodePages(parsed.nodes),
    nodes: parsed.nodes,
    project: parsed.project,
    sequencePages: buildSequencePages(parsed.sequences),
    sequenceSteps: parsed.sequenceSteps,
    sequences: parsed.sequences
  };
}

function buildNodePages(nodes: CanvasNode[]): ExportNodePage[] {
  const usedSlugs = new Map<string, number>();

  return nodes.map((node) => {
    const baseSlug = slugify(
      node.type === "resource" ? node.relativePath : node.title
    );
    const slug = ensureUniqueSlug(baseSlug, usedSlugs);

    return {
      fileName: `${slug}.html`,
      href: `nodes/${slug}.html`,
      nodeId: node.id,
      slug,
      title: node.title,
      type: node.type
    };
  });
}

function buildSequencePages(sequences: Sequence[]): ExportSequencePage[] {
  const usedSlugs = new Map<string, number>();

  return sequences.map((sequence) => {
    const slug = ensureUniqueSlug(slugify(sequence.name), usedSlugs);
    return {
      fileName: `${slug}.html`,
      href: `sequences/${slug}.html`,
      name: sequence.name,
      sequenceId: sequence.id,
      slug
    };
  });
}

function ensureUniqueSlug(slug: string, usedSlugs: Map<string, number>) {
  const nextCount = usedSlugs.get(slug) ?? 0;
  usedSlugs.set(slug, nextCount + 1);
  return nextCount === 0 ? slug : `${slug}-${nextCount + 1}`;
}

export function slugify(value: string) {
  const fallback = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const collapsed = fallback.replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  return collapsed || "item";
}
