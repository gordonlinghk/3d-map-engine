import * as THREE from 'three';
import { createWorldHeightSampler } from '@map-engine/core';
import type { MapWorld, Vec2 } from '@map-engine/core';

/**
 * Flat water/green polygons for imported (OSM) worlds, drawn slightly above
 * the ground so they read as harbours, rivers and parks.
 */
export function buildFlatAreas(world: MapWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'flat-areas';
  const waters = world.waterPolygons ?? [];
  const greens = world.greenPolygons ?? [];
  if (waters.length === 0 && greens.length === 0) return group;

  const sample = createWorldHeightSampler(world);

  const build = (polys: Vec2[][], color: string, lift: number, name: string): void => {
    if (polys.length === 0) return;
    const geometries: THREE.BufferGeometry[] = [];
    const isWater = name === 'flat-water';
    for (const poly of polys) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      // Water sits at the lowest ground under its outline (real terrain
      // carves a flat bed there); greens at their average edge height —
      // the least-bad plane on sloped ground.
      let min = Infinity;
      let sum = 0;
      for (const p of poly) {
        const h = sample(p.x, p.y);
        min = Math.min(min, h);
        sum += h;
      }
      const level = isWater ? min : sum / poly.length;
      geo.translate(0, Math.max(level, world.config.waterLevel) + lift, 0);
      geometries.push(geo);
    }
    const material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    for (const geo of geometries) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.name = name;
      group.add(mesh);
    }
  };

  build(waters, '#3a6cb4', 0.12, 'flat-water');
  build(greens, '#6fae5c', 0.06, 'flat-green');
  return group;
}
