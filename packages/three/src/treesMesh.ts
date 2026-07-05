import * as THREE from 'three';
import type { MapWorld, Vec3 } from '@map-engine/core';

const CANOPY_COLORS = ['#2f6b34', '#3a7d3f', '#274f2a', '#4a8a45'];

export function buildTreesGroup(world: MapWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trees';

  const positions: Vec3[] = [];
  for (const obj of Object.values(world.objects)) {
    if (obj.objectType === 'tree') positions.push(obj.position);
  }
  if (positions.length === 0) return group;

  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
  trunkGeo.translate(0, 1.5, 0);
  const canopyGeo = new THREE.ConeGeometry(3.2, 9, 6);
  canopyGeo.translate(0, 7.5, 0);

  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6c4f35' });
  const canopyMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, positions.length);
  trunks.name = 'trees:trunks';
  canopies.name = 'trees:canopies';

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  positions.forEach((p, i) => {
    const s = 0.8 + ((i * 37) % 10) / 18;
    matrix.compose(new THREE.Vector3(p.x, p.y, p.z), quat, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, matrix);
    canopies.setMatrixAt(i, matrix);
    color.set(CANOPY_COLORS[i % CANOPY_COLORS.length]!);
    canopies.setColorAt(i, color);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  canopies.castShadow = true;

  group.add(trunks, canopies);
  return group;
}
