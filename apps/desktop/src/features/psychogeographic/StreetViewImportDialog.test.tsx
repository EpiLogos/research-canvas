import { afterEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { WorkspaceServices } from "@research-canvas/desktop-api";

import { StreetViewImportDialog } from "./StreetViewImportDialog";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function makeTransport() {
  const calls = {
    stage: [] as unknown[],
    register: [] as unknown[],
    redact: [] as unknown[],
    noneNeeded: [] as unknown[],
  };
  const transport = {
    async stageStreetViewImage(input: unknown) {
      calls.stage.push(input);
      return { artifactPath: "street-view/migration/crossing.png" };
    },
    async registerStreetViewImage(input: unknown) {
      calls.register.push(input);
      return { ...(input as { image: object }).image, id: "sv-1" };
    },
    async applyStreetViewRedaction(input: unknown) {
      calls.redact.push(input);
      return { id: "sv-1", redactionStatus: "redacted" };
    },
    async markStreetViewRedactionNoneNeeded(input: unknown) {
      calls.noneNeeded.push(input);
      return { id: "sv-1", redactionStatus: "none_needed" };
    },
  } as unknown as WorkspaceServices;
  return { transport, calls };
}

function file(name = "crossing.png", type = "image/png"): File {
  return new File([PNG_BYTES], name, { type });
}

function stubFrameRect() {
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect);
  return rect;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StreetViewImportDialog", () => {
  test("stages, registers, and redacts a real capture with drawn regions", async () => {
    const { transport, calls } = makeTransport();
    const onImported = vi.fn();
    const onClose = vi.fn();
    stubFrameRect();
    render(
      <StreetViewImportDialog
        transport={transport}
        databasePath="/tmp/ws.sqlite"
        mediaRoot="/tmp/ws"
        profileScope="migration"
        onClose={onClose}
        onImported={onImported}
      />,
    );

    fireEvent.change(screen.getByTestId("street-view-file-input"), {
      target: { files: [file()] },
    });
    expect(screen.getByTestId("street-view-continue")).toBeEnabled();
    fireEvent.click(screen.getByTestId("street-view-continue"));
    expect(screen.getByTestId("street-view-region-frame")).toBeInTheDocument();

    const frame = screen.getByTestId("street-view-region-frame");
    fireEvent.pointerDown(frame, { clientX: 20, clientY: 20 });
    fireEvent.pointerMove(frame, { clientX: 80, clientY: 60 });
    fireEvent.pointerUp(frame, { clientX: 80, clientY: 60 });
    expect(screen.getByTestId("street-view-region-list")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("street-view-run-redaction"));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });
    expect(calls.stage).toHaveLength(1);
    expect(calls.register).toHaveLength(1);
    expect(calls.redact).toHaveLength(1);
    expect(calls.noneNeeded).toHaveLength(0);

    const staged = calls.stage[0] as { fileName: string; bytes: Uint8Array };
    expect(staged.fileName).toBe("crossing.png");
    expect(staged.bytes).toEqual(PNG_BYTES);

    const registered = calls.register[0] as {
      mediaRoot: string;
      image: { artifactPath: string; latitude: number | null; redactionRegions: unknown[] };
    };
    expect(registered.mediaRoot).toBe("/tmp/ws");
    expect(registered.image.artifactPath).toBe("street-view/migration/crossing.png");
    expect(registered.image.latitude).toBeNull();
    expect(registered.image.redactionRegions).toHaveLength(1);
    const region = registered.image.redactionRegions[0] as {
      x: number;
      y: number;
      width: number;
      height: number;
      reason: string;
      source: string;
    };
    expect(region.x).toBeCloseTo(0.1, 5);
    expect(region.y).toBeCloseTo(0.1, 5);
    expect(region.width).toBeCloseTo(0.3, 5);
    expect(region.height).toBeCloseTo(0.2, 5);
    expect(region.reason).toBe("face");
    expect(region.source).toBe("manual");
  });

  test("honours the no-redaction-needed path and skips the redaction pipeline", async () => {
    const { transport, calls } = makeTransport();
    const onImported = vi.fn();
    render(
      <StreetViewImportDialog
        transport={transport}
        databasePath="/tmp/ws.sqlite"
        mediaRoot="/tmp/ws"
        profileScope="migration"
        onClose={vi.fn()}
        onImported={onImported}
      />,
    );

    fireEvent.change(screen.getByTestId("street-view-file-input"), {
      target: { files: [file("square.jpg", "image/jpeg")] },
    });
    fireEvent.click(screen.getByTestId("street-view-continue"));
    fireEvent.click(screen.getByTestId("street-view-none-needed"));
    fireEvent.click(screen.getByTestId("street-view-run-redaction"));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });
    expect(calls.register).toHaveLength(1);
    expect(calls.noneNeeded).toHaveLength(1);
    expect(calls.redact).toHaveLength(0);
  });

  test("rejects a non-image file and stays on the select step", async () => {
    const { transport } = makeTransport();
    render(
      <StreetViewImportDialog
        transport={transport}
        databasePath="/tmp/ws.sqlite"
        mediaRoot="/tmp/ws"
        profileScope="migration"
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("street-view-file-input"), {
      target: { files: [file("notes.txt", "text/plain")] },
    });
    expect(screen.getByTestId("street-view-import-error")).toHaveTextContent(
      "Choose a PNG or JPEG image.",
    );
    expect(screen.getByTestId("street-view-continue")).toBeDisabled();
  });

  test("surfaces transport failures in the dialog", async () => {
    const transport = {
      async stageStreetViewImage() {
        throw new Error("media root is not writable");
      },
    } as unknown as WorkspaceServices;
    render(
      <StreetViewImportDialog
        transport={transport}
        databasePath="/tmp/ws.sqlite"
        mediaRoot="/tmp/ws"
        profileScope="migration"
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("street-view-file-input"), {
      target: { files: [file()] },
    });
    fireEvent.click(screen.getByTestId("street-view-continue"));
    fireEvent.click(screen.getByTestId("street-view-run-redaction"));

    await waitFor(() => {
      expect(screen.getByTestId("street-view-import-error")).toHaveTextContent(
        "media root is not writable",
      );
    });
  });
});
