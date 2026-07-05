import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';

export function buildWaterMesh(world: MapWorld): THREE.Mesh {
  const { chunksX, chunksZ, chunkSize, waterLevel } = world.config;
  // Extend well past the map edge so the horizon is always ocean.
  const width = chunksX * chunkSize * 3;
  const depth = chunksZ * chunkSize * 3;
  const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshPhongMaterial({
    color: '#2f66b8',
    transparent: true,
    opacity: 0.88,
    shininess: 120,
    specular: new THREE.Color('#9fc4ff'),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.position.y = waterLevel;
  return mesh;
}
