import { COLOUR_TAGS, type ColourTag } from "@research-canvas/schema";

/** Supported canvas themes. */
export const THEMES = ["paper", "nocturne", "ledger"] as const;

export type ThemeName = (typeof THEMES)[number];

/**
 * Theme-specific colour maps for every grounded colour tag.
 * Colours are hex values suitable for CSS variables and inline styles.
 */
export const THEME_COLOUR_MAPS: Record<ThemeName, Record<ColourTag, string>> = {
  paper: {
    "evidence-documented": "#15803d",
    "evidence-interpretive": "#0e7490",
    "evidence-contested": "#b91c1c",
    "historicity-mythic": "#7c3aed",
    "historicity-historical": "#4338ca",
    "archetype-expression": "#db2777",
    "relation-causal": "#0369a1",
    "relation-analogical": "#047857",
    "surface-places": "#a16207",
    "surface-palace": "#9333ea",
  },
  nocturne: {
    "evidence-documented": "#4ade80",
    "evidence-interpretive": "#22d3ee",
    "evidence-contested": "#f87171",
    "historicity-mythic": "#a78bfa",
    "historicity-historical": "#818cf8",
    "archetype-expression": "#f472b6",
    "relation-causal": "#38bdf8",
    "relation-analogical": "#34d399",
    "surface-places": "#facc15",
    "surface-palace": "#c084fc",
  },
  ledger: {
    "evidence-documented": "#65a30d",
    "evidence-interpretive": "#0891b2",
    "evidence-contested": "#dc2626",
    "historicity-mythic": "#9333ea",
    "historicity-historical": "#4f46e5",
    "archetype-expression": "#db2777",
    "relation-causal": "#2563eb",
    "relation-analogical": "#059669",
    "surface-places": "#ca8a04",
    "surface-palace": "#7e22ce",
  },
};

/** Returns the concrete hex colour for a grounded tag in the given theme. */
export function colourForTag(tag: ColourTag, theme: ThemeName): string {
  const map = THEME_COLOUR_MAPS[theme];
  if (!(tag in map)) {
    throw new Error(`Unknown colour tag: ${tag}`);
  }
  return map[tag];
}

/** Returns the CSS variable name used to expose a tag's colour at runtime. */
export function cssVarForTag(tag: ColourTag): string {
  return `--colour-${tag}`;
}

/** All grounded tags exposed by the schema. Convenience re-export. */
export { COLOUR_TAGS, type ColourTag };
