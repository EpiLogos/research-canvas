import { COLOUR_TAGS, labelForTag, type ColourTag } from "@research-canvas/schema";
import { colourForTag, cssVarForTag, type ThemeName } from "@research-canvas/canvas";

interface ColourLegendProps {
  theme: ThemeName;
}

export function ColourLegend({ theme }: ColourLegendProps) {
  return (
    <div className="colour-legend" data-testid="colour-legend">
      {COLOUR_TAGS.map((tag: ColourTag) => {
        const cssVar = cssVarForTag(tag);
        return (
          <div
            key={tag}
            className="colour-legend__item"
            data-testid={`colour-legend-${tag}`}
            style={{ [cssVar]: colourForTag(tag, theme) } as React.CSSProperties}
          >
            <span
              className="colour-legend__swatch"
              data-testid="colour-swatch"
              style={{ backgroundColor: `var(${cssVar})` }}
              aria-hidden
            />
            <span className="colour-legend__label">{labelForTag(tag)}</span>
          </div>
        );
      })}
    </div>
  );
}
