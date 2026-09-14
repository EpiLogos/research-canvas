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

export interface ImportStreetViewImageInput {
  profileScope: string;
  fileName: string;
  bytes: Uint8Array;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  headingDegrees: number | null;
  redactionRegions: StreetViewRegion[];
  noRedactionNeeded: boolean;
}

/** Canonical Surface #3 companion-media persistence boundary. */
export interface StreetViewRepository {
  listImages(profileScope: string): Promise<StreetViewImageRecord[]>;
  importImage(input: ImportStreetViewImageInput): Promise<StreetViewImageRecord>;
}
