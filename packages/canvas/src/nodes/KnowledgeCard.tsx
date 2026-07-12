import type { CSSProperties, JSX } from "react";
import type { KnowledgeCardPresentation } from "../presentation/cardPresentation";

export function KnowledgeCard({
  presentation,
  compact = false,
}: {
  presentation: KnowledgeCardPresentation;
  compact?: boolean;
}): JSX.Element {
  const visibleChips = [...presentation.badges, ...presentation.tags].slice(0, compact ? 1 : 4);
  return (
    <article
      className="knowledge-card"
      data-testid="knowledge-card"
      data-palette={presentation.palette.id}
      style={{
        backgroundColor: presentation.palette.surface,
        borderColor: presentation.palette.accent,
        color: presentation.palette.text,
        "--knowledge-accent": presentation.palette.accent,
      } as CSSProperties}
    >
      <span className="knowledge-card__accent" aria-hidden="true" />
      {presentation.coverUrl ? (
        <img className="knowledge-card__cover" src={presentation.coverUrl} alt="" draggable={false} />
      ) : null}
      <div className="knowledge-card__body">
        <div className="knowledge-card__eyebrow">{presentation.palette.label}</div>
        <h3 className="knowledge-card__title">{presentation.title}</h3>
        {!compact && presentation.pith ? <p className="knowledge-card__pith">{presentation.pith}</p> : null}
        {visibleChips.length > 0 ? (
          <div className="knowledge-card__chips" aria-label="Node context">
            {visibleChips.map((chip) => <span className="knowledge-card__chip" key={chip}>{chip}</span>)}
          </div>
        ) : null}
      </div>
    </article>
  );
}
