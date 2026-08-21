import type {
  PalaceCorridor,
  PalaceLayout,
  PalaceRoom,
  PalaceWallFace,
  PalaceWallObject,
} from "@research-canvas/domain";
import type { GraphNode } from "@research-canvas/desktop-api";
import { useState, type JSX, type ReactNode } from "react";

interface PalaceEditorProps {
  layout: PalaceLayout;
  nodes: GraphNode[];
  onChange: (layout: PalaceLayout) => void | Promise<void>;
  onGenerate: () => void | Promise<void>;
  children: ReactNode;
}

const FACES: PalaceWallFace[] = ["north", "south", "east", "west", "floor", "ceiling"];

/**
 * Thin authoring shell over the mature 3D Palace. It edits only presentation
 * layout; semantic graph nodes/edges are never mutated by these controls.
 */
export function PalaceEditor({
  layout,
  nodes,
  onChange,
  onGenerate,
  children,
}: PalaceEditorProps): JSX.Element {
  const [placing, setPlacing] = useState(false);
  const [placeFace, setPlaceFace] = useState<PalaceWallFace>("north");
  const [placeRoomId, setPlaceRoomId] = useState(layout.rooms[0]?.id ?? "");

  const commit = (next: PalaceLayout) => void Promise.resolve(onChange(next));

  const addRoom = () => {
    const index = layout.rooms.length;
    const room: PalaceRoom = {
      id: `manual:room:${crypto.randomUUID()}`,
      graphNodeId: null,
      title: `Room ${index + 1}`,
      position: { x: index * 7, y: 0, z: 0 },
      size: { width: 6, height: 3.6, depth: 6 },
      form: "cube",
    };
    setPlaceRoomId(room.id);
    commit({ ...layout, rooms: [...layout.rooms, room] });
  };

  const deleteRoom = (roomId: string) => {
    commit({
      ...layout,
      rooms: layout.rooms.filter((room) => room.id !== roomId),
      corridors: layout.corridors.filter(
        (corridor) => corridor.sourceRoomId !== roomId && corridor.targetRoomId !== roomId,
      ),
      objects: layout.objects.filter((object) => object.roomId !== roomId),
    });
  };

  const addCorridor = () => {
    if (layout.rooms.length < 2) return;
    const source = layout.rooms[layout.rooms.length - 2]!;
    const target = layout.rooms[layout.rooms.length - 1]!;
    if (layout.corridors.some((corridor) =>
      (corridor.sourceRoomId === source.id && corridor.targetRoomId === target.id)
      || (corridor.sourceRoomId === target.id && corridor.targetRoomId === source.id))) {
      return;
    }
    const corridor: PalaceCorridor = {
      id: `manual:corridor:${crypto.randomUUID()}`,
      sourceRoomId: source.id,
      targetRoomId: target.id,
      waypoints: [
        { ...source.position },
        {
          x: (source.position.x + target.position.x) / 2,
          y: 0,
          z: (source.position.z + target.position.z) / 2,
        },
        { ...target.position },
      ],
    };
    commit({ ...layout, corridors: [...layout.corridors, corridor] });
  };

  const confirmPlacement = () => {
    const roomId = placeRoomId || layout.rooms[0]?.id;
    if (!roomId) return;
    const node = nodes[0] ?? null;
    const object: PalaceWallObject = {
      id: `manual:object:${crypto.randomUUID()}`,
      graphNodeId: node?.graphNodeId ?? null,
      sceneId: null,
      assetId: null,
      roomId,
      face: placeFace,
      offset: { x: 0, y: 1.4 },
      kind: "node",
    };
    commit({ ...layout, objects: [...layout.objects, object] });
    setPlacing(false);
  };

  return (
    <section className="palace-editor" data-testid="palace-editor">
      <div className="palace-editor__toolbar" data-testid="palace-toolbar">
        <button type="button" data-testid="palace-generate" onClick={() => void onGenerate()}>
          Generate from constellation
        </button>
        <button type="button" data-testid="palace-add-room" onClick={addRoom}>
          Add room
        </button>
        <button
          type="button"
          data-testid="palace-add-corridor"
          disabled={layout.rooms.length < 2}
          onClick={addCorridor}
        >
          Add corridor
        </button>
        <button
          type="button"
          data-testid="palace-place-object"
          disabled={layout.rooms.length === 0}
          data-active={placing ? "true" : undefined}
          onClick={() => setPlacing((value) => !value)}
        >
          Place object
        </button>
      </div>

      {placing && (
        <div className="palace-editor__placement" data-testid="palace-placement-editor">
          <label>
            Room
            <select
              data-testid="palace-place-room"
              value={placeRoomId || layout.rooms[0]?.id || ""}
              onChange={(event) => setPlaceRoomId(event.target.value)}
            >
              {layout.rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.title}</option>
              ))}
            </select>
          </label>
          <div data-testid="palace-wall-faces" aria-label="Wall face">
            {FACES.map((face) => (
              <button
                key={face}
                type="button"
                data-testid={`palace-wall-face-${face}`}
                data-active={placeFace === face ? "true" : undefined}
                onClick={() => setPlaceFace(face)}
              >
                {face}
              </button>
            ))}
          </div>
          <div data-testid="palace-place-ghost">
            Ghost · {placeFace} face
          </div>
          <button type="button" data-testid="palace-place-confirm" onClick={confirmPlacement}>
            Confirm placement
          </button>
        </div>
      )}

      {children}

      <div className="palace-editor__panels">
        <aside data-testid="palace-rooms-panel">
          <h3>Layout rooms</h3>
          <ol>
            {layout.rooms.map((room) => (
              <li key={room.id} data-testid={`palace-room-${room.id}`}>
                <span>{room.title}</span>
                <button
                  type="button"
                  aria-label={`Delete ${room.title}`}
                  data-testid={`palace-delete-room-${room.id}`}
                  onClick={() => deleteRoom(room.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <aside data-testid="palace-layout-corridors-panel">
          <h3>Layout corridors</h3>
          <ol>
            {layout.corridors.map((corridor) => (
              <li key={corridor.id} data-testid={`palace-corridor-${corridor.id}`}>
                {corridor.sourceRoomId} → {corridor.targetRoomId}
              </li>
            ))}
          </ol>
        </aside>

        <aside data-testid="palace-wall-objects-panel">
          <h3>Wall objects</h3>
          <ol>
            {layout.objects.map((object) => (
              <li
                key={object.id}
                data-testid={`palace-wall-object-${object.id}`}
                data-face={object.face}
              >
                {object.graphNodeId ?? object.sceneId ?? object.assetId ?? "Placed object"} · {object.face}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}
