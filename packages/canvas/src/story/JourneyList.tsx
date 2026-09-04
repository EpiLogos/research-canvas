import type { StoryJourney } from "@research-canvas/domain";
import type { JSX } from "react";

export interface JourneyListProps {
  journeys: StoryJourney[];
  activeJourneyId: string | null;
  onSelect: (journeyId: string) => void;
}

export function JourneyList({ journeys, activeJourneyId, onSelect }: JourneyListProps): JSX.Element {
  return (
    <aside className="story-composer__journeys" data-testid="story-journey-list">
      <h3>Journeys</h3>
      {journeys.length === 0 ? (
        <p data-testid="story-journey-empty">No journeys yet.</p>
      ) : (
        <ol>
          {journeys.map((journey) => (
            <li key={journey.id}>
              <button
                type="button"
                data-testid={`story-journey-${journey.id}`}
                data-active={journey.id === activeJourneyId ? "true" : undefined}
                onClick={() => onSelect(journey.id)}
              >
                <strong>{journey.title}</strong>
                <span>{journey.sceneIds.length} scene{journey.sceneIds.length === 1 ? "" : "s"}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
