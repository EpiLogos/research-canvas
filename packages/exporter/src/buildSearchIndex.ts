import type { ExportBundle } from "@research-canvas/schema";

import { buildExportManifest } from "./manifest";

export interface SearchIndexEntry {
  id: string;
  title: string;
  kind: string;
  href: string;
  content: string;
}

export function buildSearchIndex(bundle: ExportBundle): SearchIndexEntry[] {
  const manifest = buildExportManifest(bundle);
  const entries: SearchIndexEntry[] = [];

  entries.push({
    content: [manifest.project.displayName, manifest.project.summary]
      .filter(Boolean)
      .join("\n"),
    href: "index.html",
    id: manifest.project.id,
    kind: "project",
    title: manifest.project.displayName
  });

  for (const node of manifest.nodes) {
    const href = `nodes/${nodePageSlug(manifest, node.id)}.html`;
    const content = buildNodeSearchContent(node);
    entries.push({
      content,
      href,
      id: node.id,
      kind: node.type,
      title: node.title
    });
  }

  for (const sequence of manifest.sequences) {
    const href = sequencePageHref(manifest, sequence.id);
    entries.push({
      content: [sequence.name, sequence.description]
        .filter(Boolean)
        .join("\n"),
      href,
      id: sequence.id,
      kind: "sequence",
      title: sequence.name
    });
  }

  for (const asset of manifest.assets) {
    entries.push({
      content: [asset.downloadName, asset.relativePath, asset.mimeType]
        .filter(Boolean)
        .join("\n"),
      href: `assets/${asset.downloadName}`,
      id: asset.nodeId,
      kind: "asset",
      title: asset.downloadName
    });
  }

  return entries;
}

function buildNodeSearchContent(node: ExportBundle["nodes"][number]) {
  const sections = [node.title, node.summary];

  if (node.type === "note") {
    sections.push(node.content);
    sections.push((node.tags ?? []).join(" "));
  }

  if (node.type === "resource") {
    sections.push(node.relativePath);
    sections.push(node.resourceKind);
    sections.push(node.mimeType);
  }

  return sections.filter(Boolean).join("\n");
}

function nodePageSlug(manifest: ReturnType<typeof buildExportManifest>, nodeId: string) {
  const page = manifest.nodePages.find((entry) => entry.nodeId === nodeId);
  if (!page) {
    return nodeId;
  }

  return page.slug;
}

function sequencePageHref(
  manifest: ReturnType<typeof buildExportManifest>,
  sequenceId: string
) {
  const page = manifest.sequencePages.find((entry) => entry.sequenceId === sequenceId);
  if (!page) {
    return `sequences/${sequenceId}.html`;
  }

  return page.href;
}
