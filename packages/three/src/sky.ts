import * as THREE from 'three';
import { createRng } from '@map-engine/core';
import type { MapWorld } from '@map-engine/core';

/** Star field on a high dome — visible only at night. */
export function buildStars(world: MapWorld): THREE.Points {
  const rng = createRng(`${world.seed}/stars`);
  const half = (world.config.chunksX * world.config.chunkSize) / 2;
  const radius = half * 3;
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere only, biased away from the horizon.
    const theta = rng.float(0, Math.PI * 2);
    const phi = Math.acos(rng.float(0.12, 1));
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#cdd8ff',
    size: 2.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    fog: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'stars';
  stars.visible = false;
  return stars;
}
