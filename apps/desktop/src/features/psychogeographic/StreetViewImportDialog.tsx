import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from "react";

import type {
  StreetViewImageRecord,
  StreetViewRedactionReason,
  StreetViewRegion,
  WorkspaceServices,
} from "@research-canvas/desktop-api";

/**
 * Street-view import flow (workstream 3): file picker → stage into the
 * workspace media root → register with capture metadata → draw redaction
 * regions on the frame → run the local redaction pipeline. Every write goes
 * through the real transport; nothing is stored outside the media root and
 * the profile store.
 */

export interface StreetViewImportDialogProps {
  transport: WorkspaceServices;
  databasePath: string;
  mediaRoot: string;
  profileScope: string;
  onClose: () => void;
  onImported: () => void;
}

interface DraftRegion {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const REGION_REASONS: StreetViewRedactionReason[] = [
  "face",
  "license_plate",
  "manual",
];

export function StreetViewImportDialog({
  transport,
  databasePath,
  mediaRoot,
  profileScope,
  onClose,
  onImported,
}: StreetViewImportDialogProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [heading, setHeading] = useState("");
  const [regions, setRegions] = useState<
    Array<{ region: StreetViewRegion; id: string }>
  >([]);
  const [draft, setDraft] = useState<DraftRegion | null>(null);
  const [drawingReason, setDrawingReason] = useState<StreetViewRedactionReason>("face");
  const [noRedactionNeeded, setNoRedactionNeeded] = useState(false);
  const [step, setStep] = useState<"select" | "regions">("select");
  const [status, setStatus] = useState<
    "idle" | "staging" | "registering" | "redacting" | "done" | "failed"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const regionIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const acceptFile = useCallback((candidate: File | null) => {
    if (!candidate) return;
    if (!/^image\/(png|jpeg)$/.test(candidate.type)) {
      setError("Choose a PNG or JPEG image.");
      return;
    }
    setError(null);
    setFile(candidate);
    if (typeof URL.createObjectURL === "function") {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(candidate);
      });
    }
  }, []);

  const pointInFrame = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const frame = frameRef.current;
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      };
    },
    [],
  );

  const beginRegion = useCallback(
    (event: React.PointerEvent) => {
      if (noRedactionNeeded) return;
      event.preventDefault();
      const point = pointInFrame(event);
      if (!point) return;
      setDraft({
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      });
    },
    [noRedactionNeeded, pointInFrame],
  );

  const moveRegion = useCallback(
    (event: React.PointerEvent) => {
      if (!draft) return;
      const point = pointInFrame(event);
      if (!point) return;
      setDraft({ ...draft, currentX: point.x, currentY: point.y });
    },
    [draft, pointInFrame],
  );

  const finishRegion = useCallback(() => {
    if (!draft) return;
    const x = Math.min(draft.startX, draft.currentX);
    const y = Math.min(draft.startY, draft.currentY);
    const width = Math.abs(draft.currentX - draft.startX);
    const height = Math.abs(draft.currentY - draft.startY);
    if (width > 0.015 && height > 0.015) {
      regionIdRef.current += 1;
      setRegions((current) => [
        ...current,
        {
          id: `region-${regionIdRef.current}`,
          region: { x, y, width, height, reason: drawingReason, source: "manual" },
        },
      ]);
    }
    setDraft(null);
  }, [draft, drawingReason]);

  const runImport = async () => {
    if (!file) return;
    setError(null);
    setStatus("staging");
    try {
      const bytes = await readFileBytes(file);
      const staged = await transport.stageStreetViewImage({
        mediaRoot,
        profileScope,
        fileName: file.name,
        bytes,
      });
      setStatus("registering");
      const image: StreetViewImageRecord = {
        id: `sv-${crypto.randomUUID()}`,
        profileScope,
        artifactPath: staged.artifactPath,
        capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
        latitude: latitude.trim() === "" ? null : Number(latitude),
        longitude: longitude.trim() === "" ? null : Number(longitude),
        headingDegrees: heading.trim() === "" ? null : Number(heading),
        redactionStatus: "pending",
        redactionRegions: regions.map(({ region }) => region),
        redactedArtifactPath: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const registered = await transport.registerStreetViewImage({
        databasePath,
        mediaRoot,
        image,
      });
      if (noRedactionNeeded) {
        setStatus("redacting");
        await transport.markStreetViewRedactionNoneNeeded({
          databasePath,
          id: registered.id,
        });
      } else if (registered.redactionRegions.length > 0) {
        setStatus("redacting");
        await transport.applyStreetViewRedaction({
          databasePath,
          mediaRoot,
          id: registered.id,
        });
      }
      setStatus("done");
      onImported();
    } catch (cause) {
      setStatus("failed");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  async function readFileBytes(candidate: File): Promise<Uint8Array> {
    if (typeof candidate.arrayBuffer === "function") {
      return new Uint8Array(await candidate.arrayBuffer());
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
      reader.readAsArrayBuffer(candidate);
    });
  }

  const draftRect =
    draft === null
      ? null
      : {
          x: Math.min(draft.startX, draft.currentX),
          y: Math.min(draft.startY, draft.currentY),
          width: Math.abs(draft.currentX - draft.startX),
          height: Math.abs(draft.currentY - draft.startY),
        };

  return (
    <div
      className="street-view-import__backdrop"
      data-testid="street-view-import-dialog"
      onClick={onClose}
    >
      <section
        aria-label="Import street view imagery"
        className="street-view-import"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="street-view-import__header">
          <div>
            <p className="street-view-import__eyebrow">street view · {profileScope}</p>
            <h2>Import imagery</h2>
          </div>
          <button
            type="button"
            aria-label="Close import dialog"
            className="street-view-import__close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {step === "select" && (
          <div className="street-view-import__body">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Choose a PNG or JPEG capture"
              data-testid="street-view-file-input"
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />
            {file && previewUrl && (
              <img
                className="street-view-import__preview"
                src={previewUrl}
                alt={`Selected capture ${file.name}`}
              />
            )}
            <div className="street-view-import__fields">
              <label>
                Captured at
                <input
                  type="datetime-local"
                  value={capturedAt}
                  data-testid="street-view-captured-at"
                  onChange={(event) => setCapturedAt(event.target.value)}
                />
              </label>
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={latitude}
                  data-testid="street-view-latitude"
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={longitude}
                  data-testid="street-view-longitude"
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </label>
              <label>
                Heading (°)
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="360"
                  value={heading}
                  data-testid="street-view-heading"
                  onChange={(event) => setHeading(event.target.value)}
                />
              </label>
            </div>
            <div className="street-view-import__actions">
              <button
                type="button"
                data-testid="street-view-continue"
                disabled={!file}
                onClick={() => setStep("regions")}
              >
                Continue to regions
              </button>
            </div>
          </div>
        )}

        {step === "regions" && (
          <div className="street-view-import__body">
            <p className="street-view-import__hint">
              Drag over faces, plates, or other identifying detail to add a redaction
              region. Redaction is applied locally and never touches the original file.
            </p>
            <div className="street-view-import__frame-wrap">
              <div
                ref={frameRef}
                className="street-view-import__frame"
                data-testid="street-view-region-frame"
                onPointerDown={beginRegion}
                onPointerMove={moveRegion}
                onPointerUp={finishRegion}
                onPointerLeave={finishRegion}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Capture awaiting redaction regions"
                    draggable={false}
                  />
                )}
                {regions.map(({ id, region }) => (
                  <span
                    key={id}
                    className="street-view-import__region"
                    data-reason={region.reason}
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                    }}
                  />
                ))}
                {draftRect && (
                  <span
                    className="street-view-import__region street-view-import__region--draft"
                    data-reason={drawingReason}
                    style={{
                      left: `${draftRect.x * 100}%`,
                      top: `${draftRect.y * 100}%`,
                      width: `${draftRect.width * 100}%`,
                      height: `${draftRect.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
            <div className="street-view-import__region-tools">
              <label>
                Region reason
                <select
                  value={drawingReason}
                  data-testid="street-view-region-reason"
                  onChange={(event) =>
                    setDrawingReason(event.target.value as StreetViewRedactionReason)
                  }
                >
                  {REGION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="street-view-import__none">
                <input
                  type="checkbox"
                  checked={noRedactionNeeded}
                  data-testid="street-view-none-needed"
                  onChange={(event) => setNoRedactionNeeded(event.target.checked)}
                />
                No redaction needed
              </label>
            </div>
            {regions.length > 0 && (
              <ul className="street-view-import__region-list" data-testid="street-view-region-list">
                {regions.map(({ id, region }) => (
                  <li key={id}>
                    <span>{region.reason.replace("_", " ")}</span>
                    <span>
                      {Math.round(region.x * 100)}%, {Math.round(region.y * 100)}%
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove region ${id}`}
                      data-testid={`street-view-remove-region-${id}`}
                      onClick={() =>
                        setRegions((current) => current.filter((item) => item.id !== id))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="street-view-import__actions">
              <button type="button" onClick={() => setStep("select")}>
                Back
              </button>
              <button
                type="button"
                data-testid="street-view-run-redaction"
                disabled={status === "staging" || status === "registering" || status === "redacting"}
                onClick={() => void runImport()}
              >
                {status === "staging"
                  ? "Staging image…"
                  : status === "registering"
                    ? "Registering…"
                    : status === "redacting"
                      ? "Running redaction…"
                      : status === "done"
                        ? "Imported"
                        : "Import capture"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="street-view-import__error" data-testid="street-view-import-error">
            {error}
          </p>
        )}
        {status === "done" && (
          <p className="street-view-import__done" data-testid="street-view-import-done">
            Capture imported and ready in the street view.
          </p>
        )}
      </section>
    </div>
  );
}
