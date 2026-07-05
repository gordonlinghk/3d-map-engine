import * as THREE from 'three';
import type { BuildingInfo, MapWorld } from '@map-engine/core';

/**
 * Buildings render as instanced boxes in four height classes; each class
 * shares a procedural facade texture whose window-grid density matches the
 * class, so windows never look absurdly stretched.
 */

type HeightClass = { name: string; minFloors: number; texFloors: number; texCols: number };

const CLASSES: HeightClass[] = [
  { name: 'low', minFloors: 0, texFloors: 3, texCols: 5 },
  { name: 'mid', minFloors: 5, texFloors: 8, texCols: 6 },
  { name: 'high', minFloors: 11, texFloors: 18, texCols: 8 },
  { name: 'tower', minFloors: 25, texFloors: 40, texCols: 10 },
];

const FACADE_TINTS = ['#f2efe9', '#e8e4da', '#dcd8ce', '#cfd4d8', '#e9e2d2', '#c8d2dc'];
const TOWER_TINTS = ['#b7c6d6', '#a9bccf', '#cdd6de', '#9fb3c8'];

export function makeFacadeTexture(
  floors: number,
  cols: number,
  options: { night: boolean },
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = options.night ? '#0e1117' : '#ffffff';
  ctx.fillRect(0, 0, 64, 128);

  const cellW = 64 / cols;
  const cellH = 128 / floors;
  const winW = cellW * 0.52;
  const winH = cellH * 0.55;
  // Deterministic pseudo-random window lighting for the night texture.
  let s = 12345;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (options.night) {
        const lit = rand() < 0.6;
        ctx.fillStyle = lit ? (rand() < 0.25 ? '#ffc45e' : '#ffe9b0') : '#151a22';
      } else {
        ctx.fillStyle = 'rgba(45, 58, 74, 0.85)';
      }
      ctx.fillRect(c * cellW + (cellW - winW) / 2, f * cellH + (cellH - winH) / 2, winW, winH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function classFor(b: BuildingInfo): number {
  for (let i = CLASSES.length - 1; i >= 0; i--) {
    if (b.floors >= CLASSES[i]!.minFloors) return i;
  }
  return 0;
}

export type BuildingsBuildResult = {
  group: THREE.Group;
  /** instanced mesh -> building ids by instanceId (for picking). */
  instanceIndex: Map<THREE.InstancedMesh, string[]>;
  setNightMode: (night: boolean) => void;
};

export function buildBuildingsGroup(world: MapWorld): BuildingsBuildResult {
  const group = new THREE.Group();
  group.name = 'buildings';
  const instanceIndex = new Map<THREE.InstancedMesh, string[]>();

  const buildings: BuildingInfo[] = [];
  for (const obj of Object.values(world.objects)) {
    if (obj.objectType === 'building') buildings.push(obj.building);
  }

  const byClass: BuildingInfo[][] = CLASSES.map(() => []);
  for (const b of buildings) byClass[classFor(b)]!.push(b);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  const dayTextures: THREE.Texture[] = [];
  const nightTextures: THREE.Texture[] = [];
  const sideMaterials: THREE.MeshLambertMaterial[] = [];

  // Rooftop details: setback penthouse caps on high-rises, antennas on towers.
  // Deterministic per building (keyed on floors + index), no RNG needed.
  const caps: Array<{ b: BuildingInfo; w: number; d: number }> = [];
  const antennas: Array<{ b: BuildingInfo; h: number }> = [];
  for (const b of buildings) {
    const fp = b.footprint;
    const w = Math.abs(fp[1]!.x - fp[0]!.x);
    const d = Math.abs(fp[2]!.y - fp[1]!.y);
    if (b.floors >= 9 && (b.floors + fp.length) % 3 !== 0) caps.push({ b, w, d });
    if (b.floors >= 22 && b.floors % 2 === 0) {
      antennas.push({ b, h: 6 + (b.floors % 7) * 1.5 });
    }
  }

  CLASSES.forEach((cls, ci) => {
    const items = byClass[ci]!;
    if (items.length === 0) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const dayTex = makeFacadeTexture(cls.texFloors, cls.texCols, { night: false });
    dayTextures[ci] = dayTex;
    const side = new THREE.MeshLambertMaterial({ map: dayTex });
    sideMaterials[ci] = side;
    const roof = new THREE.MeshLambertMaterial({ color: '#565b63' });
    const materials = [side, side, roof, roof, side, side];

    const mesh = new THREE.InstancedMesh(geometry, materials, items.length);
    mesh.name = `buildings:${cls.name}`;

    const ids: string[] = [];
    items.forEach((b, idx) => {
      const fp = b.footprint;
      const w = Math.abs(fp[1]!.x - fp[0]!.x);
      const d = Math.abs(fp[2]!.y - fp[1]!.y);
      matrix.compose(
        new THREE.Vector3(b.position.x, b.position.y - 0.4, b.position.z),
        quat,
        new THREE.Vector3(w, b.height, d),
      );
      mesh.setMatrixAt(idx, matrix);
      const tints = ci === 3 ? TOWER_TINTS : FACADE_TINTS;
      color.set(tints[(b.floors * 7 + idx) % tints.length]!);
      mesh.setColorAt(idx, color);
      ids.push(b.id);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;

    instanceIndex.set(mesh, ids);
    group.add(mesh);
  });

  if (caps.length > 0) {
    const capGeo = new THREE.BoxGeometry(1, 1, 1);
    capGeo.translate(0, 0.5, 0);
    const capMesh = new THREE.InstancedMesh(
      capGeo,
      new THREE.MeshLambertMaterial({ color: '#6e737c' }),
      caps.length,
    );
    capMesh.name = 'buildings:caps';
    caps.forEach(({ b, w, d }, i) => {
      const capH = 2.2 + (b.floors % 3);
      matrix.compose(
        new THREE.Vector3(b.position.x, b.position.y + b.height - 0.6, b.position.z),
        quat,
        new THREE.Vector3(w * 0.55, capH, d * 0.55),
      );
      capMesh.setMatrixAt(i, matrix);
    });
    capMesh.instanceMatrix.needsUpdate = true;
    capMesh.castShadow = true;
    group.add(capMesh);
  }

  if (antennas.length > 0) {
    const antGeo = new THREE.CylinderGeometry(0.25, 0.45, 1, 5);
    antGeo.translate(0, 0.5, 0);
    const antMesh = new THREE.InstancedMesh(
      antGeo,
      new THREE.MeshLambertMaterial({ color: '#9aa0a8' }),
      antennas.length,
    );
    antMesh.name = 'buildings:antennas';
    antennas.forEach(({ b, h }, i) => {
      matrix.compose(
        new THREE.Vector3(b.position.x, b.position.y + b.height, b.position.z),
        quat,
        new THREE.Vector3(1, h, 1),
      );
      antMesh.setMatrixAt(i, matrix);
    });
    antMesh.instanceMatrix.needsUpdate = true;
    group.add(antMesh);
  }

  const setNightMode = (night: boolean): void => {
    CLASSES.forEach((cls, ci) => {
      const side = sideMaterials[ci];
      if (!side) return;
      if (night && !nightTextures[ci]) {
        nightTextures[ci] = makeFacadeTexture(cls.texFloors, cls.texCols, { night: true });
      }
      side.map = night ? nightTextures[ci]! : dayTextures[ci]!;
      // At night the facade texture carries its own emissive-looking windows.
      side.emissive = night ? new THREE.Color('#ffffff') : new THREE.Color('#000000');
      side.emissiveMap = night ? nightTextures[ci]! : null;
      side.emissiveIntensity = night ? 1.15 : 0;
      side.needsUpdate = true;
    });
  };

  return { group, instanceIndex, setNightMode };
}
