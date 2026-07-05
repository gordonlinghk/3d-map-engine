import * as THREE from 'three';
import { chunkOrigin, chunkKey } from '@map-engine/core';
import type { MapWorld, MapChunk } from '@map-engine/core';

/** Low-poly terrain palette, from beach up to rocky peaks. */
const COLOR_BEACH = new THREE.Color('#ddcfa4');
const COLOR_CITY_GROUND = new THREE.Color('#d7d4cc');
const COLOR_GRASS = new THREE.Color('#79a860');
const COLOR_FOREST = new THREE.Color('#4d7a4a');
const COLOR_ROCK = new THREE.Color('#8d8a83');
const COLOR_SEABED = new THREE.Color('#b8ac89');

function colorForHeight(h: number, waterLevel: number, _maxHeight: number, out: THREE.Color): void {
  if (h <= waterLevel) {
    out.copy(COLOR_SEABED);
    return;
  }
  // Absolute height bands (world units above sea level) so the flat downtown
  // preset gets city-gray ground and only real hills turn green.
  const t = h - waterLevel;
  if (t < 0.9) out.copy(COLOR_BEACH);
  else if (t < 14) out.copy(COLOR_CITY_GROUND);
  else if (t < 24) out.lerpColors(COLOR_CITY_GROUND, COLOR_GRASS, (t - 14) / 10);
  else if (t < 45) out.lerpColors(COLOR_GRASS, COLOR_FOREST, (t - 24) / 21);
  else out.lerpColors(COLOR_FOREST, COLOR_ROCK, Math.min((t - 45) / 30, 1));
}

function buildChunkGeometry(world: MapWorld, chunk: MapChunk): THREE.BufferGeometry {
  const res = chunk.resolution;
  const origin = chunkOrigin(world.config, chunk.coord);
  const step = world.config.chunkSize / res;
  const vertsPerRow = res + 1;

  const positions = new Float32Array(vertsPerRow * vertsPerRow * 3);
  const colors = new Float32Array(vertsPerRow * vertsPerRow * 3);
  const color = new THREE.Color();

  for (let j = 0; j < vertsPerRow; j++) {
    for (let i = 0; i < vertsPerRow; i++) {
      const idx = j * vertsPerRow + i;
      const h = chunk.heights[idx]!;
      positions[idx * 3] = origin.x + i * step;
      positions[idx * 3 + 1] = h;
      positions[idx * 3 + 2] = origin.z + j * step;
      colorForHeight(h, world.config.waterLevel, world.config.terrain.maxHeight, color);
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }

  const indices = new Uint32Array(res * res * 6);
  let k = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * vertsPerRow + i;
      const b = a + 1;
      const c = a + vertsPerRow;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildTerrainGroup(world: MapWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const chunk of Object.values(world.chunks)) {
    const mesh = new THREE.Mesh(buildChunkGeometry(world, chunk), material);
    mesh.name = `terrain:${chunkKey(chunk.coord)}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
