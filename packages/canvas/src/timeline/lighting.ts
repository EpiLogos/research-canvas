import type { ArchetypalLighting, LitInstance } from "./contracts";

export type Dominance = "dominant" | "secondary";

export interface LitNodeState {
  dominance: Dominance;
  relType: "INSTANTIATES" | "ECHOES";
}

export type LitMap = Map<string, LitNodeState>;

function rank(instance: { relType: "INSTANTIATES" | "ECHOES"; dominance: Dominance }): number {
  // Higher rank = stronger lighting. INSTANTIATES(2) > ECHOES(0);
  // dominant(+1) > secondary(+0). Range 0..3.
  const relScore = instance.relType === "INSTANTIATES" ? 2 : 0;
  const domScore = instance.dominance === "dominant" ? 1 : 0;
  return relScore + domScore;
}

function normalizeDominance(value: LitInstance["dominance"]): Dominance {
  return value === "dominant" ? "dominant" : "secondary";
}

/** Fold an ArchetypalLighting result into a graphNodeId -> strongest-state map. */
export function buildLitMap(lighting: ArchetypalLighting | null): LitMap {
  const map: LitMap = new Map();
  if (!lighting) return map;
  for (const instance of lighting.instances) {
    const candidate: LitNodeState = {
      dominance: normalizeDominance(instance.dominance),
      relType: instance.relType,
    };
    const existing = map.get(instance.node.graphNodeId);
    if (!existing || rank(candidate) > rank(existing)) {
      map.set(instance.node.graphNodeId, candidate);
    }
  }
  return map;
}

/** The single strongest resonance for an event (for the resonance popover). */
export function dominantResonance(instances: LitInstance[]): LitInstance | null {
  let best: LitInstance | null = null;
  let bestRank = -1;
  for (const instance of instances) {
    const r = rank({
      relType: instance.relType,
      dominance: normalizeDominance(instance.dominance),
    });
    if (r > bestRank) {
      best = instance;
      bestRank = r;
    }
  }
  return best;
}
