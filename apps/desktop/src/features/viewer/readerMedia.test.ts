import { describe, expect, it } from "vitest";

import { resolveReaderMediaReference } from "./readerMedia";

describe("reader media references", () => {
  it("resolves a portable workspace image without persisting a native asset URL", () => {
    expect(resolveReaderMediaReference("assets/banda/ship.png", "/workspace/project")).toEqual({
      status: "resolved",
      reference: "assets/banda/ship.png",
      displayUrl: "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fbanda%2Fship.png",
    });
  });

  it("repairs a legacy asset URL before presenting it", () => {
    expect(resolveReaderMediaReference("asset://localhost/workspace/project/assets/banda/ship.png", "/workspace/project")).toEqual({
      status: "resolved",
      reference: "asset://localhost/workspace/project/assets/banda/ship.png",
      displayUrl: "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fbanda%2Fship.png",
    });
  });

  it("retains a remote HTTPS image as a resolved reader resource", () => {
    expect(resolveReaderMediaReference("https://images.example.test/ship.png", "/workspace/project")).toEqual({
      status: "resolved",
      reference: "https://images.example.test/ship.png",
      displayUrl: "https://images.example.test/ship.png",
    });
  });

  it("retains Tauri's alternate asset host", () => {
    expect(
      resolveReaderMediaReference(
        "http://asset.localhost/%2Fworkspace%2Fproject%2Fassets%2Fbanda%2Fship.png",
        "/workspace/project",
      ),
    ).toEqual({
      status: "resolved",
      reference: "http://asset.localhost/%2Fworkspace%2Fproject%2Fassets%2Fbanda%2Fship.png",
      displayUrl: "http://asset.localhost/%2Fworkspace%2Fproject%2Fassets%2Fbanda%2Fship.png",
    });
  });

  it("surfaces an ephemeral blob link as unresolved instead of feeding it to an image element", () => {
    expect(resolveReaderMediaReference("blob:https://chatgpt.com/lost-image", "/workspace/project")).toEqual({
      status: "unresolved",
      reference: "blob:https://chatgpt.com/lost-image",
      reason: "ephemeral_blob",
    });
  });
});
