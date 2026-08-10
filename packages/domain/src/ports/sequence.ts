import type { Sequence } from "../types";

export interface SequenceRepository {
  listSequences(constellationId: string): Promise<Sequence[]>;
  getSequence(id: string): Promise<Sequence | null>;
  persistSequence(sequence: Sequence): Promise<Sequence>;
}
