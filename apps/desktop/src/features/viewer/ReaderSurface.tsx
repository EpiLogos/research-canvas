import { useEffect, useState, type ReactNode } from "react";

import { resolveKnowledgeCardPresentation } from "@research-canvas/canvas";

import { resolveReaderMediaReference } from "./readerMedia";
import type { ReaderRecord } from "./readerRecord";

export type ReaderSurfaceVariant = "lens" | "overlay" | "full";

interface ReaderSurfaceProps {
  record: ReaderRecord;
  workspaceRoot: string | null | undefined;
  variant: ReaderSurfaceVariant;
  onExit: () => void;
  onFullScreen?: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * The single chrome around a node's deep content. The surface deliberately
 * knows nothing about the origin lens: it receives an already-normalised
 * ReaderRecord and renders the same substance for a canvas, a timeline, or a
 * full-screen reader.
 */
export function ReaderSurface({
  record,
  workspaceRoot,
  variant,
  onExit,
  onFullScreen,
  children,
  actions,
}: ReaderSurfaceProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const media = record.coverReference
    ? resolveReaderMediaReference(record.coverReference, workspaceRoot)
    : null;
  const coverUrl = media?.status === "resolved" ? media.displayUrl : null;
  const presentation = resolveKnowledgeCardPresentation({
    title: record.title,
    summary: record.pith,
    dotColour: record.canvasNode?.dotColour,
    bgColour: record.canvasNode?.bgColour,
    textColour: record.canvasNode?.textColour,
    thumbnail: coverUrl ?? undefined,
  }, record.graphNode);
  const closeLabel = variant === "lens" ? "Back to canvas" : "Close reading";
  const surfaceTestId = variant === "overlay"
    ? "reading-overlay"
    : variant === "full"
      ? "reading-fullscreen"
      : "reading-pane";

  useEffect(() => {
    if (variant === "lens") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit, variant]);

  return (
    <>
      {variant === "overlay" ? (
        <button
          type="button"
          className="reader-surface__scrim"
          data-testid="reader-scrim"
          aria-label="Dismiss reading backdrop"
          onClick={onExit}
        />
      ) : null}
      <section
        className={`reader-surface reader-surface--${variant}`}
        data-testid={surfaceTestId}
        role={variant === "lens" ? undefined : "dialog"}
        aria-modal={variant === "lens" ? undefined : "true"}
        aria-label="Node reading"
      >
        <header className="reader-surface__bar">
          <span className="reader-surface__eyebrow">{record.kind === "graph" ? "Reading" : "Node reading"}</span>
          <div className="reader-surface__bar-actions">
            <button
              type="button"
              className="reader-surface__icon-button"
              aria-label={detailsOpen ? "Hide reader details" : "Show reader details"}
              aria-expanded={detailsOpen}
              title={detailsOpen ? "Hide details" : "Show details"}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              <ReaderIcon kind="details" />
            </button>
            {onFullScreen ? (
              <button
                type="button"
                className="reader-surface__icon-button"
                aria-label="Read full screen"
                title="Read full screen"
                onClick={onFullScreen}
              >
                <ReaderIcon kind="expand" />
              </button>
            ) : null}
            <button
              type="button"
              className="reader-surface__icon-button reader-surface__icon-button--exit"
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onExit}
            >
              <ReaderIcon kind={variant === "lens" ? "back" : "close"} />
            </button>
          </div>
        </header>

        <div className="reader-surface__scroll">
          <div className="reader-surface__document-stage">
            <header
              className="reader-surface__record"
              style={{ borderLeftColor: presentation.palette.accent }}
            >
              {media?.status === "unresolved" ? (
                <div className="reader-surface__media-unresolved" data-testid="reader-media-unresolved">
                  Image source needs re-attaching
                </div>
              ) : coverUrl ? (
                <img className="reader-surface__cover" data-testid="reader-cover" src={coverUrl} alt="" />
              ) : null}
              <div className="reader-surface__heading-copy">
                <h1>{record.title}</h1>
                {record.pith ? <p className="reader-surface__pith">{record.pith}</p> : null}
                {presentation.badges.length > 0 ? (
                  <ul className="reader-surface__badges" aria-label="Knowledge metadata">
                    {presentation.badges.map((badge) => <li key={badge}>{badge}</li>)}
                  </ul>
                ) : null}
              </div>
            </header>
            <div className="reader-surface__body">{children}</div>
          </div>
        </div>

        {detailsOpen ? (
          <aside className="reader-surface__details" aria-label="Reader details">
            <div className="reader-surface__details-head">
              <span>Node details</span>
              <button
                type="button"
                className="reader-surface__details-close"
                aria-label="Hide reader details"
                onClick={() => setDetailsOpen(false)}
              >
                <ReaderIcon kind="close" />
              </button>
            </div>
            <ReaderMetadata record={record} />
            {actions ? (
              <div className="reader-surface__actions" aria-label="Reader actions">
                <span className="reader-surface__details-label">Add to this node</span>
                {actions}
              </div>
            ) : null}
          </aside>
        ) : null}
      </section>
    </>
  );
}

function ReaderMetadata({ record }: { record: ReaderRecord }) {
  const sourceCoordinates = [...record.sourceCoordinates, ...record.bodySourceCoordinates];
  const temporal = record.temporal
    ? [record.temporal.validFrom?.slice(0, 4), record.temporal.validTo?.slice(0, 4)]
        .filter(Boolean)
        .join(" – ") || "Temporal placement recorded"
    : "Not temporal";

  return (
    <dl className="reader-surface__metadata">
      <div>
        <dt>Time</dt>
        <dd>{record.temporal ? `${temporal} · ${record.temporal.precision ?? "unspecified precision"}` : temporal}</dd>
      </div>
      <div>
        <dt>Place</dt>
        <dd>{record.placeCoverage === "resolved" ? "Resolved place coverage" : record.placeCoverage ?? "No place coverage"}</dd>
      </div>
      <div>
        <dt>Sources</dt>
        <dd>
          {sourceCoordinates.length > 0 ? (
            <ul>
              {sourceCoordinates.map((coordinate, index) => <li key={`${coordinate}-${index}`}>{coordinate}</li>)}
            </ul>
          ) : "No source coordinates"}
        </dd>
      </div>
      {record.graphNodeId ? (
        <div>
          <dt>Graph identity</dt>
          <dd>{record.graphNodeId}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function ReaderIcon({ kind }: { kind: "back" | "close" | "details" | "expand" }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", "aria-hidden": true };
  if (kind === "close") {
    return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  }
  if (kind === "back") {
    return <svg {...common}><path d="M19 12H5m6-6-6 6 6 6" /></svg>;
  }
  if (kind === "details") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 10v6m0-9h.01" /></svg>;
  }
  return <svg {...common}><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" /></svg>;
}
