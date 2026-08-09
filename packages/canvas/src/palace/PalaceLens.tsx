import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";

import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { clusterChambers, type ChamberCandidate } from "./clustering";
import {
  curateChambers,
  excludeChamber,
  pinChamber,
  renameChamber,
  reorderChamber,
  walkableChambers,
  type PalaceCuration,
} from "./curation";
import {
  buildPalaceWalkScenes,
  buildPalaceWalkSequence,
  type PalaceViewMode,
} from "./palaceWalk";

/**
 * The mind palace surface (vision §3.12, ticket #4): a generated navigable
 * space from graph structure — chambers are related-node clusters, paths are
 * graph edges. Authoring is curation (pin/exclude/rename/reorder) that never
 * touches the raw graph, and guided recall is a reveal-one-at-a-time viewing
 * mode over the curated palace walk.
 */

export interface PalaceLensProps {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  profileScope: string;
  curation: PalaceCuration | null;
  onSaveCuration: (curation: PalaceCuration) => void | Promise<void>;
  onPersistWalk?: (walk: { sequence: SceneSequence; scenes: Scene[] }) => void | Promise<void>;
}

const MAX_MEMBER_CHIPS = 6;

export function PalaceLens({
  nodes,
  relationships,
  profileScope,
  curation: curationProp,
  onSaveCuration,
  onPersistWalk,
}: PalaceLensProps): JSX.Element {
  const candidates = useMemo(
    () => clusterChambers(nodes, relationships),
    [nodes, relationships],
  );
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.graphNodeId, node])),
    [nodes],
  );
  const [curation, setCuration] = useState<PalaceCuration>(() =>
    curationProp ??
    curateChambers(candidates, nodesById, profileScope),
  );
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<PalaceViewMode>("explore");
  const [revealed, setRevealed] = useState(1);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");

  // Adopt a freshly loaded persisted curation until the user edits locally.
  useEffect(() => {
    if (curationProp && !dirty) {
      setCuration(curationProp);
    }
  }, [curationProp, dirty]);

  const commit = useCallback(
    (next: PalaceCuration) => {
      setCuration(next);
      setDirty(true);
      setSaveState("saving");
      Promise.resolve(onSaveCuration(next))
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("failed"));
    },
    [onSaveCuration],
  );

  const walkable = useMemo(() => walkableChambers(curation), [curation]);
  const neighborChambers = useMemo(
    () => chamberNeighbors(curation.chambers, candidates, relationships),
    [curation.chambers, candidates, relationships],
  );
  const revealedChambers =
    mode === "recall" ? walkable.slice(0, revealed) : walkable;

  const persistWalk = () => {
    if (!onPersistWalk) return;
    const { scenes } = buildPalaceWalkScenes(
      curation,
      candidates,
      nodesById,
      profileScope,
    );
    if (scenes.length === 0) return;
    const sequence = buildPalaceWalkSequence(curation, scenes, profileScope);
    void onPersistWalk({ sequence, scenes });
  };

  const startRename = (candidateId: string, currentTitle: string) => {
    setRenameTarget(candidateId);
    setRenameDraft(currentTitle);
  };

  return (
    <section className="palace-lens" data-testid="palace-lens">
      <header className="palace-lens__header">
        <div>
          <p className="palace-lens__eyebrow">{profileScope} profile · mind palace</p>
          <h2>Generated mind palace</h2>
        </div>
        <div className="palace-lens__controls">
          <button
            type="button"
            data-active={mode === "explore" ? "true" : "false"}
            data-testid="palace-mode-explore"
            onClick={() => setMode("explore")}
          >
            Explore
          </button>
          <button
            type="button"
            data-active={mode === "recall" ? "true" : "false"}
            data-testid="palace-mode-recall"
            onClick={() => {
              setMode("recall");
              setRevealed(1);
            }}
          >
            Guided recall
          </button>
          {onPersistWalk && (
            <button
              type="button"
              data-testid="palace-persist-walk"
              onClick={persistWalk}
            >
              Persist palace walk
            </button>
          )}
          <span
            className="palace-lens__save-state"
            data-state={saveState}
            data-testid="palace-save-state"
          >
            {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : "Saved"}
          </span>
        </div>
      </header>

      {mode === "recall" && (
        <div className="palace-lens__recall" data-testid="palace-recall">
          <p>
            Revealed {Math.min(revealed, walkable.length)} of {walkable.length} chambers
          </p>
          {revealed < walkable.length && (
            <button
              type="button"
              data-testid="palace-reveal-next"
              onClick={() => setRevealed((count) => count + 1)}
            >
              Reveal next
            </button>
          )}
          {revealed >= walkable.length && walkable.length > 0 && (
            <button
              type="button"
              data-testid="palace-recall-restart"
              onClick={() => setRevealed(1)}
            >
              Restart recall
            </button>
          )}
        </div>
      )}

      {walkable.length === 0 ? (
        <p className="palace-lens__empty" data-testid="palace-empty">
          The graph produced no walkable chambers for this profile.
        </p>
      ) : (
        <ol className="palace-lens__chambers" data-testid="palace-chambers">
          {revealedChambers.map((chamber, index) => {
            const candidate = candidates.find(
              (item) => item.id === chamber.candidateId,
            );
            const members = candidate?.memberNodeIds
              .map((memberId) => nodesById.get(memberId)?.title ?? memberId)
              .slice(0, MAX_MEMBER_CHIPS) ?? [];
            const memberTotal = candidate?.memberNodeIds.length ?? 0;
            const neighbours = neighborChambers.get(chamber.candidateId) ?? [];
            const isCurrent = mode === "recall" && index === revealed - 1;
            return (
              <li
                key={chamber.candidateId}
                className="palace-lens__chamber"
                data-current={isCurrent ? "true" : "false"}
                data-pinned={chamber.pinned ? "true" : "false"}
                data-testid={`palace-chamber-${chamber.candidateId}`}
              >
                {renameTarget === chamber.candidateId ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      try {
                        commit(renameChamber(curation, chamber.candidateId, renameDraft));
                      } finally {
                        setRenameTarget(null);
                      }
                    }}
                  >
                    <input
                      value={renameDraft}
                      data-testid={`palace-rename-input-${chamber.candidateId}`}
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                    <button type="submit" data-testid="palace-rename-confirm">
                      Save name
                    </button>
                  </form>
                ) : (
                  <h3>{chamber.title}</h3>
                )}
                <p className="palace-lens__anchor">
                  Anchor:{" "}
                  {nodesById.get(chamber.anchorGraphNodeId)?.title ??
                    chamber.anchorGraphNodeId}
                </p>
                <ul className="palace-lens__members">
                  {members.map((member) => (
                    <li key={member}>{member}</li>
                  ))}
                  {memberTotal > MAX_MEMBER_CHIPS && (
                    <li className="palace-lens__more">
                      +{memberTotal - MAX_MEMBER_CHIPS} more
                    </li>
                  )}
                </ul>
                {neighbours.length > 0 && (
                  <p className="palace-lens__paths">
                    Paths to: {neighbours.join(", ")}
                  </p>
                )}
                {mode === "explore" && (
                  <div className="palace-lens__actions">
                    <button
                      type="button"
                      data-testid={`palace-up-${chamber.candidateId}`}
                      onClick={() => {
                        const position = Math.max(0, chamber.position - 1);
                        commit(reorderChamber(curation, chamber.candidateId, position));
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-testid={`palace-down-${chamber.candidateId}`}
                      onClick={() => {
                        commit(
                          reorderChamber(curation, chamber.candidateId, chamber.position + 1),
                        );
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      data-testid={`palace-pin-${chamber.candidateId}`}
                      data-pinned={chamber.pinned ? "true" : "false"}
                      onClick={() => commit(pinChamber(curation, chamber.candidateId))}
                    >
                      {chamber.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      data-testid={`palace-exclude-${chamber.candidateId}`}
                      onClick={() => commit(excludeChamber(curation, chamber.candidateId))}
                    >
                      Exclude
                    </button>
                    <button
                      type="button"
                      data-testid={`palace-rename-${chamber.candidateId}`}
                      onClick={() => startRename(chamber.candidateId, chamber.title)}
                    >
                      Rename
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function chamberNeighbors(
  chambers: PalaceCuration["chambers"],
  candidates: ChamberCandidate[],
  relationships: GraphRelationship[],
): Map<string, string[]> {
  const byId = new Map(chambers.map((chamber) => [chamber.candidateId, chamber]));
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const neighbours = new Map<string, Set<string>>();
  for (const chamber of chambers) {
    neighbours.set(chamber.candidateId, new Set());
  }
  const edgePairs: Array<[string, string]> = [];
  for (const relationship of relationships) {
    const source = chamberForNode(relationship.sourceGraphNodeId, candidateById);
    const target = chamberForNode(relationship.targetGraphNodeId, candidateById);
    if (source && target && source !== target) {
      edgePairs.push([source, target]);
    }
  }
  for (const [source, target] of edgePairs) {
    neighbours.get(source)?.add(target);
    neighbours.get(target)?.add(source);
  }
  const result = new Map<string, string[]>();
  for (const [chamberId, set] of neighbours) {
    result.set(
      chamberId,
      [...set]
        .filter((id) => byId.has(id))
        .map((id) => byId.get(id)?.title ?? id),
    );
  }
  return result;
}

function chamberForNode(
  graphNodeId: string,
  candidateById: Map<string, ChamberCandidate>,
): string | null {
  for (const candidate of candidateById.values()) {
    if (candidate.memberNodeIds.includes(graphNodeId)) {
      return candidate.id;
    }
  }
  return null;
}
