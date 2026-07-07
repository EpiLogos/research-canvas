/**
 * pendingGraphNodeSync.ts
 *
 * Local-first note/group/resource creation always succeeds immediately
 * (SQLite layout + local node document), even with Neo4j unreachable. The
 * best-effort `createGraphNode` call made at creation time may fail (Neo4j
 * down, network blip, etc.) — when it does, we record the node as "pending
 * sync" here rather than losing track of it, so that once Neo4j is reachable
 * again its substance node gets created without the user having to do
 * anything.
 *
 * Kept deliberately simple: a module-level pending set plus a retry pass
 * that re-attempts `createGraphNode` for everything still pending. Callers
 * trigger a retry pass opportunistically (e.g. after another transport call
 * succeeds) or on an interval — never blocking, never throwing.
 */

import type { NewGraphNodeInput } from "@research-canvas/desktop-api";

interface PendingEntry {
  input: NewGraphNodeInput & { graphNodeId: string };
}

const pending = new Map<string, PendingEntry>();

/** Record a graph node whose best-effort `createGraphNode` sync failed. */
export function markGraphNodeSyncPending(
  input: NewGraphNodeInput & { graphNodeId: string }
): void {
  pending.set(input.graphNodeId, { input });
}

/** Clear a graph node from the pending-sync set (e.g. once synced). */
export function clearGraphNodeSyncPending(graphNodeId: string): void {
  pending.delete(graphNodeId);
}

/** Whether a graph node is currently recorded as pending sync. Test hook. */
export function isGraphNodeSyncPending(graphNodeId: string): boolean {
  return pending.has(graphNodeId);
}

/** The number of nodes currently recorded as pending sync. Test hook. */
export function pendingGraphNodeSyncCount(): number {
  return pending.size;
}

/** Test-only: reset all pending state between test cases. */
export function resetPendingGraphNodeSync(): void {
  pending.clear();
}

/**
 * Re-attempt `createGraphNode` for every pending node. Best-effort: a node
 * that fails again stays pending for the next retry pass; a node that
 * succeeds is cleared. Never throws — callers can fire-and-forget this.
 */
export async function retryPendingGraphNodeSyncs(
  createGraphNode: (
    input: NewGraphNodeInput & { graphNodeId: string }
  ) => Promise<unknown>
): Promise<void> {
  const entries = Array.from(pending.values());
  for (const entry of entries) {
    try {
      await createGraphNode(entry.input);
      pending.delete(entry.input.graphNodeId);
    } catch (error) {
      console.warn(
        "retryPendingGraphNodeSyncs: createGraphNode still failing; node kept pending",
        entry.input.graphNodeId,
        error
      );
    }
  }
}
