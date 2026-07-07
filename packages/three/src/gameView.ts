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
};

export interface GameView {
  readonly group: THREE.Group;
  readonly simulation: GameSimulation;
  /** Follow a unit with the camera; pass null to stop following. */
  followUnit(id: UnitId | null): void;
  /** Detach everything: unsubscribe, remove + dispose meshes, stop follow. */
  dispose(): void;
}

/**
 * A small upright cone marker. Heading = atan2(dirX, dirZ), so rotation.y
 * applied to an object facing +Z at rest turns it to face the travel
 * direction — hence the cone apex is oriented toward +Z here.
 */
function defaultMarker(unit: Unit): THREE.Object3D {
  const marker = new THREE.Group();
  const color = KIND_COLORS[unit.kind] ?? DEFAULT_COLOR;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 5, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  cone.rotation.x = Math.PI / 2; // apex now points along +Z instead of +Y
  cone.position.y = 3; // lift above ground
  marker.add(cone);
  return marker;
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
  let followId: UnitId | null = null;

  const addUnit = (unit: Unit): void => {
    const obj = options?.unitObject?.(unit) ?? defaultMarker(unit);
    obj.name = `game:unit:${unit.id}`;
    obj.position.set(unit.position.x, unit.position.y, unit.position.z);
    obj.rotation.y = unit.heading;
    group.add(obj);
    objects.set(unit.id, obj);
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
    if (followId === id) followUnit(null);
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

  const sync = (): void => {
    for (const [id, obj] of objects) {
      const u = simulation.getUnit(id);
      if (!u) continue;
      obj.position.set(u.position.x, u.position.y, u.position.z);
      obj.rotation.y = u.heading;
    }
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

  return {
    group,
    simulation,
    followUnit,
    dispose(): void {
      off();
      offFrame();
      renderer.setFollowTarget(null);
      for (const id of [...objects.keys()]) removeMesh(id);
      renderer.scene.remove(group);
    },
  };
}
