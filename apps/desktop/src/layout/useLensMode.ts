import { useCallback, useState } from "react";

export type LensMode = "canvas" | "timeline";

export function useLensMode(initial: LensMode = "canvas"): {
  lens: LensMode;
  setLens: (lens: LensMode) => void;
  toggleLens: () => void;
} {
  const [lens, setLens] = useState<LensMode>(initial);
  const toggleLens = useCallback(() => {
    setLens((current) => (current === "canvas" ? "timeline" : "canvas"));
  }, []);
  return { lens, setLens, toggleLens };
}
