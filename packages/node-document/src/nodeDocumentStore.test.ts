import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNodeDocumentStore } from "./nodeDocumentStore";

const POPULATED = '[{"type":"paragraph","content":[{"type":"text","text":"Hi"}]}]';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createNodeDocumentStore", () => {
  it("starts idle with the normalised initial body", () => {
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "",
      flush: async () => {},
    });
    const state = store.getState();
    expect(state.body).toBe("[]");
    expect(state.savedBody).toBe("[]");
    expect(state.status).toBe("idle");
    expect(state.errorMessage).toBeNull();
  });

  it("marks dirty immediately on setBody and flushes after the debounce", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    expect(store.getState().status).toBe("dirty");
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(POPULATED, "Hi");
    expect(store.getState().status).toBe("idle");
    expect(store.getState().savedBody).toBe(POPULATED);
  });

  it("debounces rapid edits into a single flush", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody('[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]');
    await vi.advanceTimersByTimeAsync(100);
    store.getState().setBody('[{"type":"paragraph","content":[{"type":"text","text":"ab"}]}]');
    await vi.advanceTimersByTimeAsync(400);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(
      '[{"type":"paragraph","content":[{"type":"text","text":"ab"}]}]',
      "ab"
    );
  });

  it("surfaces flush errors instead of swallowing them and retains the dirty body for retry", async () => {
    const flush = vi.fn().mockRejectedValue(new Error("neo4j unreachable"));
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    await vi.advanceTimersByTimeAsync(400);

    expect(store.getState().status).toBe("error");
    expect(store.getState().errorMessage).toBe("neo4j unreachable");
    // savedBody is NOT advanced on failure (the last-known-good remains "[]")...
    expect(store.getState().savedBody).toBe("[]");
    // ...and the dirty body is retained (NOT lost) so the next edit / flushNow can retry it.
    expect(store.getState().body).toBe(POPULATED);
  });

  it("retries the retained dirty body via flushNow after a failure, then surfaces success", async () => {
    const flush = vi
      .fn()
      .mockRejectedValueOnce(new Error("neo4j unreachable"))
      .mockResolvedValueOnce(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    await vi.advanceTimersByTimeAsync(400);
    expect(store.getState().status).toBe("error");

    // The retained dirty body is still flushable — flushNow retries it (savedBody !== body).
    await store.getState().flushNow();

    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith(POPULATED, "Hi");
    expect(store.getState().status).toBe("idle");
    expect(store.getState().errorMessage).toBeNull();
    expect(store.getState().savedBody).toBe(POPULATED);
  });

  it("flushNow flushes immediately and is a no-op when not dirty", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    await store.getState().flushNow();
    expect(flush).not.toHaveBeenCalled();

    store.getState().setBody(POPULATED);
    await store.getState().flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe("idle");
    expect(store.getState().savedBody).toBe(POPULATED);
  });
});

describe("flushOnClose", () => {
  it("returns true and is a no-op when nothing is dirty", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    await expect(store.getState().flushOnClose()).resolves.toBe(true);
    expect(flush).not.toHaveBeenCalled();
  });

  it("forces a final write of the dirty body before the debounce fires and returns true", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    // Close arrives BEFORE the 400ms debounce would have flushed — the pending
    // timer must be cancelled and the body written immediately (crash-safe flush).
    await expect(store.getState().flushOnClose()).resolves.toBe(true);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(POPULATED, "Hi");
    expect(store.getState().status).toBe("idle");
    expect(store.getState().savedBody).toBe(POPULATED);
  });

  it("returns false and surfaces the error (does not swallow) when the final write fails", async () => {
    const flush = vi.fn().mockRejectedValue(new Error("disk full on close"));
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    await expect(store.getState().flushOnClose()).resolves.toBe(false);

    expect(store.getState().status).toBe("error");
    expect(store.getState().errorMessage).toBe("disk full on close");
    // The dirty body survives the failed close so it can be retried.
    expect(store.getState().body).toBe(POPULATED);
    expect(store.getState().savedBody).toBe("[]");
  });
});
