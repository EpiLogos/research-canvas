interface TimelineTransportProps {
  playing: boolean;
  onTogglePlay: () => void;
  fraction: number;
  onScrub: (fraction: number) => void;
  label: string;
  onPlaySequence?: () => void;
}

export function TimelineTransport({ playing, onTogglePlay, fraction, onScrub, label, onPlaySequence }: TimelineTransportProps) {
  return (
    <div className="timeline-transport" data-testid="timeline-transport">
      <button
        type="button"
        className="timeline-transport__play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={onTogglePlay}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        className="timeline-transport__scrub"
        data-testid="timeline-scrub"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={fraction}
        onChange={(e) => onScrub(Number(e.target.value))}
      />
      <span className="timeline-transport__label">{label}</span>
      {onPlaySequence && (
        <button type="button" className="timeline-transport__sequence" onClick={onPlaySequence}>
          Play sequence
        </button>
      )}
    </div>
  );
}
