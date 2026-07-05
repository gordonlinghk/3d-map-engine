import * as THREE from 'three';
import { createRng, createWorldHeightSampler } from '@map-engine/core';
import type { MapWorld } from '@map-engine/core';

/**
 * Lamp posts along avenues and highways. At night the lamp heads glow
 * (emissive instanced spheres) — no real point lights, so it stays cheap.
 */
export type StreetLightsResult = {
  group: THREE.Group;
  setNightMode: (night: boolean) => void;
};

const MAX_LAMPS = 420;

export function buildStreetLights(world: MapWorld): StreetLightsResult {
  const group = new THREE.Group();
  group.name = 'streetlights';
  const rng = createRng(`${world.seed}/lamps`);
  const sample = createWorldHeightSampler(world);
  const nodeById = new Map(world.roadGraph.nodes.map((n) => [n.id, n]));

  type Lamp = { x: number; y: number; z: number };
  const lamps: Lamp[] = [];
  for (const edge of world.roadGraph.edges) {
    if (lamps.length >= MAX_LAMPS) break;
    if (edge.kind !== 'avenue' && edge.kind !== 'highway') continue;
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) continue;
    // One lamp near the middle of the edge, offset to the roadside.
    const t = rng.float(0.35, 0.65);
    const x = a.position.x + (b.position.x - a.position.x) * t;
    const z = a.position.z + (b.position.z - a.position.z) * t;
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = rng.chance(0.5) ? 1 : -1;
    const off = (edge.width / 2 + 1.2) * side;
    const lx = x + (-dz / len) * off;
    const lz = z + (dx / len) * off;
    const ground = sample(lx, lz);
    if (ground < world.config.waterLevel + 0.6) continue;
    lamps.push({ x: lx, y: ground, z: lz });
  }

  if (lamps.length === 0) return { group, setNightMode: () => {} };

  const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 7, 5);
  poleGeo.translate(0, 3.5, 0);
  const poles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshLambertMaterial({ color: '#4c525a' }),
    lamps.length,
  );
  poles.name = 'streetlights:poles';

  const headGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({
    color: '#d8d3c2',
    emissive: new THREE.Color('#ffd98a'),
    emissiveIntensity: 0,
  });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
  heads.name = 'streetlights:heads';

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  lamps.forEach((lamp, i) => {
    matrix.compose(new THREE.Vector3(lamp.x, lamp.y, lamp.z), quat, one);
    poles.setMatrixAt(i, matrix);
    matrix.compose(new THREE.Vector3(lamp.x, lamp.y + 7, lamp.z), quat, one);
    heads.setMatrixAt(i, matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(poles, heads);

  return {
    group,
    setNightMode(night: boolean): void {
      headMat.emissiveIntensity = night ? 1.6 : 0;
      headMat.needsUpdate = true;
    },
  };
}
