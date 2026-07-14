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
        remoteSyncEligible: true,
        graphNode: remote,
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

  it("keeps unrelated pending prose pending when a cover is selected", async () => {
    const remote = graphNode();
    const pendingBody = JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "Unpublished local prose" }] },
    ]);
    const compareAndSwapGraphNodeContent = vi.fn().mockResolvedValue({ kind: "updated" });
    const acknowledgeLocalNodeDocumentSync = vi.fn().mockResolvedValue({ kind: "updated" });
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(remote),
      attachNodeAttachment: vi.fn().mockResolvedValue({
        attachment: {
          id: "cover-pending", graphNodeId: "n-cover", managedPath: "assets/attachments/hash/pending-cover.png",
          originalFilename: "pending-cover.png", mimeType: "image/png", kind: "image", contentHash: "hash",
          caption: "", role: "cover", provenanceSourcePath: "/vault/pending-cover.png", createdAt: "", updatedAt: "",
        },
        // This is the real native cover result shape when an earlier inline
        // edit remains unsynced: cover selection preserves the durable local
        // document rather than replacing it with the remote snapshot.
        document: {
          graphNodeId: "n-cover", body: pendingBody, summary: "Local pith", neo4jSynced: false,
          contentOrigin: "user_authored", contentRevision: 5, bodySourceCoordinates: ["local#draft"],
        },
        expectedRemoteOrigin: "seed",
        expectedRemoteRevision: 4,
        remoteSyncEligible: false,
        graphNode: {
          ...remote,
          body: pendingBody,
          summary: "Local pith",
          contentOrigin: "user_authored",
          contentRevision: 5,
          bodySourceCoordinates: ["local#draft"],
        },
      }),
      compareAndSwapGraphNodeContent,
      acknowledgeLocalNodeDocumentSync,
    };

    const result = await attachNodeMedia({
      transport,
      databasePath: "/workspace/research-canvas.sqlite",
      workspaceRoot: "/workspace",
      graphNodeId: "n-cover",
      sourceAbsolutePath: "/vault/pending-cover.png",
      kind: "image",
      role: "cover",
    });

    expect(compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
    expect(acknowledgeLocalNodeDocumentSync).not.toHaveBeenCalled();
    expect(result.remoteSynced).toBe(false);
    expect(result.graphNode.body).toBe(pendingBody);
    expect(result.graphNode.contentRevision).toBe(5);
  });
});
