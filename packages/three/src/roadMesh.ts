import * as THREE from 'three';
import { createWorldHeightSampler } from '@map-engine/core';
import type { MapWorld, RoadEdge } from '@map-engine/core';

const ROAD_LIFT = 0.35;
const BRIDGE_CLEARANCE = 7;
const SEGMENT_LENGTH = 10;

const COLOR_ROAD = new THREE.Color('#3a3f48');
const COLOR_BRIDGE = new THREE.Color('#b8452f');

/**
 * Roads are quad strips that follow the terrain, slightly lifted to avoid
 * z-fighting. Bridge edges keep a flat deck above the water and blend back
 * into the terrain height at both ends. All edges merge into one geometry.
 */
export function buildRoadsMesh(world: MapWorld): THREE.Mesh {
  const sample = createWorldHeightSampler(world);
  const nodeById = new Map(world.roadGraph.nodes.map((n) => [n.id, n]));
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pushEdge = (edge: RoadEdge): void => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return;

    const ax = from.position.x;
    const az = from.position.z;
    const bx = to.position.x;
    const bz = to.position.z;
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 1e-3) return;

    // Perpendicular in XZ for road width.
    const px = (-dz / length) * (edge.width / 2);
    const pz = (dx / length) * (edge.width / 2);

    const isBridge = edge.kind === 'bridge';
    const deckY = world.config.waterLevel + BRIDGE_CLEARANCE;
    const color = isBridge ? COLOR_BRIDGE : COLOR_ROAD;

    const steps = Math.max(1, Math.round(length / SEGMENT_LENGTH));
    const baseIndex = positions.length / 3;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      const groundY = Math.max(sample(x, z), world.config.waterLevel) + ROAD_LIFT;
      // Bridges keep a constant deck height; where the terrain rises above
      // the deck near the shore, the road simply follows the ground.
      const y = isBridge ? Math.max(groundY, deckY) : groundY;
      positions.push(x - px, y, z - pz, x + px, y, z + pz);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    for (let s = 0; s < steps; s++) {
      const a = baseIndex + s * 2;
      // Winding chosen so face normals point up (+Y).
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };

  for (const edge of world.roadGraph.edges) pushEdge(edge);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'roads';
  return mesh;
}
