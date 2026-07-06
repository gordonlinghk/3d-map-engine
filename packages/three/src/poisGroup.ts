import * as THREE from 'three';
import type { MapWorld, PoiIcon } from '@map-engine/core';

/** Pin head color by icon — matches the editor's POI icon picker. */
const ICON_COLORS: Record<PoiIcon, string> = {
  flag: '#f28c38',
  quest: '#e3b341',
  resource: '#5fae5c',
  danger: '#c2453f',
  note: '#5b8dd6',
};

const POLE_HEIGHT = 5;
const HEAD_RADIUS = 1.4;

/**
 * Map-pin markers for user/imported POIs: a thin pole rising from the ground
 * sample stored on the POI, topped by a colored sphere. One pin per POI
 * (not instanced — POI counts are expected to stay small; see B15 contract).
 */
export function buildPoisGroup(world: MapWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pois';

  const pois = Object.values(world.objects).filter((o) => o.objectType === 'poi');
  // No POIs → no shared resources: disposeObject only reaches geometry that
  // is attached to a mesh, so eagerly-created shared geos would leak here.
  if (pois.length === 0) return group;

  const poleGeo = new THREE.CylinderGeometry(0.35, 0.45, POLE_HEIGHT, 8);
  poleGeo.translate(0, POLE_HEIGHT / 2, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#8a8f98' });
  const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 12, 10);
  headGeo.translate(0, POLE_HEIGHT, 0);

  for (const obj of pois) {
    const poi = obj.poi;

    const pin = new THREE.Group();
    pin.name = `poi:${poi.id}`;
    pin.position.set(poi.position.x, poi.position.y, poi.position.z);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.castShadow = true;
    const head = new THREE.Mesh(
      headGeo,
      new THREE.MeshLambertMaterial({ color: ICON_COLORS[poi.icon] }),
    );
    head.castShadow = true;

    pin.add(pole, head);
    pin.traverse((o) => {
      o.userData.poiId = poi.id;
    });
    group.add(pin);
  }

  return group;
}
