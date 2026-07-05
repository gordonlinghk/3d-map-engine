import * as THREE from 'three';
import { createRng, createWorldHeightSampler } from '@map-engine/core';
import type { MapWorld, RoadEdge } from '@map-engine/core';

/**
 * Ambient life: cars driving the road graph, ferries crossing the bay and a
 * plane overhead. Placement is seeded (deterministic per world); motion is
 * frame-time driven.
 */

const ROAD_LIFT = 0.35;
const BRIDGE_CLEARANCE = 7;
const CAR_COLORS = ['#e8e8ea', '#c9ced6', '#3d4754', '#b8433a', '#3a66b8', '#e0b53a', '#d0d5c8'];

type EdgePath = {
  edge: RoadEdge;
  points: THREE.Vector3[];
  cumulative: number[];
  length: number;
};

type Car = {
  path: EdgePath;
  /** Distance along the path. */
  s: number;
  forward: boolean;
  speed: number;
  rng: ReturnType<typeof createRng>;
};

export type SimulationLayer = {
  group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
};

export function createSimulationLayer(world: MapWorld): SimulationLayer {
  const group = new THREE.Group();
  group.name = 'traffic';
  const rng = createRng(`${world.seed}/traffic`);
  const sample = createWorldHeightSampler(world);
  const waterLevel = world.config.waterLevel;
  const nodeById = new Map(world.roadGraph.nodes.map((n) => [n.id, n]));

  // --- Precompute drivable edge paths ---------------------------------------
  const paths: EdgePath[] = [];
  const pathsByNode = new Map<string, EdgePath[]>();
  for (const edge of world.roadGraph.edges) {
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) continue;
    const length = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    if (length < 1) continue;
    const steps = Math.max(1, Math.round(length / 10));
    const points: THREE.Vector3[] = [];
    const cumulative: number[] = [];
    let acc = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.position.x + (b.position.x - a.position.x) * t;
      const z = a.position.z + (b.position.z - a.position.z) * t;
      const groundY = Math.max(sample(x, z), waterLevel) + ROAD_LIFT;
      const y =
        edge.kind === 'bridge' ? Math.max(groundY, waterLevel + BRIDGE_CLEARANCE) : groundY;
      const p = new THREE.Vector3(x, y + 0.7, z);
      if (points.length > 0) acc += p.distanceTo(points[points.length - 1]!);
      points.push(p);
      cumulative.push(acc);
    }
    const path: EdgePath = { edge, points, cumulative, length: acc };
    paths.push(path);
    for (const nodeId of [edge.from, edge.to]) {
      let list = pathsByNode.get(nodeId);
      if (!list) {
        list = [];
        pathsByNode.set(nodeId, list);
      }
      list.push(path);
    }
  }

  const positionAt = (path: EdgePath, s: number, out: THREE.Vector3): THREE.Vector3 => {
    const cum = path.cumulative;
    let lo = 0;
    while (lo < cum.length - 2 && cum[lo + 1]! < s) lo++;
    const segLen = cum[lo + 1]! - cum[lo]! || 1;
    const t = THREE.MathUtils.clamp((s - cum[lo]!) / segLen, 0, 1);
    return out.copy(path.points[lo]!).lerp(path.points[lo + 1]!, t);
  };

  // --- Cars ------------------------------------------------------------------
  const carCount = Math.min(150, Math.floor(paths.length * 0.18));
  const cars: Car[] = [];
  const carGeo = new THREE.BoxGeometry(2.2, 1.5, 4.6);
  carGeo.translate(0, 0.75, 0);
  const carMesh = new THREE.InstancedMesh(
    carGeo,
    new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    carCount,
  );
  carMesh.name = 'traffic:cars';
  const color = new THREE.Color();
  for (let i = 0; i < carCount; i++) {
    const path = rng.pick(paths);
    cars.push({
      path,
      s: rng.float(0, path.length),
      forward: rng.chance(0.5),
      speed: rng.float(9, 22),
      rng: rng.fork(`car/${i}`),
    });
    color.set(CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)]!);
    carMesh.setColorAt(i, color);
  }
  if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
  if (carCount > 0) group.add(carMesh);

  // --- Ferries ---------------------------------------------------------------
  type Ferry = { mesh: THREE.Group; a: THREE.Vector3; b: THREE.Vector3; t: number; dir: 1 | -1; speed: number };
  const ferries: Ferry[] = [];
  const pier = world.landmarks.find((lm) => lm.kind === 'pier');
  const islands = world.landmarks.filter((lm) => lm.kind === 'island');
  const ferryTargets = islands.length > 0 ? islands : world.landmarks.filter((lm) => lm.kind === 'bridge');
  if (pier && ferryTargets.length > 0) {
    for (const target of ferryTargets.slice(0, 2)) {
      const a = new THREE.Vector3(pier.position.x, waterLevel + 0.8, pier.position.z);
      const b = new THREE.Vector3(target.position.x, waterLevel + 0.8, target.position.z);
      // Stop short of the shore on both ends.
      const dir = b.clone().sub(a).normalize();
      a.addScaledVector(dir, 25);
      b.addScaledVector(dir, -35);

      const mesh = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.2, 16),
        new THREE.MeshLambertMaterial({ color: '#f0ede4' }),
      );
      hull.position.y = 1.1;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 2.4, 8),
        new THREE.MeshLambertMaterial({ color: '#3d6ea8' }),
      );
      cabin.position.y = 3.2;
      mesh.add(hull, cabin);
      mesh.name = 'traffic:ferry';
      group.add(mesh);
      ferries.push({ mesh, a, b, t: rng.float(0.1, 0.9), dir: rng.chance(0.5) ? 1 : -1, speed: 10 });
    }
  }

  // --- Plane -----------------------------------------------------------------
  const half = (world.config.chunksX * world.config.chunkSize) / 2;
  const plane = new THREE.Group();
  {
    const fuselage = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2.2, 16),
      new THREE.MeshLambertMaterial({ color: '#f2f3f5' }),
    );
    const wings = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.5, 3.6),
      new THREE.MeshLambertMaterial({ color: '#d8dce2' }),
    );
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 3.4, 2.6),
      new THREE.MeshLambertMaterial({ color: '#c2452f' }),
    );
    tail.position.set(0, 1.6, 7);
    plane.add(fuselage, wings, tail);
    plane.name = 'traffic:plane';
    group.add(plane);
  }
  let planeT = rng.float(0, 1);
  const planeFrom = new THREE.Vector3(-half * 1.3, 240, half * 1.1);
  const planeTo = new THREE.Vector3(half * 1.3, 240, -half * 1.1);
  plane.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().lookAt(planeFrom, planeTo, new THREE.Vector3(0, 1, 0)),
  );

  // --- Frame update ------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);
  const lookMatrix = new THREE.Matrix4();

  const update = (dt: number): void => {
    if (!group.visible) return;

    // Cars.
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]!;
      car.s += (car.forward ? 1 : -1) * car.speed * dt;
      if (car.s > car.path.length || car.s < 0) {
        // Continue onto a random edge that shares the node we just reached.
        const nodeId = car.forward ? car.path.edge.to : car.path.edge.from;
        const options = pathsByNode.get(nodeId) ?? [car.path];
        const next = options[car.rng.int(0, options.length - 1)]!;
        car.path = next;
        car.forward = next.edge.from === nodeId;
        car.s = car.forward ? 0 : next.length;
      }
      positionAt(car.path, car.s, tmp);
      const ahead = THREE.MathUtils.clamp(car.s + (car.forward ? 4 : -4), 0, car.path.length);
      positionAt(car.path, ahead, tmp2);
      if (tmp2.distanceToSquared(tmp) > 0.01) {
        lookMatrix.lookAt(tmp2, tmp, up);
        quat.setFromRotationMatrix(lookMatrix);
      }
      matrix.compose(tmp, quat, scale);
      carMesh.setMatrixAt(i, matrix);
    }
    if (cars.length > 0) carMesh.instanceMatrix.needsUpdate = true;

    // Ferries (ping-pong with a gentle bob).
    for (const ferry of ferries) {
      const routeLen = ferry.a.distanceTo(ferry.b);
      ferry.t += (ferry.dir * ferry.speed * dt) / routeLen;
      if (ferry.t >= 1) {
        ferry.t = 1;
        ferry.dir = -1;
      } else if (ferry.t <= 0) {
        ferry.t = 0;
        ferry.dir = 1;
      }
      ferry.mesh.position.lerpVectors(ferry.a, ferry.b, ferry.t);
      ferry.mesh.position.y += Math.sin(performance.now() / 700 + ferry.t * 20) * 0.25;
      const target = ferry.dir === 1 ? ferry.b : ferry.a;
      ferry.mesh.lookAt(target.x, ferry.mesh.position.y, target.z);
    }

    // Plane.
    planeT = (planeT + dt / 90) % 1;
    plane.position.lerpVectors(planeFrom, planeTo, planeT);
  };

  return {
    group,
    update,
    dispose(): void {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}
