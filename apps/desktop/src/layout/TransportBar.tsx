import type { LensMode } from "./useLensMode";

interface TransportBarProps {
  lens: LensMode;
  onSetLens: (lens: LensMode) => void;
  breadcrumb?: string;
  onOpenPalette: () => void;
}

const LENSES: { id: LensMode; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "timeline", label: "Timeline" },
  { id: "psychogeographic", label: "Places" },
  { id: "story", label: "Journeys" },
  { id: "palace", label: "Palace" },
];

export function TransportBar({ lens, onSetLens, breadcrumb, onOpenPalette }: TransportBarProps) {
  return (
    <div className="ishell-transport" data-testid="transport-bar">
      <div className="ishell-lensswitch" role="tablist" aria-label="Lens">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            data-testid={`lens-${l.id}`}
            data-active={lens === l.id ? "true" : "false"}
            aria-selected={lens === l.id}
            onClick={() => onSetLens(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {breadcrumb ? <span className="ishell-breadcrumb">{breadcrumb}</span> : null}

      <span className="ishell-transport__spacer" />

      <button
        type="button"
        className="ishell-palette-affordance"
        aria-label="Do anything"
        onClick={onOpenPalette}
      >
        <kbd>⌘K</kbd>
        <span>Do anything</span>
      </button>
    </div>
  );
}
