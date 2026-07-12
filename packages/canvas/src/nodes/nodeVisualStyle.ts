/** View-local overrides only. Semantic palette, title, pith, and tags always
 * come from the canonical graph record through `cardPresentation`. */
export interface NodeVisualStyle {
  dotColour?: string;
  bgColour?: string;
  textColour?: string;
  thumbnail?: string;
}
