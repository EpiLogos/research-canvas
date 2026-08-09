import { useReducer, useState, type JSX } from "react";

import type {
  StreetViewImageRecord,
  StreetViewRegion,
} from "@research-canvas/desktop-api";
import type { LiveServicePolicy } from "@research-canvas/geography";

/**
 * Street-view surface (vision §3.9/§3.13, research findings §2): own captured
 * fieldwork imagery is the privacy-safe core — redaction regions render as
 * overlays and the local pipeline writes derived redacted copies. Mapillary
 * browsing is an explicit per-action live opt-in; nothing is fetched until
 * the user consents, and the connection indicator reflects it.
 */

export interface StreetViewSurfaceProps {
  images: StreetViewImageRecord[];
  policy: LiveServicePolicy;
  /** Resolves a portable artifact path against the media root. */
  resolveAsset: (artifactPath: string) => string;
}

const REASON_LABELS: Record<StreetViewRegion["reason"], string> = {
  face: "Face",
  license_plate: "Plate",
  manual: "Manual",
};

export function StreetViewSurface({
  images,
  policy,
  resolveAsset,
}: StreetViewSurfaceProps): JSX.Element {
  const [openImageId, setOpenImageId] = useState<string | null>(
    images[0]?.id ?? null,
  );
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const activeImage = images.find((image) => image.id === openImageId) ?? null;
  const policyState = policy.state();
  const activeReason = policy.activeReason();
  const mapillaryOptedIn = policy.isOptedIn("street_view_browse");
  const firstLocated = images.find(
    (image) => image.latitude !== null && image.longitude !== null,
  );

  const browseMapillary = () => {
    if (!firstLocated || firstLocated.latitude === null || firstLocated.longitude === null) {
      return;
    }
    if (!mapillaryOptedIn) {
      policy.optIn(
        "street_view_browse",
        "browse Mapillary imagery for this location",
      );
      forceRender();
      return;
    }
    if (
      policy.requestLiveAction(
        "street_view_browse",
        "browse Mapillary imagery for this location",
    ) !== "granted"
    ) {
      return;
    }
    forceRender();
    const url = mapillaryBrowseUrl(firstLocated.latitude, firstLocated.longitude);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="street-view-surface" data-testid="street-view-surface">
      <div
        className="street-view-connection"
        data-testid="street-view-connection"
        data-state={policyState}
        aria-live="polite"
      >
        {policyState === "offline" && "Offline — imagery stays on this machine"}
        {policyState === "opted_in" && "Mapillary browsing opted in — not active"}
        {policyState === "active" && `Live: ${activeReason}`}
      </div>

      {images.length === 0 ? (
        <p className="street-view-empty" data-testid="street-view-empty">
          No captured imagery for this journey yet. Import fieldwork photos to
          build the street view.
        </p>
      ) : (
        <div className="street-view-layout">
          <ul className="street-view-list" data-testid="street-view-list">
            {images.map((image) => (
              <li key={image.id}>
                <button
                  type="button"
                  className="street-view-item"
                  data-active={image.id === activeImage?.id ? "true" : undefined}
                  data-testid={`street-view-item-${image.id}`}
                  onClick={() => setOpenImageId(image.id)}
                >
                  <span>{image.artifactPath.split("/").pop()}</span>
                  <span
                    className="street-view-status"
                    data-status={image.redactionStatus}
                  >
                    {image.redactionStatus}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {activeImage && (
            <figure
              className="street-view-frame"
              data-testid="street-view-frame"
              data-status={activeImage.redactionStatus}
            >
              <div className="street-view-media">
                <img
                  src={resolveAsset(
                    activeImage.redactedArtifactPath ?? activeImage.artifactPath,
                  )}
                  alt={`Street view capture ${activeImage.artifactPath}`}
                  data-testid="street-view-image"
                />
                {activeImage.redactionRegions.map((region, index) => (
                  <span
                    key={`${region.reason}-${index}`}
                    className="street-view-region"
                    data-reason={region.reason}
                    data-testid={`street-view-region-${index}`}
                    title={REASON_LABELS[region.reason]}
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                    }}
                  />
                ))}
              </div>
              <figcaption>
                {activeImage.capturedAt
                  ? `Captured ${activeImage.capturedAt}`
                  : "Capture time unknown"}
                {activeImage.latitude !== null && activeImage.longitude !== null
                  ? ` · ${activeImage.latitude.toFixed(4)}, ${activeImage.longitude.toFixed(4)}`
                  : " · location unrecorded"}
                {activeImage.headingDegrees !== null
                  ? ` · heading ${Math.round(activeImage.headingDegrees)}°`
                  : ""}
              </figcaption>
            </figure>
          )}
        </div>
      )}

      <div className="street-view-live" data-testid="street-view-live-controls">
        <span className="street-view-live-label">
          {mapillaryOptedIn
            ? "Mapillary browsing opted in"
            : "Mapillary browsing is off"}
        </span>
        <button
          type="button"
          onClick={browseMapillary}
          disabled={!firstLocated}
          data-testid="street-view-mapillary"
        >
          {mapillaryOptedIn
            ? "Browse Mapillary for this location (live)"
            : "Enable Mapillary browsing (live opt-in)"}
        </button>
        {!firstLocated && (
          <span className="street-view-hint">
            Add a located capture to browse Mapillary.
          </span>
        )}
      </div>
    </section>
  );
}

export function mapillaryBrowseUrl(latitude: number, longitude: number): string {
  return `https://www.mapillary.com/app/?lat=${latitude}&lng=${longitude}&z=17`;
}
