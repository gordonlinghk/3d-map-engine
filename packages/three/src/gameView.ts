import * as THREE from 'three';
import type { GameSimulation, Unit, UnitId } from '@map-engine/game';
import type { ThreeMapRenderer } from './renderer';

/** Marker color by unit kind — extend as new unit kinds are introduced. */
const KIND_COLORS: Record<string, string> = {
  soldier: '#c0392b',
  cart: '#2d7dd2',
};
const DEFAULT_COLOR = '#e0b53a';

export type GameViewOptions = {
  /** Factory for a unit's 3D object. Default: a small colored arrow marker. */
  unitObject?: (unit: Unit) => THREE.Object3D;
  /** Marker color per factionId; wins over kind color. */
  factionColors?: Record<string, string>;
};

export interface GameView {
  readonly group: THREE.Group;
  readonly simulation: GameSimulation;
  /** Follow a unit with the camera; pass null to stop following. */
  followUnit(id: UnitId | null): void;
  /** Raycast unit markers at client pixel coords (same convention as renderer.pickObject). */
  pickUnit(pointer: { x: number; y: number }): UnitId | null;
  selectUnit(id: UnitId | null): void;
  getSelectedUnit(): UnitId | null;
  /** Detach everything: unsubscribe, remove + dispose meshes, stop follow. */
  dispose(): void;
}

/**
 * A small upright cone marker. Heading = atan2(dirX, dirZ), so rotation.y
 * applied to an object facing +Z at rest turns it to face the travel
 * direction — hence the cone apex is oriented toward +Z here.
 */
function defaultMarker(unit: Unit, factionColors?: Record<string, string>): THREE.Object3D {
  const marker = new THREE.Group();
  const color =
    (unit.factionId !== null ? factionColors?.[unit.factionId] : undefined) ??
    KIND_COLORS[unit.kind] ??
    DEFAULT_COLOR;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 5, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  cone.rotation.x = Math.PI / 2; // apex now points along +Z instead of +Y
  cone.position.y = 3; // lift above ground
  marker.add(cone);
  return marker;
}

/** Flat ring geometry marking the selected unit, named `'game:selection'`. */
function createSelectionRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(3, 4.2, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffe27a',
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = 'game:selection';
  ring.visible = false;
  ring.renderOrder = 10;
  return ring;
}

export function createGameView(
  renderer: ThreeMapRenderer,
  simulation: GameSimulation,
  options?: GameViewOptions,
): GameView {
  const group = new THREE.Group();
  group.name = 'game';
  renderer.scene.add(group);

  const objects = new Map<UnitId, THREE.Object3D>();
  // Reverse index: top-level unit object → unit id, for pickUnit's parent walk.
  const unitByObject = new Map<THREE.Object3D, UnitId>();
  let followId: UnitId | null = null;
  let selectedId: UnitId | null = null;
  const selectionRing = createSelectionRing();
  group.add(selectionRing);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const addUnit = (unit: Unit): void => {
    const obj = options?.unitObject?.(unit) ?? defaultMarker(unit, options?.factionColors);
    obj.name = `game:unit:${unit.id}`;
    obj.position.set(unit.position.x, unit.position.y, unit.position.z);
    obj.rotation.y = unit.heading;
    group.add(obj);
    objects.set(unit.id, obj);
    unitByObject.set(obj, unit.id);
  };

  const removeMesh = (id: UnitId): void => {
    const obj = objects.get(id);
    if (!obj) return;
    group.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    objects.delete(id);
    unitByObject.delete(obj);
    if (followId === id) followUnit(null);
    if (selectedId === id) selectUnit(null);
  };

  for (const unit of simulation.listUnits()) addUnit(unit);

  const off = simulation.on((e) => {
    if (e.type === 'unit:spawned') {
      const unit = simulation.getUnit(e.unitId);
      if (unit) addUnit(unit);
    } else if (e.type === 'unit:removed') {
      removeMesh(e.unitId);
    }
  });

  /** Reposition the selection ring on the selected unit; hide/clear if it's gone. */
  const updateSelectionRing = (): void => {
    if (selectedId === null) return;
    const u = simulation.getUnit(selectedId);
    if (!u) {
      selectedId = null;
      selectionRing.visible = false;
      return;
    }
    selectionRing.visible = true;
    selectionRing.position.set(u.position.x, u.position.y + 0.5, u.position.z);
  };

  const sync = (): void => {
    for (const [id, obj] of objects) {
      const u = simulation.getUnit(id);
      if (!u) continue;
      obj.position.set(u.position.x, u.position.y, u.position.z);
      obj.rotation.y = u.heading;
    }
    updateSelectionRing();
  };

  const offFrame = renderer.onFrame((dt) => {
    simulation.tick(dt);
    sync();
  });

  function followUnit(id: UnitId | null): void {
    if (id === null) {
      followId = null;
      renderer.setFollowTarget(null);
      return;
    }
    followId = id;
    renderer.setFollowTarget(() => {
      const u = simulation.getUnit(id);
      return u ? { x: u.position.x, y: u.position.y, z: u.position.z } : null;
    });
  }

  function selectUnit(id: UnitId | null): void {
    selectedId = id;
    if (id === null) {
      selectionRing.visible = false;
      return;
    }
    updateSelectionRing();
  }

  function getSelectedUnit(): UnitId | null {
    return selectedId;
  }

  function pickUnit(pointer: { x: number; y: number }): UnitId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((pointer.x - rect.left) / rect.width) * 2 - 1,
      -(((pointer.y - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, renderer.camera);
    const hits = raycaster.intersectObjects(group.children, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !unitByObject.has(o)) o = o.parent;
      if (o) {
        const id = unitByObject.get(o);
        if (id !== undefined) return id;
      }
    }
    return null;
  }

  return {
    group,
    simulation,
    followUnit,
    pickUnit,
    selectUnit,
    getSelectedUnit,
    dispose(): void {
      off();
      offFrame();
      renderer.setFollowTarget(null);
      for (const id of [...objects.keys()]) removeMesh(id);
      group.remove(selectionRing);
      selectionRing.geometry.dispose();
      (selectionRing.material as THREE.Material).dispose();
      renderer.scene.remove(group);
    },
  };
}
