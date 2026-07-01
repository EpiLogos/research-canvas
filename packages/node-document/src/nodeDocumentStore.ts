import { createStore, type StoreApi } from "zustand/vanilla";

import { blockNoteSummary } from "./summary";
import { normaliseBlockNoteBody } from "./body";

export interface NodeDocumentState {
  graphNodeId: string;
  body: string;
  savedBody: string;
  status: "idle" | "dirty" | "saving" | "error";
  errorMessage: string | null;
  setBody(next: string): void;
  flushNow(): Promise<void>;
  /**
   * Crash-safe final flush for the close/unload path (WS1 robustness bar).
   * Cancels any pending debounce, writes the dirty body immediately, and reports
   * the outcome: resolves true when clean or durably saved; resolves false AND
   * sets status="error" with a non-null errorMessage (never a silent return) when
   * the final write fails, retaining the dirty body for retry.
   */
  flushOnClose(): Promise<boolean>;
}

export type NodeDocumentStore = StoreApi<NodeDocumentState>;

export interface CreateNodeDocumentStoreInput {
  graphNodeId: string;
  initialBody: string;
  flush: (body: string, summary: string) => Promise<void>;
  debounceMs?: number;
}

export function createNodeDocumentStore(
  input: CreateNodeDocumentStoreInput
): NodeDocumentStore {
  const debounceMs = input.debounceMs ?? 400;
  const initial = normaliseBlockNoteBody(input.initialBody);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let queued = false;

  const store = createStore<NodeDocumentState>((set, get) => {
    const runFlush = async (): Promise<void> => {
      const { body, savedBody } = get();
      if (body === savedBody) {
        return;
      }
      if (flushing) {
        queued = true;
        return;
      }
      flushing = true;
      set({ status: "saving" });
      const toSave = body;
      try {
        await input.flush(toSave, blockNoteSummary(toSave));
        set({ savedBody: toSave, status: "idle", errorMessage: null });
      } catch (error) {
        set({
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "failed to save node document",
        });
      } finally {
        flushing = false;
        if (queued) {
          queued = false;
          await runFlush();
        }
      }
    };

    return {
      graphNodeId: input.graphNodeId,
      body: initial,
      savedBody: initial,
      status: "idle",
      errorMessage: null,
      setBody(next: string) {
        const normalised = normaliseBlockNoteBody(next);
        if (normalised === get().body) {
          return;
        }
        set({ body: normalised, status: "dirty" });
        if (timer !== null) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          timer = null;
          void runFlush();
        }, debounceMs);
      },
      async flushNow() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        await runFlush();
      },
      async flushOnClose() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (get().body === get().savedBody) {
          return true;
        }
        await runFlush();
        // runFlush surfaces failures via status/errorMessage (never swallows).
        // Report durability honestly: true only if the body is now saved.
        return get().status !== "error" && get().body === get().savedBody;
      },
    };
  });

  return store;
}
