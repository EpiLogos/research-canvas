import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { StreetViewImageRecord } from "@research-canvas/desktop-api";
import { createLiveServicePolicy } from "@research-canvas/geography";

import {
  mapillaryBrowseUrl,
  StreetViewSurface,
} from "./StreetViewSurface";

function image(over: Partial<StreetViewImageRecord>): StreetViewImageRecord {
  return {
    id: "img-1",
    profileScope: "migration",
    artifactPath: "media/crossing.png",
    capturedAt: "2021-07-14T10:00:00Z",
    latitude: 41.0082,
    longitude: 28.9784,
    headingDegrees: 120,
    redactionStatus: "pending",
    redactionRegions: [
      {
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        reason: "face",
        source: "manual",
      },
    ],
    redactedArtifactPath: null,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  };
}

describe("StreetViewSurface", () => {
  test("renders captured imagery with redaction region overlays", () => {
    render(
      <StreetViewSurface
        images={[image({})]}
        policy={createLiveServicePolicy()}
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );

    expect(screen.getByTestId("street-view-image")).toHaveAttribute(
      "src",
      "/assets/media/crossing.png",
    );
    expect(screen.getByTestId("street-view-frame")).toHaveAttribute(
      "data-status",
      "pending",
    );
    const region = screen.getByTestId("street-view-region-0");
    expect(region).toHaveAttribute("data-reason", "face");
    expect(region.style.left).toBe("10%");
    expect(region.style.top).toBe("10%");
    expect(region.style.width).toBe("20%");
    expect(region.style.height).toBe("20%");
    expect(screen.getByTestId("street-view-connection")).toHaveAttribute(
      "data-state",
      "offline",
    );
  });

  test("prefers the redacted derived artifact when present", () => {
    render(
      <StreetViewSurface
        images={[
          image({
            redactionStatus: "redacted",
            redactedArtifactPath: "redacted/img-1.png",
          }),
        ]}
        policy={createLiveServicePolicy()}
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );

    expect(screen.getByTestId("street-view-image")).toHaveAttribute(
      "src",
      "/assets/redacted/img-1.png",
    );
    expect(screen.getByTestId("street-view-frame")).toHaveAttribute(
      "data-status",
      "redacted",
    );
  });

  test("Mapillary browse stays offline until explicit opt-in", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const policy = createLiveServicePolicy();

    render(
      <StreetViewSurface
        images={[image({})]}
        policy={policy}
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );

    // Not opted in: the first click only grants the explicit opt-in; the
    // live call never fires without it.
    const button = screen.getByTestId("street-view-mapillary");
    expect(button).toHaveTextContent(/enable mapillary browsing/i);
    fireEvent.click(button);
    expect(openSpy).not.toHaveBeenCalled();
    expect(policy.isOptedIn("street_view_browse")).toBe(true);
    expect(screen.getByTestId("street-view-connection")).toHaveAttribute(
      "data-state",
      "opted_in",
    );

    // Now opted in: the browse click fires the live call and the indicator
    // is active while it is in flight.
    fireEvent.click(screen.getByTestId("street-view-mapillary"));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0][0])).toBe(
      mapillaryBrowseUrl(41.0082, 28.9784),
    );
    expect(screen.getByTestId("street-view-connection")).toHaveAttribute(
      "data-state",
      "active",
    );

    policy.complete();
    openSpy.mockRestore();
  });

  test("Mapillary browse is disabled without a located capture", () => {
    render(
      <StreetViewSurface
        images={[
          image({
            latitude: null,
            longitude: null,
            redactionRegions: [],
          }),
        ]}
        policy={createLiveServicePolicy()}
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );

    expect(screen.getByTestId("street-view-mapillary")).toBeDisabled();
  });

  test("empty journeys explain how to start", () => {
    render(
      <StreetViewSurface
        images={[]}
        policy={createLiveServicePolicy()}
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );
    expect(screen.getByTestId("street-view-empty")).toBeInTheDocument();
  });
});
