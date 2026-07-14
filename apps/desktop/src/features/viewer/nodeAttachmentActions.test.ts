import { describe, expect, it, vi } from "vitest";
import type { GraphNode } from "@research-canvas/desktop-api";

import { attachNodeMedia } from "./nodeAttachmentActions";

function graphNode(): GraphNode {
  return {
    graphNodeId: "n-cover",
    title: "A record",
    summary: "Pith",
    body: "[]",
    contentOrigin: "seed",
    contentRevision: 4,
    bodySourceCoordinates: ["episodes/2.md#record"],
    entityType: "Event",
    seedSchemaVersion: 1,
  } as unknown as GraphNode;
}

describe("attachNodeMedia", () => {
  it("does not CAS an unchanged document when selecting a durable cover", async () => {
    const remote = graphNode();
    const compareAndSwapGraphNodeContent = vi.fn();
    const acknowledgeLocalNodeDocumentSync = vi.fn();
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(remote),
      attachNodeAttachment: vi.fn().mockResolvedValue({
        attachment: {
          id: "cover-1", graphNodeId: "n-cover", managedPath: "assets/attachments/hash/cover.png",
          originalFilename: "cover.png", mimeType: "image/png", kind: "image", contentHash: "hash",
          caption: "", role: "cover", provenanceSourcePath: "/vault/cover.png", createdAt: "", updatedAt: "",
        },
        document: {
          graphNodeId: "n-cover", body: remote.body, summary: remote.summary, neo4jSynced: true,
          contentOrigin: "seed", contentRevision: 4, bodySourceCoordinates: remote.bodySourceCoordinates,
        },
        expectedRemoteOrigin: "seed",
        expectedRemoteRevision: 4,
      }),
      compareAndSwapGraphNodeContent,
      acknowledgeLocalNodeDocumentSync,
    };

    const result = await attachNodeMedia({
      transport,
      databasePath: "/workspace/research-canvas.sqlite",
      workspaceRoot: "/workspace",
      graphNodeId: "n-cover",
      sourceAbsolutePath: "/vault/cover.png",
      kind: "image",
      role: "cover",
    });

    expect(result.remoteSynced).toBe(true);
    expect(compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
    expect(acknowledgeLocalNodeDocumentSync).not.toHaveBeenCalled();
  });
});
