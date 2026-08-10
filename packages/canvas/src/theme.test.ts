import { describe, expect, it } from "vitest";
import { COLOUR_TAGS } from "@research-canvas/schema";

import {
  THEMES,
  THEME_COLOUR_MAPS,
  colourForTag,
  cssVarForTag,
  type ThemeName,
} from "./theme";

describe("theme colour system", () => {
  it("exposes a CSS variable for every ColourTag", () => {
    for (const tag of COLOUR_TAGS) {
      expect(cssVarForTag(tag)).toBe(`--colour-${tag}`);
    }
  });

  it("maps every ColourTag to a concrete colour in every theme", () => {
    for (const theme of THEMES) {
      const map = THEME_COLOUR_MAPS[theme];
      expect(Object.keys(map)).toHaveLength(COLOUR_TAGS.length);

      for (const tag of COLOUR_TAGS) {
        const colour = map[tag];
        expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(colourForTag(tag, theme)).toBe(colour);
      }
    }
  });

  it("rejects unknown tags at the type level (runtime smoke)", () => {
    const invalidTag = "not-a-tag";
    const theme: ThemeName = "paper";
    // @ts-expect-error invalid tag is not in the map
    expect(() => colourForTag(invalidTag, theme)).toThrow();
  });
});
