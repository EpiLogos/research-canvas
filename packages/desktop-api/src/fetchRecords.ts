import type { StreetViewRegion } from "./streetView";

/**
 * Fetch-record wire types (refinement-2 D3, ticket #20): the deterministic
 * provenance record written by `rc-asset ingest`, the app-side gate for
 * agent-gathered imagery. One row per ingest attempt (accepted OR rejected);
 * accepted rows link to the street-view image they registered and carry the
 * place / walk / scene association the agent supplied. The gate never makes a
 * network call — the agent is the explicit live opt-in that fetches.
 */

export type FetchRecordRedactionStatus = "pending" | "redacted" | "none_needed";

export interface FetchValidation {
  mimeOk: boolean;
  sizeOk: boolean;
  licenseOk: boolean;
  sourceOk: boolean;
}

export interface FetchRecord {
  id: string;
  profileScope: string;
  /** Links to the durable tmux session that produced the asset. */
  agentSessionId: string;
  sourceUrl: string;
  license: string;
  fetchedAt: string;
  mimeType: string;
  byteSize: number;
  validation: FetchValidation;
  contentHash: string;
  /** Portable path under the media root; empty for rejected attempts. */
  artifactPath: string;
  redactionStatus: FetchRecordRedactionStatus;
  streetViewImageId: string | null;
  placeId: string | null;
  walkId: string | null;
  sceneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListFetchRecordsRequest {
  databasePath: string;
  profileScope?: string;
}

export interface IngestFetchedAssetRequest {
  databasePath: string;
  mediaRoot: string;
  profileScope?: string;
  /** Durable tmux session id that produced the asset. */
  agentSessionId: string;
  /** Provenance: the URL the agent fetched the bytes from (gate never fetches). */
  sourceUrl: string;
  /** Provenance: the license the agent verified at the source. */
  license: string;
  /** Provenance: retrieval timestamp; defaults to now. */
  fetchedAt?: string;
  /** Absolute path to the bytes the agent already placed on disk. */
  sourcePath: string;
  placeId?: string | null;
  walkId?: string | null;
  sceneId?: string | null;
  /** Manual/detected regions to redact locally after import (pending → redacted). */
  redactionRegions?: StreetViewRegion[];
  /** Byte-size cap; defaults to the gate's 10 MiB. */
  capBytes?: number;
}

export type FetchRecordWire = FetchRecord;

export function fetchRecordFromWire(wire: FetchRecordWire): FetchRecord {
  return wire;
}
