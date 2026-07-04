interface IconStripProps {
  leftOpen: boolean;
  activeLeftMode: "files" | "search" | "annotations";
  onToggleLeft: () => void;
  onSetLeftMode: (mode: "files" | "search" | "annotations") => void;
  onOpenSequences: () => void;
  onOpenSettings: () => void;
  onOpenInspector?: () => void;
  onOpenTerminal?: () => void;
}

const NAV_ICONS: { id: string; label: string; svg: string }[] = [
  {
    id: "files",
    label: "Files & Project",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h5l1.5 2H14v8H2z"/></svg>`,
  },
  {
    id: "search",
    label: "Search",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4"/><line x1="10.5" y1="10.5" x2="13" y2="13"/></svg>`,
  },
  {
    id: "sequences",
    label: "Sequences",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><line x1="6" y1="7" x2="10" y2="5"/><line x1="6" y1="9" x2="10" y2="11"/></svg>`,
  },
  {
    id: "annotate",
    label: "Annotations",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 13 Q2 8 8 4 Q14 0 13 8 Q12 13 8 14z"/></svg>`,
  },
];

export function IconStrip({ leftOpen, activeLeftMode, onToggleLeft, onSetLeftMode, onOpenSequences, onOpenSettings, onOpenInspector, onOpenTerminal }: IconStripProps) {
  const handleNavClick = (id: string) => {
    if (id === "files" || id === "search" || id === "annotate") {
      const mode = id === "annotate" ? "annotations" : id as "files" | "search";
      if (leftOpen && activeLeftMode === mode) {
        onToggleLeft();
      } else {
        onSetLeftMode(mode);
      }
    } else if (id === "sequences") {
      onOpenSequences();
    }
  };

  return (
    <aside className="icon-strip" aria-label="Navigation" data-testid="left-rail">
      <div className="icon-strip__nav">
        {NAV_ICONS.map((icon) => (
          <button
            key={icon.id}
            className="icon-strip__btn"
            data-active={
              (icon.id === "files" && leftOpen && activeLeftMode === "files") ||
              (icon.id === "search" && leftOpen && activeLeftMode === "search") ||
              (icon.id === "annotate" && leftOpen && activeLeftMode === "annotations")
                ? "true"
                : undefined
            }
            title={icon.label}
            aria-label={icon.label}
            onClick={() => handleNavClick(icon.id)}
            dangerouslySetInnerHTML={{ __html: icon.svg }}
          />
        ))}
        <button
          className="icon-strip__btn"
          title="Inspector"
          aria-label="Inspector"
          onClick={() => onOpenInspector?.()}
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="10" height="10" rx="2"/><line x1="8" y1="3" x2="8" y2="13"/></svg>`,
          }}
        />
        <button
          className="icon-strip__btn"
          title="Terminal"
          aria-label="Terminal"
          onClick={() => onOpenTerminal?.()}
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5l3 3-3 3"/><line x1="8.5" y1="11" x2="12" y2="11"/></svg>`,
          }}
        />
      </div>
      <div className="icon-strip__bottom">
        <button
          className="icon-strip__btn"
          title="Settings"
          aria-label="Settings"
          onClick={onOpenSettings}
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>`,
          }}
        />
      </div>
    </aside>
  );
}
