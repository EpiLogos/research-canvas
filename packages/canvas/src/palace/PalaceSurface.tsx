import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import { Canvas } from "@react-three/fiber";
import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { clusterChambers } from "./clustering";
import {
  excludeChamber,
  pinChamber,
  renameChamber,
  reorderChamber,
  type PalaceCuration,
} from "./curation";
import { roomEntryPose, type CameraPose } from "./camera";
import type { EncapsulationEdgeInput } from "./encapsulation";
import { unfoldConstellation } from "./encapsulation";
import {
  buildPalaceWalkScenes,
  buildPalaceWalkSequence,
  type PalaceViewMode,
} from "./palaceWalk";
import { PalaceSceneGraph } from "./PalaceSceneGraph";
import type { PalaceScene } from "./renderer";
import { probeWebGl2 } from "./webgl";

/**
 * The 3D palace surface (refinement-2 D5): a real spatial memory place.
 * Consumes the pure `PalaceScene` from `renderer.ts` and mounts it in a
 * WebGL2 scene graph via @react-three/fiber. Curation (pin/exclude/rename/
 * reorder) is surfaced beside the 3D view and persists through the layout
 * store — placement is curation, never a graph write. Guided recall reuses
 * the scene-sequence machinery over the curated palace walk, and compressed
 * constellations unfold on entry (0/1) and compress back on exit (1/0).
 *
 * WebGL2 is probed before mounting; when unavailable the curation overlays
 * still render with a clear error banner (tested in jsdom, where the harness
 * returns a 2D context and the probe reports unsupported).
 */

export interface PalaceSurfaceProps {
  scene: PalaceScene;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  encapsulationEdges: EncapsulationEdgeInput[];
  curation: PalaceCuration;
  /**
   * Persist curation changes through the layout store. Required in the
   * desktop; the read-only public viewer renders without it (readOnly).
   */
  onSaveCuration?: (curation: PalaceCuration) => void | Promise<void>;
  onPersistWalk?: (walk: { sequence: SceneSequence; scenes: Scene[] }) => void | Promise<void>;
  /** Serialize + write palace-bundle.json for the public viewer. */
  onExportBundle?: () => void | Promise<void>;
  /** Read-only web-layer mode: hide curation mutations, keep navigation. */
  readOnly?: boolean;
}

export function PalaceSurface({
  scene,
  nodes,
  relationships,
  encapsulationEdges,
  curation: curationProp,
  onSaveCuration,
  onPersistWalk,
  onExportBundle,
  readOnly = false,
}: PalaceSurfaceProps): JSX.Element {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const webgl = useMemo(() => probeWebGl2(), []);
  const [curation, setCuration] = useState<PalaceCuration>(curationProp);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [mode, setMode] = useState<PalaceViewMode>("explore");
  const [revealed, setRevealed] = useState(1);
  const [nextRoomIndex, setNextRoomIndex] = useState(0);
  const [flightTarget, setFlightTarget] = useState<CameraPose | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.graphNodeId, node])),
    [nodes],
  );
  const roomById = useMemo(
    () => new Map(scene.rooms.map((room) => [room.id, room])),
    [scene.rooms],
  );

  // Adopt a freshly loaded persisted curation until the user edits locally.
  useEffect(() => {
    if (!dirty) setCuration(curationProp);
  }, [curationProp, dirty]);

  const commit = useCallback(
    (next: PalaceCuration) => {
      setCuration(next);
      setDirty(true);
      if (readOnly || !onSaveCuration) {
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      Promise.resolve(onSaveCuration(next))
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("failed"));
    },
    [readOnly, onSaveCuration],
  );

  const flyToRoom = useCallback(
    (roomId: string) => {
      const room = roomById.get(roomId);
      if (!room) return;
      setActiveConstellationId(null);
      setFlightTarget(roomEntryPose(room));
    },
    [roomById],
  );

  const activeConstellation = useMemo(
    () =>
      activeConstellationId
        ? unfoldConstellation(activeConstellationId, nodes, relationships, encapsulationEdges)
        : null,
    [activeConstellationId, nodes, relationships, encapsulationEdges],
  );

  const activeConstellationObject = useMemo(
    () =>
      activeConstellationId
        ? (scene.objects.find(
            (object) =>
              object.graphNodeId === activeConstellationId &&
              object.kind === "compressedConstellation",
          ) ?? null)
        : null,
    [activeConstellationId, scene.objects],
  );

  const enterConstellation = useCallback(
    (objectId: string, containerNodeId: string) => {
      const object = scene.objects.find((candidate) => candidate.id === objectId);
      if (!object) return;
      setActiveConstellationId(containerNodeId);
      const position = object.placement.position;
      setFlightTarget({
        x: position.x + 2.2,
        y: position.y + 1.0,
        z: position.z + 2.2,
        yaw: Math.PI / 4,
        pitch: -0.1,
      });
    },
    [scene.objects],
  );

  const exitConstellation = useCallback(() => {
    const roomId = activeConstellationObject?.roomId;
    setActiveConstellationId(null);
    if (roomId) flyToRoom(roomId);
  }, [activeConstellationObject, flyToRoom]);

  const persistWalk = useCallback(() => {
    if (!onPersistWalk) return;
    const candidates = clusterChambers(nodes, relationships);
    const { scenes } = buildPalaceWalkScenes(
      curation,
      candidates,
      nodesById,
      scene.profileScope,
    );
    if (scenes.length === 0) return;
    const sequence = buildPalaceWalkSequence(curation, scenes, scene.profileScope);
    void onPersistWalk({ sequence, scenes });
  }, [curation, nodes, relationships, nodesById, scene.profileScope, onPersistWalk]);

  const handlePoseChange = useCallback((pose: CameraPose) => {
    const element = surfaceRef.current;
    element?.setAttribute(
      "data-camera",
      `${pose.x.toFixed(2)},${pose.y.toFixed(2)},${pose.z.toFixed(2)}`,
    );
  }, []);

  const handleArrive = useCallback(() => setFlightTarget(null), []);

  const flyToNextRoom = useCallback(() => {
    if (scene.walkOrder.length === 0) return;
    const next = (nextRoomIndex + 1) % scene.walkOrder.length;
    setNextRoomIndex(next);
    flyToRoom(scene.walkOrder[next]);
  }, [scene.walkOrder, nextRoomIndex, flyToRoom]);

  const startRecall = useCallback(() => {
    setMode("recall");
    setRevealed(1);
    if (scene.walkOrder.length > 0) flyToRoom(scene.walkOrder[0]);
  }, [scene.walkOrder, flyToRoom]);

  const revealNext = useCallback(() => {
    const next = Math.min(revealed + 1, scene.walkOrder.length);
    setRevealed(next);
    const roomId = scene.walkOrder[next - 1];
    if (roomId) flyToRoom(roomId);
  }, [revealed, scene.walkOrder, flyToRoom]);

  const restartRecall = useCallback(() => {
    setRevealed(1);
    if (scene.walkOrder.length > 0) flyToRoom(scene.walkOrder[0]);
  }, [scene.walkOrder, flyToRoom]);

  const revealedRooms = useMemo(
    () => (mode === "recall" ? scene.walkOrder.slice(0, revealed) : []),
    [mode, revealed, scene.walkOrder],
  );

  const startRename = (roomId: string, currentTitle: string) => {
    setRenameTarget(roomId);
    setRenameDraft(currentTitle);
  };

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const isEmpty = scene.rooms.length === 0;

  return (
    <section
      className="palace-host"
      data-testid="palace-surface"
      ref={surfaceRef}
      data-mode={mode}
    >
      <header className="palace-lens__header">
        <div>
          <p className="palace-lens__eyebrow">{scene.profileScope} profile · 3D mind palace</p>
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
            onClick={startRecall}
          >
            Guided recall
          </button>
          <button type="button" data-testid="palace-fly-next" onClick={flyToNextRoom}>
            Fly to next chamber
          </button>
          {onExportBundle && (
            <button type="button" data-testid="palace-export-bundle" onClick={() => void onExportBundle()}>
              Export palace bundle
            </button>
          )}
          {!readOnly && onPersistWalk && (
            <button type="button" data-testid="palace-persist-walk" onClick={persistWalk}>
              Persist palace walk
            </button>
          )}
          {!readOnly && (
            <span
              className="palace-lens__save-state"
              data-state={saveState}
              data-testid="palace-save-state"
            >
              {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : "Saved"}
            </span>
          )}
        </div>
      </header>

      {mode === "recall" && (
        <div className="palace-lens__recall" data-testid="palace-recall">
          <p>
            Revealed {Math.min(revealed, scene.walkOrder.length)} of {scene.walkOrder.length} chambers
          </p>
          {revealed < scene.walkOrder.length && (
            <button type="button" data-testid="palace-reveal-next" onClick={revealNext}>
              Reveal next
            </button>
          )}
          {revealed >= scene.walkOrder.length && scene.walkOrder.length > 0 && (
            <button type="button" data-testid="palace-recall-restart" onClick={restartRecall}>
              Restart recall
            </button>
          )}
        </div>
      )}

      {isEmpty ? (
        <div className="palace-lens__empty" data-testid="palace-empty">
          <p>The graph produced no walkable chambers for this profile.</p>
          <p className="palace-lens__empty-hint">
            Chambers form from related graph nodes; add relationships or curation
            to generate a navigable space.
          </p>
        </div>
      ) : (
        <>
          <div className="palace-surface__viewport" data-testid="palace-canvas">
            {webgl.supported ? (
              <Canvas
                camera={{ fov: 60, near: 0.1, far: 200, position: [0, 1.6, 6] }}
                dpr={[1, 2]}
                gl={{ antialias: true, powerPreference: "default" }}
              >
                <PalaceSceneGraph
                  scene={scene}
                  revealedRooms={revealedRooms}
                  mode={mode}
                  flightTarget={flightTarget}
                  activeConstellation={activeConstellation}
                  activeConstellationObject={activeConstellationObject}
                  onEnterConstellation={enterConstellation}
                  onExitConstellation={exitConstellation}
                  onPoseChange={handlePoseChange}
                  onArrive={handleArrive}
                />
              </Canvas>
            ) : (
              <div className="palace-surface__error" role="alert" data-testid="palace-error">
                3D palace unavailable: {webgl.error ?? "WebGL2 is not supported"}
              </div>
            )}
          </div>

          {activeConstellation && (
            <div className="palace-surface__constellation" data-testid="palace-constellation-open">
              <p>
                Unfolded: <strong>{activeConstellation.container.title}</strong> (
                {activeConstellation.members.length} members)
              </p>
              <button type="button" data-testid="palace-exit" onClick={exitConstellation}>
                Exit (compress)
              </button>
            </div>
          )}

          <div className="palace-surface__panels">
            <aside className="palace-surface__panel" data-testid="palace-chambers-panel">
              <h3>Chambers</h3>
              <ol className="palace-lens__chambers" data-testid="palace-chambers">
                {scene.rooms.map((room) => (
                  <li
                    key={room.id}
                    className="palace-lens__chamber"
                    data-pinned={
                      curation.chambers.find((chamber) => chamber.candidateId === room.id)
                        ?.pinned
                        ? "true"
                        : "false"
                    }
                    data-testid={`palace-chamber-${room.id}`}
                  >
                    {renameTarget === room.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          try {
                            commit(renameChamber(curation, room.id, renameDraft));
                          } finally {
                            setRenameTarget(null);
                          }
                        }}
                      >
                        <input
                          value={renameDraft}
                          data-testid={`palace-rename-input-${room.id}`}
                          onChange={(event) => setRenameDraft(event.target.value)}
                        />
                        <button type="submit" data-testid="palace-rename-confirm">
                          Save name
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="palace-lens__chamber-title"
                        data-testid={`palace-fly-${room.id}`}
                        onClick={() => flyToRoom(room.id)}
                        title="Fly to this chamber"
                      >
                        {room.title}
                      </button>
                    )}
                    {!readOnly && (
                      <div className="palace-lens__actions">
                        <button
                          type="button"
                          data-testid={`palace-up-${room.id}`}
                          onClick={() => {
                            const position = Math.max(0, roomIndex(curation, room.id) - 1);
                            commit(reorderChamber(curation, room.id, position));
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          data-testid={`palace-down-${room.id}`}
                          onClick={() =>
                            commit(
                              reorderChamber(curation, room.id, roomIndex(curation, room.id) + 1),
                            )
                          }
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          data-testid={`palace-pin-${room.id}`}
                          data-pinned={
                            curation.chambers.find((chamber) => chamber.candidateId === room.id)
                              ?.pinned
                              ? "true"
                              : "false"
                          }
                          onClick={() => commit(pinChamber(curation, room.id))}
                        >
                          {curation.chambers.find((chamber) => chamber.candidateId === room.id)
                            ?.pinned
                            ? "Unpin"
                            : "Pin"}
                        </button>
                        <button
                          type="button"
                          data-testid={`palace-exclude-${room.id}`}
                          onClick={() => commit(excludeChamber(curation, room.id))}
                        >
                          Exclude
                        </button>
                        <button
                          type="button"
                          data-testid={`palace-rename-${room.id}`}
                          onClick={() =>
                            startRename(
                              room.id,
                              curation.chambers.find(
                                (chamber) => chamber.candidateId === room.id,
                              )?.title ?? room.title,
                            )
                          }
                        >
                          Rename
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </aside>

            <aside className="palace-surface__panel" data-testid="palace-objects-panel">
              <h3>Objects</h3>
              <ol data-testid="palace-objects">
                {scene.objects
                  .filter((object) => object.placement.surface !== "fixture")
                  .map((object) => (
                    <li
                      key={object.id}
                      data-testid={`palace-object-${object.id}`}
                      data-face={object.placement.face ?? "center"}
                      data-kind={object.kind}
                    >
                      {object.title}
                      {object.placement.face ? ` · ${object.placement.face}` : ""}
                      {object.kind === "compressedConstellation" && (
                        <button
                          type="button"
                          data-testid={`palace-enter-${object.id}`}
                          onClick={() =>
                            object.graphNodeId &&
                            enterConstellation(object.id, object.graphNodeId)
                          }
                        >
                          Enter
                        </button>
                      )}
                    </li>
                  ))}
              </ol>
            </aside>

            <aside className="palace-surface__panel" data-testid="palace-collections-panel">
              <h3>Collections</h3>
              <ol data-testid="palace-collections">
                {scene.collections.map((collection) => (
                  <li
                    key={collection.id}
                    data-testid={`palace-collection-${collection.id}`}
                    data-count={collection.objectIds.length}
                  >
                    {collection.title} ({collection.objectIds.length})
                  </li>
                ))}
              </ol>
            </aside>

            <aside className="palace-surface__panel" data-testid="palace-constellations-panel">
              <h3>Constellation objects</h3>
              <ol data-testid="palace-constellations">
                {scene.constellationObjects.map((constellation) => (
                  <li
                    key={constellation.id}
                    data-testid={`palace-constellation-${constellation.id}`}
                    data-members={constellation.nodes.length}
                  >
                    {constellation.title} ({constellation.nodes.length} nodes)
                  </li>
                ))}
              </ol>
            </aside>
          </div>

          <div className="palace-surface__walk" data-testid="palace-walk-chambers">
            <span>Walk order:</span>
            {scene.walkOrder.map((roomId) => (
              <span
                key={roomId}
                data-testid={`palace-walk-${roomId}`}
                data-revealed={mode === "recall" && !revealedRooms.includes(roomId) ? "false" : "true"}
              >
                {roomById.get(roomId)?.title ?? roomId}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function roomIndex(curation: PalaceCuration, roomId: string): number {
  return curation.chambers.findIndex((chamber) => chamber.candidateId === roomId);
}
