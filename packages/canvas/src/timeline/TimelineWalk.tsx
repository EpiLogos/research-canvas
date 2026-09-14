import type { JSX } from "react";

import type { TimelineWalk } from "./walk";

/**
 * Global/temporal walk surface (ticket #28, D13 §4.5): the traversable
 * sequence of located, dated events across the project — the spine connecting
 * timeline → places → stories. Sub-timeline frames are mapped in place (nested
 * inside each stop), never a separate lens. Earth is the spatial zero-case:
 * unlocated stops still appear in the walk.
 */
export function TimelineWalk({
  walk,
  onSelectStop,
  resolveNodeTitle,
}: {
  walk: TimelineWalk;
  onSelectStop: (graphNodeId: string) => void;
  /** Resolve a frame member's graph node id to a readable title. */
  resolveNodeTitle?: (graphNodeId: string) => string | null;
}): JSX.Element {
  return (
    <aside className="timeline-walk" data-testid="timeline-walk" aria-label="Global temporal walk">
      <header className="timeline-walk__header">
        <strong>Global / temporal walk</strong>
        <span className="timeline-walk__counts">
          {walk.stops.length} stops
          {walk.locatedCount > 0 && <> · {walk.locatedCount} located</>}
          {walk.subtimelineCount > 0 && <> · {walk.subtimelineCount} framed</>}
        </span>
      </header>
      {walk.stops.length === 0 ? (
        <p className="timeline-walk__empty" data-testid="timeline-walk-empty">
          No dated events to traverse
        </p>
      ) : (
        <ol className="timeline-walk__stops" data-testid="timeline-walk-stops">
          {walk.stops.map((stop, index) => (
            <li
              key={stop.graphNodeId}
              data-testid={`timeline-walk-stop-${stop.graphNodeId}`}
              data-located={stop.located ? "true" : "false"}
              data-framed={stop.frame ? "true" : "false"}
              data-walk-index={index}
            >
              <span className="timeline-walk__index">{index + 1}</span>
              <span className="timeline-walk__date">{stop.validFrom}</span>
              <span className="timeline-walk__title">
                <button type="button" onClick={() => onSelectStop(stop.graphNodeId)}>
                  {stop.title}
                </button>
                {stop.located && (
                  <span className="timeline-walk__place">@ {stop.placeTitle}</span>
                )}
              </span>
              {stop.frame && (
                <ul
                  className="timeline-walk__frame"
                  data-testid={`timeline-walk-frame-${stop.graphNodeId}`}
                >
                  {stop.frameMembers.map((memberId) => (
                    <li key={memberId}>
                      {resolveNodeTitle?.(memberId) ?? memberId}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
