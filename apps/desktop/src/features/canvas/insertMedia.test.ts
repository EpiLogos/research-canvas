import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ContentLinkingActions } from "@research-canvas/canvas";

import { pickAndInsertImage, pickAndAttachFile } from "./insertMedia";

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
}));

function makeActions(): ContentLinkingActions {
  return {
    addTextToNode: vi.fn(),
    addImageToNode: vi.fn().mockResolvedValue({ graphNodeId: "n1" }),
    attachFileToNode: vi.fn().mockResolvedValue({ graphNodeId: "n1" }),
    linkMarkdownFileToNode: vi.fn(),
    linkNodes: vi.fn(),
  } as unknown as ContentLinkingActions;
}

beforeEach(() => {
  openMock.mockReset();
});

describe("pickAndInsertImage", () => {
  it("opens an image-filtered native dialog and imports the picked absolute path", async () => {
    openMock.mockResolvedValueOnce("/Users/me/Pictures/cat.png");
    const actions = makeActions();

    const result = await pickAndInsertImage("n1", actions);

    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        filters: [
          expect.objectContaining({
            name: "Images",
            extensions: expect.arrayContaining(["png", "jpg", "jpeg", "gif", "webp", "svg"]),
          }),
        ],
      }),
    );
    expect(actions.addImageToNode).toHaveBeenCalledWith("n1", "/Users/me/Pictures/cat.png");
    expect(result).toEqual({ ok: true });
  });

  it("is a no-op when the user cancels the dialog", async () => {
    openMock.mockResolvedValueOnce(null);
    const actions = makeActions();

    const result = await pickAndInsertImage("n1", actions);

    expect(actions.addImageToNode).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("surfaces a failure instead of throwing when the import rejects", async () => {
    openMock.mockResolvedValueOnce("/Users/me/Pictures/cat.png");
    const actions = makeActions();
    (actions.addImageToNode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("copy failed"),
    );

    const result = await pickAndInsertImage("n1", actions);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/copy failed/i);
  });
});

describe("pickAndAttachFile", () => {
  it("opens an unfiltered native dialog and attaches the picked absolute path", async () => {
    openMock.mockResolvedValueOnce("/Users/me/Documents/notes.pdf");
    const actions = makeActions();

    const result = await pickAndAttachFile("n1", actions);

    expect(openMock).toHaveBeenCalledWith(expect.objectContaining({ multiple: false }));
    expect(actions.attachFileToNode).toHaveBeenCalledWith(
      "n1",
      "/Users/me/Documents/notes.pdf",
      "notes.pdf",
    );
    expect(result).toEqual({ ok: true });
  });

  it("is a no-op when the user cancels the dialog", async () => {
    openMock.mockResolvedValueOnce(null);
    const actions = makeActions();

    const result = await pickAndAttachFile("n1", actions);

    expect(actions.attachFileToNode).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("surfaces a failure instead of throwing when the dialog itself throws", async () => {
    openMock.mockRejectedValueOnce(new Error("dialog unavailable"));
    const actions = makeActions();

    const result = await pickAndAttachFile("n1", actions);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/dialog unavailable/i);
    expect(actions.attachFileToNode).not.toHaveBeenCalled();
  });
});
