/**
 * Street-view imagery wire types (vision §3.9/§3.13, research findings §2):
 * own captured fieldwork imagery is the privacy-safe core; redaction regions
 * are normalized 0..1 rectangles with a reason, applied locally by the Rust
 * pipeline. Mapillary browsing never touches this store — it is a frontend
 * live opt-in only.
 */

export type StreetViewRedactionStatus = "pending" | "redacted" | "none_needed";

export type StreetViewRedactionReason = "face" | "license_plate" | "manual";

export interface StreetViewRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: StreetViewRedactionReason;
  source: "detected" | "manual";
}

export interface StreetViewImageRecord {
  id: string;
  profileScope: string;
  artifactPath: string;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  headingDegrees: number | null;
  redactionStatus: StreetViewRedactionStatus;
  redactionRegions: StreetViewRegion[];
  redactedArtifactPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListStreetViewImagesRequest {
  databasePath: string;
  profileScope?: string;
}

export interface RegisterStreetViewImageRequest {
  databasePath: string;
  mediaRoot: string;
  image: StreetViewImageRecord;
}

export interface StageStreetViewImageInput {
  mediaRoot: string;
  profileScope?: string;
  fileName: string;
  /** Raw PNG/JPEG bytes; staged verbatim under the media root. */
  bytes: Uint8Array;
}

export interface AddStreetViewRegionRequest {
  databasePath: string;
  id: string;
  region: StreetViewRegion;
}

export interface ApplyStreetViewRedactionRequest {
  databasePath: string;
  mediaRoot: string;
  id: string;
}

export interface StreetViewIdRequest {
  databasePath: string;
  id: string;
}
