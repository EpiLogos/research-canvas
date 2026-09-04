import { passageRefKey, type Scene } from "@research-canvas/schema";

export const CANONICAL_LANGUAGE = "original";

export interface ScenePresentation {
  scene: Scene;
  /** The active presentation language; `original` is the canonical voice. */
  language: string;
  /** Canonical plus every derived variant language, picker order. */
  availableLanguages: string[];
  /** For each anchored passage, which language variant (if any) is active. */
  passageLanguageRefs: Array<{
    passageRef: Scene["passages"][number];
    variantId: string | null;
  }>;
}

/**
 * Multilingual presentation (vision §3.13, ticket #8): the storyteller's
 * original voice passages are canonical; translations are derived objects
 * with passage-level provenance. The surface switches per scene without ever
 * overwriting the canonical original.
 */
export function presentScene(
  scene: Scene,
  language = CANONICAL_LANGUAGE,
): ScenePresentation {
  const variantLanguages = [
    ...new Set(scene.languageVariants.map((variant) => variant.language)),
  ];
  const availableLanguages = [
    CANONICAL_LANGUAGE,
    ...variantLanguages.filter((candidate) => candidate !== CANONICAL_LANGUAGE),
  ];
  const activeVariants = scene.languageVariants.filter(
    (variant) => variant.language === language,
  );
  const passageLanguageRefs = scene.passages.map((passage) => {
    const key = passageRefKey(passage);
    const variant = activeVariants.find(
      (candidate) => passageRefKey(candidate.sourcePassageRef) === key,
    );
    return { passageRef: passage, variantId: variant?.id ?? null };
  });
  return {
    scene,
    language,
    availableLanguages,
    passageLanguageRefs,
  };
}
