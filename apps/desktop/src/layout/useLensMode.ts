import { useCallback, useState } from "react";

export type LensMode =
  | "canvas"
  | "timeline"
  | "psychogeographic"
  | "story"
  | "palace";

const ORDER: LensMode[] = [
  "canvas",
  "timeline",
  "psychogeographic",
  "story",
  "palace",
];

export function useLensMode(initial: LensMode = "canvas"): {
  lens: LensMode;
  setLens: (lens: LensMode) => void;
  cycleLens: () => void;
} {
  const [lens, setLens] = useState<LensMode>(initial);
  const cycleLens = useCallback(() => {
    setLens((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
  }, []);
  return { lens, setLens, cycleLens };
}
