import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
import type { BuildingsBuildResult } from './buildingsMesh';

export type PickableInfo = {
  id: string;
  type: 'building' | 'landmark' | 'poi';
  position: THREE.Vector3;
  /** Horizontal radius used for rings and focus distance. */
  radius: number;
  height: number;
  /** Box size for building outline highlight. */
  size?: THREE.Vector3;
};

export type MapObjectHit = {
  objectId: string;
  objectType: 'building' | 'landmark' | 'poi';
  point: { x: number; y: number; z: number };
  distance: number;
};

/** POI pins are thin — picking/highlight radius is generous so they're easy to hit. */
const POI_PICK_RADIUS = 4;
const POI_PICK_HEIGHT = 6;

export function buildPickableIndex(
  world: MapWorld,
  landmarksGroup: THREE.Group,
): Map<string, PickableInfo> {
  const index = new Map<string, PickableInfo>();
  for (const obj of Object.values(world.objects)) {
    if (obj.objectType === 'poi') {
      const p = obj.poi;
      index.set(p.id, {
        id: p.id,
        type: 'poi',
        position: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
        radius: POI_PICK_RADIUS,
        height: POI_PICK_HEIGHT,
      });
      continue;
    }
    if (obj.objectType === 'building') {
      const b = obj.building;
      // Bounds over the whole footprint (works for arbitrary polygons too).
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of b.footprint) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const w = maxX - minX;
      const d = maxY - minY;
      index.set(b.id, {
        id: b.id,
        type: 'building',
        position: new THREE.Vector3(b.position.x, b.position.y, b.position.z),
        radius: Math.max(w, d) * 0.72,
        height: b.height,
        size: new THREE.Vector3(w, b.height, d),
      });
    }
  }
  for (const lm of world.landmarks) {
    const node = landmarksGroup.getObjectByName(`landmark:${lm.id}`);
    let radius = 24;
    let height = 30;
    if (node) {
      const box = new THREE.Box3().setFromObject(node);
      const size = box.getSize(new THREE.Vector3());
      radius = Math.max(size.x, size.z) * 0.55;
      height = size.y;
    }
    index.set(lm.id, {
      id: lm.id,
      type: 'landmark',
      position: new THREE.Vector3(lm.position.x, lm.position.y, lm.position.z),
      radius: Math.min(radius, 90),
      height,
    });
  }
  return index;
}

/** Hover + selection indicators (rings and building outline). */
export function createHighlights(scene: THREE.Scene) {
  const hoverRingGeo = new THREE.RingGeometry(0.86, 1, 40);
  hoverRingGeo.rotateX(-Math.PI / 2);
  const hoverRing = new THREE.Mesh(
    hoverRingGeo,
    new THREE.MeshBasicMaterial({
      color: '#8ecff5',
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  hoverRing.visible = false;
  hoverRing.renderOrder = 10;

  const selGeoOuter = new THREE.RingGeometry(0.78, 1, 48);
  selGeoOuter.rotateX(-Math.PI / 2);
  const selectRing = new THREE.Mesh(
    selGeoOuter,
    new THREE.MeshBasicMaterial({
      color: '#ffab52',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  selectRing.visible = false;
  selectRing.renderOrder = 11;

  const selGlowGeo = new THREE.RingGeometry(0.55, 1.55, 48);
  selGlowGeo.rotateX(-Math.PI / 2);
  const selectGlow = new THREE.Mesh(
    selGlowGeo,
    new THREE.MeshBasicMaterial({
      color: '#ff8c2e',
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  selectGlow.visible = false;
  selectGlow.renderOrder = 9;

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: '#bfe5ff', transparent: true, opacity: 0.9 }),
  );
  outline.visible = false;
  outline.renderOrder = 12;
  // Unit box centered at origin — shift up so scaling grows from the base.
  outline.geometry.translate(0, 0.5, 0);

  scene.add(hoverRing, selectRing, selectGlow, outline);

  const placeRing = (ring: THREE.Object3D, info: PickableInfo, scale: number): void => {
    ring.position.set(info.position.x, info.position.y + 0.45, info.position.z);
    ring.scale.setScalar(info.radius * scale);
    ring.visible = true;
  };

  return {
    setHover(info: PickableInfo | null): void {
      if (!info) {
        hoverRing.visible = false;
        outline.visible = false;
        return;
      }
      placeRing(hoverRing, info, 1.25);
      if (info.size) {
        outline.position.set(info.position.x, info.position.y - 0.3, info.position.z);
        outline.scale.set(info.size.x * 1.03, info.size.y * 1.01, info.size.z * 1.03);
        outline.visible = true;
      } else {
        outline.visible = false;
      }
    },
    setSelected(info: PickableInfo | null): void {
      if (!info) {
        selectRing.visible = false;
        selectGlow.visible = false;
        return;
      }
      placeRing(selectRing, info, 1.35);
      placeRing(selectGlow, info, 1.7);
      selectRing.userData.baseScale = selectRing.scale.x;
    },
    tick(time: number): void {
      if (selectRing.visible) {
        const base = (selectRing.userData.baseScale as number) || selectRing.scale.x;
        selectRing.scale.setScalar(base * (1 + Math.sin(time * 2.6) * 0.06));
        selectGlow.material.opacity = 0.16 + (Math.sin(time * 2.6) + 1) * 0.05;
      }
    },
    dispose(): void {
      for (const m of [hoverRing, selectRing, selectGlow]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        scene.remove(m);
      }
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      scene.remove(outline);
    },
  };
}

export type Highlights = ReturnType<typeof createHighlights>;

/** Raycast helper resolving instanced buildings and landmark groups to ids. */
export function createPicker(
  camera: THREE.Camera,
  domElement: HTMLElement,
  getTargets: () => {
    buildings: BuildingsBuildResult | null;
    landmarks: THREE.Group | null;
    terrain: THREE.Object3D | null;
    pois: THREE.Group | null;
  },
) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const toNdc = (clientX: number, clientY: number): THREE.Vector2 => {
    const rect = domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    return ndc;
  };

  const pick = (clientX: number, clientY: number): MapObjectHit | null => {
    const { buildings, landmarks, pois } = getTargets();
    raycaster.setFromCamera(toNdc(clientX, clientY), camera);

    let best: MapObjectHit | null = null;
    if (buildings) {
      for (const [mesh, ids] of buildings.instanceIndex) {
        const hits = raycaster.intersectObject(mesh, false);
        const hit = hits[0];
        if (hit && hit.instanceId !== undefined) {
          const id = ids[hit.instanceId];
          if (id && (!best || hit.distance < best.distance)) {
            best = {
              objectId: id,
              objectType: 'building',
              point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
              distance: hit.distance,
            };
          }
        }
      }
      // Merged meshes (imported polygon buildings + chinese hip roofs): resolve
      // the building id from the hit triangle via the mesh's face ranges.
      const resolveMerged = (mesh: THREE.Mesh | null): void => {
        if (!mesh) return;
        const hit = raycaster.intersectObject(mesh, false)[0];
        const ranges = mesh.userData.faceRanges as
          | Array<{ start: number; end: number; id: string }>
          | undefined;
        const face = hit?.faceIndex ?? null;
        if (!hit || face === null || !ranges || (best && hit.distance >= best.distance)) return;
        // Binary search the face range containing this triangle.
        let lo = 0;
        let hi = ranges.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const r = ranges[mid]!;
          if (face < r.start) hi = mid - 1;
          else if (face >= r.end) lo = mid + 1;
          else {
            best = {
              objectId: r.id,
              objectType: 'building',
              point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
              distance: hit.distance,
            };
            break;
          }
        }
      };
      resolveMerged(buildings.polyMesh);
      resolveMerged(buildings.roofMesh);
    }
    if (landmarks) {
      const hits = raycaster.intersectObject(landmarks, true);
      const hit = hits.find((h) => h.object.userData.objectId);
      if (hit && (!best || hit.distance < best.distance)) {
        best = {
          objectId: hit.object.userData.objectId as string,
          objectType: 'landmark',
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          distance: hit.distance,
        };
      }
    }
    if (pois) {
      const hits = raycaster.intersectObject(pois, true);
      const hit = hits.find((h) => h.object.userData.poiId);
      if (hit && (!best || hit.distance < best.distance)) {
        best = {
          objectId: hit.object.userData.poiId as string,
          objectType: 'poi',
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          distance: hit.distance,
        };
      }
    }
    return best;
  };

  const pickGround = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const { terrain } = getTargets();
    if (!terrain) return null;
    raycaster.setFromCamera(toNdc(clientX, clientY), camera);
    const hits = raycaster.intersectObject(terrain, true);
    return hits[0]?.point ?? null;
  };

  return { pick, pickGround };
}
