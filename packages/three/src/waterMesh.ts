import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';

/** Procedural ripple normal map so the water shimmers without a heavy shader. */
function makeWaterNormalMap(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);

  // Height field from a few summed sine waves, then finite-difference normals.
  const h = (x: number, y: number): number =>
    Math.sin(x * 0.35 + y * 0.2) * 0.5 +
    Math.sin(x * 0.13 - y * 0.31) * 0.35 +
    Math.sin(x * 0.07 + y * 0.53) * 0.25;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const idx = (y * size + x) * 4;
      img.data[idx] = 128 + dx * 60;
      img.data[idx + 1] = 128 + dy * 60;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 42);
  return tex;
}

export function buildWaterMesh(world: MapWorld): THREE.Mesh {
  const { chunksX, chunksZ, chunkSize, waterLevel } = world.config;
  // Extend well past the map edge so the horizon is always ocean.
  const width = chunksX * chunkSize * 3;
  const depth = chunksZ * chunkSize * 3;
  const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const normalMap = makeWaterNormalMap();
  const material = new THREE.MeshPhongMaterial({
    color: '#2f66b8',
    transparent: true,
    opacity: 0.88,
    shininess: 140,
    specular: new THREE.Color('#9fc4ff'),
    normalMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.position.y = waterLevel;
  mesh.receiveShadow = true;
  // Drift the ripples; called from the renderer's frame loop.
  mesh.userData.tick = (time: number): void => {
    normalMap.offset.set(time * 0.008, time * 0.005);
  };
  return mesh;
}
