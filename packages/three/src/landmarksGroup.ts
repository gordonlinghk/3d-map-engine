import * as THREE from 'three';
import { createWorldHeightSampler } from '@map-engine/core';
import type { LandmarkInfo, MapWorld } from '@map-engine/core';

const RED = '#c23b22';
const CONCRETE = '#d8d2c4';

function mat(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.y = h / 2;
  return m;
}

/** Suspension bridge: two towers + main cables over the crossing line. */
function buildBridge(lm: LandmarkInfo, world: MapWorld): THREE.Group {
  const g = new THREE.Group();
  const meta = lm.metadata ?? {};
  const a = new THREE.Vector3(Number(meta.ax ?? 0), 0, Number(meta.az ?? 0));
  const b = new THREE.Vector3(Number(meta.bx ?? 0), 0, Number(meta.bz ?? 0));
  const deckY = world.config.waterLevel + 7;
  const towerH = 58;

  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const angle = Math.atan2(dir.x, dir.z);

  const towerAt = (t: number): THREE.Vector3 => a.clone().addScaledVector(dir.clone().multiplyScalar(len), t);

  const makeTower = (t: number): THREE.Group => {
    const tower = new THREE.Group();
    const p = towerAt(t);
    for (const s of [-1, 1]) {
      const leg = box(3, towerH, 3, RED);
      leg.position.x = s * 7;
      tower.add(leg);
    }
    for (const y of [towerH * 0.55, towerH * 0.85]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(17, 3, 3), mat(RED));
      bar.position.y = y;
      tower.add(bar);
    }
    tower.position.set(p.x, 0, p.z);
    tower.rotation.y = angle;
    return tower;
  };

  const t1 = 0.33;
  const t2 = 0.67;
  g.add(makeTower(t1), makeTower(t2));

  // Main cables on both sides: end → tower1 → tower2 → end.
  const topY = towerH - 2;
  const sagY = deckY + 10;
  for (const s of [-1, 1]) {
    const offset = side.clone().multiplyScalar(s * 7);
    const p0 = towerAt(0).add(offset).setY(deckY + 2);
    const p1 = towerAt(t1).add(offset).setY(topY);
    const p3 = towerAt(t2).add(offset).setY(topY);
    const p4 = towerAt(1).add(offset).setY(deckY + 2);
    // Three independent spans, each a clean parabola.
    const spans: THREE.QuadraticBezierCurve3[] = [
      new THREE.QuadraticBezierCurve3(p0, p0.clone().lerp(p1, 0.5).setY(deckY + 4), p1),
      new THREE.QuadraticBezierCurve3(p1, p1.clone().lerp(p3, 0.5).setY(sagY), p3),
      new THREE.QuadraticBezierCurve3(p3, p3.clone().lerp(p4, 0.5).setY(deckY + 4), p4),
    ];
    for (const span of spans) {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(span, 24, 0.55, 6), mat(RED)));
    }
  }
  return g;
}

/** Three-legged broadcast tower (Sutro style). */
function buildTvTower(): THREE.Group {
  const g = new THREE.Group();
  const h = 85;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 2.2), mat('#e8e4dd'));
    leg.position.set(Math.cos(a) * 9, h / 2, Math.sin(a) * 9);
    leg.rotation.z = Math.cos(a) * 0.08;
    leg.rotation.x = -Math.sin(a) * 0.08;
    g.add(leg);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(24, 4, 24), mat(RED));
  platform.position.y = h * 0.92;
  g.add(platform);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 26, 6), mat(RED));
  antenna.position.y = h + 13;
  g.add(antenna);
  return g;
}

/** Slender cylindrical observation tower (Coit style). */
function buildCylinderTower(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 40, 12), mat(CONCRETE));
  shaft.position.y = 20;
  g.add(shaft);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.5, 6, 12), mat('#c9c2b2'));
  crown.position.y = 43;
  g.add(crown);
  return g;
}

/** Waterfront stadium: elliptic bowl with a green field. */
function buildStadium(): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Shape();
  outer.absellipse(0, 0, 30, 23, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, 22, 15.5, 0, Math.PI * 2, true, 0);
  outer.holes.push(hole);

  const bowlGeo = new THREE.ExtrudeGeometry(outer, { depth: 10, bevelEnabled: false });
  bowlGeo.rotateX(-Math.PI / 2);
  const bowl = new THREE.Mesh(bowlGeo, mat('#3c7a4c'));
  g.add(bowl);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 32), mat('#a14232'));
  base.scale.set(31.5, 1, 24.5);
  base.position.y = 2;
  g.add(base);

  const fieldGeo = new THREE.CircleGeometry(1, 32);
  fieldGeo.rotateX(-Math.PI / 2);
  const field = new THREE.Mesh(fieldGeo, mat('#58a34a'));
  field.scale.set(21, 1, 14.5);
  field.position.y = 4.3;
  g.add(field);
  return g;
}

/** Pier with a clock-tower terminal building. */
function buildPier(lm: LandmarkInfo, world: MapWorld): THREE.Group {
  const g = new THREE.Group();
  const sample = createWorldHeightSampler(world);
  // Orient the pier out to sea: probe 4 directions, pick the wettest.
  let best = { x: 1, z: 0, score: Infinity };
  for (const dir of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 0.7, z: 0.7 }, { x: -0.7, z: -0.7 }]) {
    const h = sample(lm.position.x + dir.x * 40, lm.position.z + dir.z * 40);
    if (h < best.score) best = { ...dir, score: h };
  }
  const deck = box(56, 2.5, 18, '#cbbfa5');
  deck.position.set(best.x * 24, 1.25, best.z * 24);
  g.add(deck);

  const terminal = box(16, 9, 12, CONCRETE);
  terminal.position.set(0, 4.5, 0);
  g.add(terminal);
  const clock = box(5, 22, 5, CONCRETE);
  clock.position.set(0, 11, 0);
  g.add(clock);
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), mat('#2d3a4a'));
  clockFace.position.set(best.x >= 0 ? 2.51 : -2.51, 18, 0);
  clockFace.rotation.y = best.x >= 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(clockFace);
  return g;
}

/** Blocky island prison compound (Alcatraz style). */
function buildIslandCompound(): THREE.Group {
  const g = new THREE.Group();
  const main = box(26, 9, 12, '#ded8cb');
  main.position.set(0, 4.5, 0);
  g.add(main);
  const annex = box(12, 6, 10, '#cfc8ba');
  annex.position.set(-16, 3, 4);
  g.add(annex);
  const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 16, 8), mat('#b8483a'));
  lighthouse.position.set(12, 8, -5);
  g.add(lighthouse);
  return g;
}

export function buildLandmarksGroup(world: MapWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'landmarks';

  for (const lm of world.landmarks) {
    let mesh: THREE.Group | null = null;
    switch (lm.kind) {
      case 'bridge':
        mesh = buildBridge(lm, world);
        break;
      case 'tower':
        mesh = lm.metadata?.style === 'cylinder' ? buildCylinderTower() : buildTvTower();
        break;
      case 'stadium':
        mesh = buildStadium();
        break;
      case 'pier':
        mesh = buildPier(lm, world);
        break;
      case 'island':
        mesh = buildIslandCompound();
        break;
      case 'park':
        // Parks are represented by their tree clusters.
        break;
    }
    if (!mesh) continue;
    if (lm.kind !== 'bridge') {
      mesh.position.set(lm.position.x, lm.position.y, lm.position.z);
    }
    mesh.name = `landmark:${lm.id}`;
    mesh.userData.objectId = lm.id;
    mesh.traverse((o) => {
      o.userData.objectId = lm.id;
    });
    group.add(mesh);
  }
  return group;
}
