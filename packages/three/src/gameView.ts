import * as THREE from 'three';
import type { GameSimulation, Site, Unit, UnitId } from '@map-engine/game';
import type { ThreeMapRenderer } from './renderer';

/** Marker color by unit kind — extend as new unit kinds are introduced. */
const KIND_COLORS: Record<string, string> = {
  soldier: '#c0392b',
  cart: '#2d7dd2',
};
const DEFAULT_COLOR = '#e0b53a';
const DEFAULT_NEUTRAL_SITE_COLOR = '#9aa0a6';

export type GameViewOptions = {
  /** Factory for a unit's 3D object. Default: a small colored arrow marker. */
  unitObject?: (unit: Unit) => THREE.Object3D;
  /** Marker color per factionId; wins over kind color, and colors sites too. */
  factionColors?: Record<string, string>;
  /**
   * Factory for a site's 3D object. Default: a translucent ground disc (radius
   * = `site.captureRadius`) whose color tracks the owner, plus a progress ring.
   *
   * When supplied, the view manages this object's name, position and disposal
   * (traversed and its geometries/materials disposed in `dispose()`, exactly
   * like `unitObject`) — but NOT the per-frame owner-color and
   * capture-progress sync described below, which applies only to the default
   * marker. A custom object must handle its own visual response to ownership
   * and capture progress, e.g. by reading `site` (which is a live, mutable
   * reference) inside its own render-loop hook.
   */
  siteObject?: (site: Site) => THREE.Object3D;
  /** Site color when the owner is null or has no entry in `factionColors`. Default `'#9aa0a6'`. */
  neutralSiteColor?: string;
};

export interface GameView {
  readonly group: THREE.Group;
  readonly simulation: GameSimulation;
  /** Follow a unit with the camera; pass null to stop following. */
  followUnit(id: UnitId | null): void;
  /** Raycast unit markers at client pixel coords (same convention as renderer.pickObject). */
  pickUnit(pointer: { x: number; y: number }): UnitId | null;
  selectUnit(id: UnitId | null): void;
  getSelectedUnit(): UnitId | null;
  /** Detach everything: unsubscribe, remove + dispose meshes, stop follow. */
  dispose(): void;
}

/**
 * A small upright cone marker. Heading = atan2(dirX, dirZ), so rotation.y
 * applied to an object facing +Z at rest turns it to face the travel
 * direction — hence the cone apex is oriented toward +Z here.
 */
function defaultMarker(unit: Unit, factionColors?: Record<string, string>): THREE.Object3D {
  const marker = new THREE.Group();
  const color =
    (unit.factionId !== null ? factionColors?.[unit.factionId] : undefined) ??
    KIND_COLORS[unit.kind] ??
    DEFAULT_COLOR;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 5, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  cone.rotation.x = Math.PI / 2; // apex now points along +Z instead of +Y
  cone.position.y = 3; // lift above ground
  marker.add(cone);
  return marker;
}

/** Flat ring geometry marking the selected unit, named `'game:selection'`. */
function createSelectionRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(3, 4.2, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffe27a',
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = 'game:selection';
  ring.visible = false;
  ring.renderOrder = 10;
  return ring;
}

/** Owner-tracking color lookup shared by the default site disc and progress ring. */
function factionOrNeutralColor(
  factionId: string | null,
  factionColors: Record<string, string> | undefined,
  neutralColor: string,
): string {
  return (factionId !== null ? factionColors?.[factionId] : undefined) ?? neutralColor;
}

/** Bookkeeping for one site's 3D object, kept so `sync()` can update default markers. */
type SiteEntry = {
  readonly site: Site;
  readonly obj: THREE.Object3D;
  /** Present only for the default marker — a custom `siteObject` manages its own visuals. */
  readonly disc?: THREE.Mesh;
  readonly progressRing?: THREE.Mesh;
  /**
   * Faction id (or null) last applied to `disc`'s color, so `syncSites` only
   * re-parses a CSS color string when ownership actually changed instead of
   * every frame for every site.
   */
  lastOwnerFactionId?: string | null;
  /** Same idea as `lastOwnerFactionId`, for `progressRing`'s color. */
  lastCapturingFactionId?: string | null;
};

/**
 * Default site marker: a flat translucent ground disc (radius = `site.captureRadius`)
 * colored by owner, plus a child progress ring named `game:site:progress:{id}` that is
 * visible only while a capture is in progress and grows toward the disc's radius as
 * `captureProgress` approaches `captureTime`. Both are laid flat and lifted slightly
 * above the site's ground position, like `createSelectionRing`.
 */
function createDefaultSiteMarker(
  site: Site,
  factionColors: Record<string, string> | undefined,
  neutralSiteColor: string,
): { obj: THREE.Object3D; disc: THREE.Mesh; progressRing: THREE.Mesh } {
  const group = new THREE.Group();

  const discGeo = new THREE.CircleGeometry(site.captureRadius, 32);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: factionOrNeutralColor(site.ownerFactionId, factionColors, neutralSiteColor),
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.05;
  disc.renderOrder = 5;
  group.add(disc);

  // Base geometry spans the full capture radius; per-frame scale.set(frac, 1, frac)
  // shrinks it back down so it visibly grows as captureProgress approaches captureTime.
  const progressGeo = new THREE.RingGeometry(site.captureRadius * 0.82, site.captureRadius, 32);
  progressGeo.rotateX(-Math.PI / 2);
  const progressMat = new THREE.MeshBasicMaterial({
    color: factionOrNeutralColor(site.capturingFactionId, factionColors, neutralSiteColor),
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const progressRing = new THREE.Mesh(progressGeo, progressMat);
  progressRing.name = `game:site:progress:${site.id}`;
  progressRing.position.y = 0.1;
  progressRing.renderOrder = 6;
  progressRing.visible = false;
  group.add(progressRing);

  return { obj: group, disc, progressRing };
}

export function createGameView(
  renderer: ThreeMapRenderer,
  simulation: GameSimulation,
  options?: GameViewOptions,
): GameView {
  const group = new THREE.Group();
  group.name = 'game';
  renderer.scene.add(group);

  const objects = new Map<UnitId, THREE.Object3D>();
  // Reverse index: top-level unit object → unit id, for pickUnit's parent walk.
  const unitByObject = new Map<THREE.Object3D, UnitId>();
  let followId: UnitId | null = null;
  let selectedId: UnitId | null = null;
  const selectionRing = createSelectionRing();
  group.add(selectionRing);

  // Sites are fixed for the simulation's lifetime: built once here, no add/remove path.
  // Deliberately NOT entered into `unitByObject` — see pickUnit below.
  const neutralSiteColor = options?.neutralSiteColor ?? DEFAULT_NEUTRAL_SITE_COLOR;
  const siteEntries: SiteEntry[] = [];
  for (const site of simulation.listSites()) {
    let obj: THREE.Object3D;
    let disc: THREE.Mesh | undefined;
    let progressRing: THREE.Mesh | undefined;
    if (options?.siteObject) {
      obj = options.siteObject(site);
    } else {
      const marker = createDefaultSiteMarker(site, options?.factionColors, neutralSiteColor);
      obj = marker.obj;
      disc = marker.disc;
      progressRing = marker.progressRing;
    }
    obj.name = `game:site:${site.id}`;
    obj.position.set(site.position.x, site.position.y, site.position.z);
    group.add(obj);
    siteEntries.push({
      site,
      obj,
      disc,
      progressRing,
      // Matches the color createDefaultSiteMarker just applied above, so the
      // first syncSites() call correctly skips re-applying it.
      lastOwnerFactionId: site.ownerFactionId,
      lastCapturingFactionId: null,
    });
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const addUnit = (unit: Unit): void => {
    const obj = options?.unitObject?.(unit) ?? defaultMarker(unit, options?.factionColors);
    obj.name = `game:unit:${unit.id}`;
    obj.position.set(unit.position.x, unit.position.y, unit.position.z);
    obj.rotation.y = unit.heading;
    group.add(obj);
    objects.set(unit.id, obj);
    unitByObject.set(obj, unit.id);
  };

  const removeMesh = (id: UnitId): void => {
    const obj = objects.get(id);
    if (!obj) return;
    group.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    objects.delete(id);
    unitByObject.delete(obj);
    if (followId === id) followUnit(null);
    if (selectedId === id) selectUnit(null);
  };

  for (const unit of simulation.listUnits()) addUnit(unit);

  const off = simulation.on((e) => {
    if (e.type === 'unit:spawned') {
      const unit = simulation.getUnit(e.unitId);
      if (unit) addUnit(unit);
    } else if (e.type === 'unit:removed') {
      removeMesh(e.unitId);
    }
  });

  /** Reposition the selection ring on the selected unit; hide/clear if it's gone. */
  const updateSelectionRing = (): void => {
    if (selectedId === null) return;
    const u = simulation.getUnit(selectedId);
    if (!u) {
      selectedId = null;
      selectionRing.visible = false;
      return;
    }
    selectionRing.visible = true;
    selectionRing.position.set(u.position.x, u.position.y + 0.5, u.position.z);
  };

  /**
   * Re-color and re-scale each default site marker from its live `Site` state.
   * Colors are only re-parsed from their CSS strings when the relevant
   * faction id actually changed since the last frame — with dozens of sites
   * (e.g. the historical world's ~51), re-parsing unconditionally every frame
   * for values that change roughly once per capture is wasted work.
   */
  const syncSites = (): void => {
    for (const entry of siteEntries) {
      if (!entry.disc || !entry.progressRing) continue; // custom siteObject: caller-managed
      const { site, disc, progressRing } = entry;
      if (entry.lastOwnerFactionId !== site.ownerFactionId) {
        (disc.material as THREE.MeshBasicMaterial).color.set(
          factionOrNeutralColor(site.ownerFactionId, options?.factionColors, neutralSiteColor),
        );
        entry.lastOwnerFactionId = site.ownerFactionId;
      }
      if (site.captureProgress > 0) {
        progressRing.visible = true;
        const frac =
          site.captureTime > 0 ? Math.min(site.captureProgress / site.captureTime, 1) : 0;
        progressRing.scale.set(frac, 1, frac);
        if (entry.lastCapturingFactionId !== site.capturingFactionId) {
          (progressRing.material as THREE.MeshBasicMaterial).color.set(
            factionOrNeutralColor(site.capturingFactionId, options?.factionColors, neutralSiteColor),
          );
          entry.lastCapturingFactionId = site.capturingFactionId;
        }
      } else {
        progressRing.visible = false;
      }
    }
  };

  const sync = (): void => {
    for (const [id, obj] of objects) {
      const u = simulation.getUnit(id);
      if (!u) continue;
      obj.position.set(u.position.x, u.position.y, u.position.z);
      obj.rotation.y = u.heading;
    }
    updateSelectionRing();
    syncSites();
  };

  const offFrame = renderer.onFrame((dt) => {
    simulation.tick(dt);
    sync();
  });

  function followUnit(id: UnitId | null): void {
    if (id === null) {
      followId = null;
      renderer.setFollowTarget(null);
      return;
    }
    followId = id;
    renderer.setFollowTarget(() => {
      const u = simulation.getUnit(id);
      return u ? { x: u.position.x, y: u.position.y, z: u.position.z } : null;
    });
  }

  function selectUnit(id: UnitId | null): void {
    selectedId = id;
    if (id === null) {
      selectionRing.visible = false;
      return;
    }
    updateSelectionRing();
  }

  function getSelectedUnit(): UnitId | null {
    return selectedId;
  }

  function pickUnit(pointer: { x: number; y: number }): UnitId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((pointer.x - rect.left) / rect.width) * 2 - 1,
      -(((pointer.y - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, renderer.camera);
    const hits = raycaster.intersectObjects(group.children, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !unitByObject.has(o)) o = o.parent;
      if (o) {
        const id = unitByObject.get(o);
        if (id !== undefined) return id;
      }
    }
    return null;
  }

  return {
    group,
    simulation,
    followUnit,
    pickUnit,
    selectUnit,
    getSelectedUnit,
    dispose(): void {
      off();
      offFrame();
      renderer.setFollowTarget(null);
      for (const id of [...objects.keys()]) removeMesh(id);
      for (const entry of siteEntries) {
        group.remove(entry.obj);
        entry.obj.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) m.dispose();
          }
        });
      }
      group.remove(selectionRing);
      selectionRing.geometry.dispose();
      (selectionRing.material as THREE.Material).dispose();
      renderer.scene.remove(group);
    },
  };
}
