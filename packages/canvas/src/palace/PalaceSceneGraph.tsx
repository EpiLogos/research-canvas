import { useEffect, useMemo, useRef, type JSX } from "react";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  advancePose,
  easePoseToward,
  lookByDeltas,
  planarDistanceSquared,
  roomEntryPose,
  type CameraPose,
  type InputState,
} from "./camera";
import type { InternalConstellation } from "./encapsulation";
import type {
  ConstellationObjectScene,
  PalaceCollectionScene,
  PalaceConnectionScene,
  PalaceFixtureScene,
  PalaceObjectScene,
  PalaceRoomScene,
  PalaceScene,
} from "./renderer";

/**
 * The three.js scene graph for the 3D palace (refinement-2 D5). Rooms are
 * hollow boxes (BackSide), objects sit on floor/plinth/fixture placements,
 * wall fixtures are planes on the six named faces, each chamber hosts a
 * constellation object (its real subgraph laid out in 3D), corridors connect
 * rooms, and a first-person `CameraRig` walks the space. Everything consumes
 * the pure `PalaceScene` model from `renderer.ts`; the WebGL mount is verified
 * by the Playwright e2e asserting real rendered frames.
 */

export interface PalaceSceneGraphProps {
  scene: PalaceScene;
  /** Rooms revealed in guided recall (walk order prefix); empty = all. */
  revealedRooms: string[];
  mode: "explore" | "recall";
  /** A one-shot flight target (fly-to / recall advance). Cleared on arrival. */
  flightTarget: CameraPose | null;
  /** The constellation interior currently being entered, if any. */
  activeConstellation: InternalConstellation | null;
  /** The palace object representing the active constellation (its placement). */
  activeConstellationObject: PalaceObjectScene | null;
  onEnterConstellation: (objectId: string, containerNodeId: string) => void;
  onExitConstellation: () => void;
  onPoseChange: (pose: CameraPose) => void;
  onArrive: () => void;
}

const ROOM_COLOR = "#1c2634";
const CORRIDOR_COLOR = "#33404f";
const EVENT_COLOR = "#c9b8ff";
const PLACE_COLOR = "#8ab4f8";
const IMAGE_COLOR = "#f0e6d2";
const COMPRESSED_COLOR = "#ffd479";
const NODE_COLOR = "#c9b8ff";
const EDGE_COLOR = "#8ab4f8";
const PLAQUE_COLOR = "#c9a86a";
const PANEL_COLOR = "#d9e2f0";
const SHELF_COLOR = "#2c3a4a";

export function PalaceSceneGraph(props: PalaceSceneGraphProps): JSX.Element {
  const {
    scene,
    revealedRooms,
    mode,
    flightTarget,
    activeConstellation,
    activeConstellationObject,
    onEnterConstellation,
    onExitConstellation,
    onPoseChange,
    onArrive,
  } = props;

  const initialPose = useMemo(() => {
    const entry = scene.rooms.find((room) => room.id === scene.entryRoomId);
    return entry ? roomEntryPose(entry) : { x: 0, y: 1.6, z: 6, yaw: 0, pitch: 0 };
  }, [scene.entryRoomId, scene.rooms]);

  const roomById = useMemo(
    () => new Map(scene.rooms.map((room) => [room.id, room])),
    [scene.rooms],
  );

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 6]} intensity={0.9} />
      <pointLight position={[0, 6, 0]} intensity={0.35} />

      <PalaceRooms rooms={scene.rooms} revealedRooms={revealedRooms} />
      <PalaceConnections connections={scene.connections} />
      <PalaceCollections collections={scene.collections} roomById={roomById} />
      <PalaceFixtures fixtures={scene.fixtures} />

      {activeConstellation && activeConstellationObject ? (
        <ConstellationInterior
          constellation={activeConstellation}
          at={activeConstellationObject.placement.position}
          onExit={onExitConstellation}
        />
      ) : (
        <>
          <PalaceObjects
            objects={scene.objects}
            revealedRooms={revealedRooms}
            onEnterConstellation={onEnterConstellation}
          />
          <PalaceConstellations
            constellationObjects={scene.constellationObjects}
            revealedRooms={revealedRooms}
          />
        </>
      )}

      <CameraRig
        initial={initialPose}
        flightTarget={flightTarget}
        mode={mode}
        onPoseChange={onPoseChange}
        onArrive={onArrive}
      />
    </>
  );
}

function PalaceRooms({
  rooms,
  revealedRooms,
}: {
  rooms: PalaceRoomScene[];
  revealedRooms: string[];
}): JSX.Element {
  const visible = useMemo(() => new Set(revealedRooms), [revealedRooms]);
  return (
    <>
      {rooms.map((room) => {
        const { width, height, depth } = room.size;
        return (
          <mesh
            key={room.id}
            position={[room.center.x, room.center.y + height / 2, room.center.z]}
            rotation={[0, room.rotationY, 0]}
            visible={visible.size === 0 || visible.has(room.id)}
          >
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial color={ROOM_COLOR} side={THREE.BackSide} />
          </mesh>
        );
      })}
    </>
  );
}

function PalaceConnections({
  connections,
}: {
  connections: PalaceConnectionScene[];
}): JSX.Element {
  return (
    <>
      {connections.map((connection) => {
        const [a, b] = connection.path;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.max(Math.hypot(dx, dz), 0.1);
        const angle = Math.atan2(dx, dz);
        return (
          <mesh
            key={connection.id}
            position={[(a.x + b.x) / 2, 0.04, (a.z + b.z) / 2]}
            rotation={[0, angle, 0]}
          >
            <boxGeometry args={[0.6, 0.08, length]} />
            <meshStandardMaterial color={CORRIDOR_COLOR} />
          </mesh>
        );
      })}
    </>
  );
}

function PalaceCollections({
  collections,
  roomById,
}: {
  collections: PalaceCollectionScene[];
  roomById: Map<string, PalaceRoomScene>;
}): JSX.Element {
  return (
    <>
      {collections.map((collection) => {
        const room = roomById.get(collection.roomId);
        if (!room) return null;
        const shelfHeight = 1.1 + (collection.position.shelf % 3) * 0.45;
        const x = room.center.x - room.size.width / 2 + 0.6;
        const z = room.center.z - room.size.depth / 2 + 0.6;
        return (
          <mesh key={collection.id} position={[x, shelfHeight, z]}>
            <boxGeometry args={[1.2, 0.08, 0.9]} />
            <meshStandardMaterial
              color={SHELF_COLOR}
              transparent
              opacity={0.85}
            />
          </mesh>
        );
      })}
    </>
  );
}

function PalaceFixtures({
  fixtures,
}: {
  fixtures: PalaceFixtureScene[];
}): JSX.Element {
  return (
    <>
      {fixtures.map((fixture) => {
        const color =
          fixture.kind === "titlePlaque"
            ? PLAQUE_COLOR
            : fixture.kind === "imageFrame"
              ? EVENT_COLOR
              : PANEL_COLOR;
        let rotation: [number, number, number] = [0, fixture.rotationY, 0];
        if (fixture.face === "floor") rotation = [-Math.PI / 2, 0, 0];
        if (fixture.face === "ceiling") rotation = [Math.PI / 2, 0, 0];
        return (
          <mesh
            key={fixture.id}
            position={[fixture.anchor.x, fixture.anchor.y, fixture.anchor.z]}
            rotation={rotation}
          >
            <planeGeometry args={[fixture.width, fixture.height]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </>
  );
}

function PalaceObjects({
  objects,
  revealedRooms,
  onEnterConstellation,
}: {
  objects: PalaceObjectScene[];
  revealedRooms: string[];
  onEnterConstellation: (objectId: string, containerNodeId: string) => void;
}): JSX.Element {
  const visible = useMemo(() => new Set(revealedRooms), [revealedRooms]);
  return (
    <>
      {objects.map((object) => {
        if (object.placement.surface === "fixture") return null;
        if (visible.size > 0 && !visible.has(object.roomId)) return null;
        const position: [number, number, number] = [
          object.placement.position.x,
          object.placement.position.y,
          object.placement.position.z,
        ];
        if (object.kind === "compressedConstellation" && object.graphNodeId) {
          return (
            <mesh
              key={object.id}
              position={position}
              onClick={(event) => {
                event.stopPropagation();
                onEnterConstellation(object.id, object.graphNodeId as string);
              }}
            >
              <icosahedronGeometry args={[0.28, 0]} />
              <meshStandardMaterial
                color={COMPRESSED_COLOR}
                emissive="#b36b00"
                emissiveIntensity={0.35}
              />
            </mesh>
          );
        }
        const color =
          object.kind === "event"
            ? EVENT_COLOR
            : object.kind === "place"
              ? PLACE_COLOR
              : IMAGE_COLOR;
        return (
          <mesh
            key={object.id}
            position={position}
            scale={object.placement.scale}
            rotation={[0, object.placement.rotationY, 0]}
          >
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
    </>
  );
}

function PalaceConstellations({
  constellationObjects,
  revealedRooms,
}: {
  constellationObjects: ConstellationObjectScene[];
  revealedRooms: string[];
}): JSX.Element {
  const visible = useMemo(() => new Set(revealedRooms), [revealedRooms]);
  return (
    <>
      {constellationObjects.map((constellation) => {
        if (visible.size > 0 && !visible.has(constellation.roomId)) return null;
        return (
          <ConstellationGraph key={constellation.id} constellation={constellation} />
        );
      })}
    </>
  );
}

function ConstellationGraph({
  constellation,
}: {
  constellation: ConstellationObjectScene;
}): JSX.Element {
  const edgeGeometry = useMemo(() => {
    const positions: number[] = [];
    const nodeById = new Map(
      constellation.nodes.map((node) => [node.id, node.position]),
    );
    for (const edge of constellation.edges) {
      const a = nodeById.get(edge.source);
      const b = nodeById.get(edge.target);
      if (!a || !b) continue;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return geometry;
  }, [constellation]);

  return (
    <group position={[constellation.center.x, 0.6, constellation.center.z]} scale={constellation.scale}>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.7} />
      </lineSegments>
      {constellation.nodes.map((node) => (
        <mesh key={node.id} position={[node.position.x, node.position.y, node.position.z]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color={NODE_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

function ConstellationInterior({
  constellation,
  at,
  onExit,
}: {
  constellation: InternalConstellation;
  at: { x: number; y: number; z: number };
  onExit: () => void;
}): JSX.Element {
  const memberPositions = useMemo(() => {
    const count = constellation.members.length;
    return constellation.members.map((_, index) => {
      const angle = (index / Math.max(count, 1)) * Math.PI * 2;
      return {
        x: Math.cos(angle) * 1.4,
        y: 0.5 + (index % 2) * 0.4,
        z: Math.sin(angle) * 1.4,
      };
    });
  }, [constellation.members]);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    constellation.members.forEach((member, index) =>
      map.set(member.graphNodeId, index),
    );
    return map;
  }, [constellation.members]);

  const edgeGeometry = useMemo(() => {
    const positions: number[] = [];
    for (const edge of constellation.memberEdges) {
      const aIndex = indexById.get(edge.sourceGraphNodeId);
      const bIndex = indexById.get(edge.targetGraphNodeId);
      if (aIndex === undefined || bIndex === undefined) continue;
      const a = memberPositions[aIndex];
      const b = memberPositions[bIndex];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return geometry;
  }, [constellation.memberEdges, memberPositions, indexById]);

  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[1.9, 1.9, 0.56, 24]} />
        <meshStandardMaterial color="#18222f" side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.8} />
      </lineSegments>
      {constellation.members.map((member, index) => {
        const position = memberPositions[index];
        return (
          <mesh key={member.graphNodeId} position={[position.x, position.y, position.z]}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color={NODE_COLOR} />
          </mesh>
        );
      })}
      <mesh position={[0, 1.3, 0]} onClick={onExit}>
        <boxGeometry args={[0.5, 0.24, 0.5]} />
        <meshStandardMaterial color={COMPRESSED_COLOR} />
      </mesh>
    </group>
  );
}

function CameraRig({
  initial,
  flightTarget,
  mode,
  onPoseChange,
  onArrive,
}: {
  initial: CameraPose;
  flightTarget: CameraPose | null;
  mode: "explore" | "recall";
  onPoseChange: (pose: CameraPose) => void;
  onArrive: () => void;
}): null {
  const { camera, gl } = useThree();
  const pose = useRef<CameraPose>(initial);
  const keys = useRef<Set<string>>(new Set());
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const arriving = useRef(false);

  // Initial pose (spawn at the entry room).
  useEffect(() => {
    pose.current = initial;
    camera.position.set(initial.x, initial.y, initial.z);
    camera.rotation.set(initial.pitch, initial.yaw, 0, "YXZ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard input (WASD + arrows).
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current.add(event.code);
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Pointer-drag look.
  useEffect(() => {
    const element = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      dragging.current = true;
      lastPointer.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.clientX - lastPointer.current.x;
      const dy = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      pose.current = lookByDeltas(pose.current, dx * 0.004, dy * 0.004);
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.05);
    const input: InputState = {
      forward:
        keys.current.has("KeyW") ||
        keys.current.has("ArrowUp"),
      back: keys.current.has("KeyS") || keys.current.has("ArrowDown"),
      strafeLeft: keys.current.has("KeyA") || keys.current.has("ArrowLeft"),
      strafeRight: keys.current.has("KeyD") || keys.current.has("ArrowRight"),
    };
    const moved = advancePose(pose.current, input, 3.5, frameDelta);
    pose.current = { ...moved, y: Math.max(0.4, Math.min(8, moved.y)) };

    if (flightTarget) {
      pose.current = easePoseToward(pose.current, flightTarget, frameDelta, 2.5);
      if (planarDistanceSquared(pose.current, flightTarget) < 0.04) {
        if (!arriving.current) {
          arriving.current = true;
          onArrive();
        }
      } else {
        arriving.current = false;
      }
    }

    camera.position.set(pose.current.x, pose.current.y, pose.current.z);
    camera.rotation.set(pose.current.pitch, pose.current.yaw, 0, "YXZ");
    onPoseChange(pose.current);
  });

  // `mode` is read so recall holds the camera at the revealed room after the
  // flight lands; the callback identity keeps `useFrame` stable.
  void mode;
  return null;
}
