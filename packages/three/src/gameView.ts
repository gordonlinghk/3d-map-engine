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

/** Health-bar geometry in world units (see `GameViewOptions.healthBars`). */
const HP_BAR_WIDTH = 6;
const HP_BAR_THICKNESS = 0.8;
/** Lift above the unit object's origin — clears the default cone (apex ≈ y 5.5). */
const HP_BAR_LIFT = 7;
/**
 * Endpoints of the fill's color ramp, parsed once at module load: `syncHpBar`
 * lerps between them every frame and must never allocate a `THREE.Color`.
 */
const HP_COLOR_FULL = new THREE.Color('#2ecc71');
const HP_COLOR_EMPTY = new THREE.Color('#e74c3c');

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
  /**
   * Float a health bar over every unit. Default `false`, in which case not a
   * single sprite is created and the scene graph is exactly what it was before
   * this option existed.
   *
   * The bar is a `THREE.Group` named `game:hp:{unitId}` parented to the unit's
   * top-level object — so it works with a custom `unitObject` too — and is
   * visible only while `hp < maxHp`; an undamaged unit shows nothing. Its two
   * sprites are excluded from raycasting, so neither `pickUnit` nor `pickSite`
   * can ever hit a health bar.
   *
   * The bar sits `7` world units above the unit object's origin, which assumes
   * a roughly default-marker-sized object (the default cone tops out near
   * `y 5.5`). A caller whose `unitObject` is much taller will see the bar
   * buried inside it and probably wants to leave this off and draw its own.
   */
  healthBars?: boolean;
};

export interface GameView {
  readonly group: THREE.Group;
  readonly simulation: GameSimulation;
  /** Follow a unit with the camera; pass null to stop following. */
  followUnit(id: UnitId | null): void;
  /**
   * Raycast unit markers at client pixel coords (same convention as renderer.pickObject).
   *
   * Hits that are not units — site markers above all — are skipped rather than
   * blocking the scan, so a unit is still picked through the site disc it
   * stands on. See `pickSite` for the precedence this implies.
   */
  pickUnit(pointer: { x: number; y: number }): UnitId | null;
  /**
   * Raycast site markers at client pixel coords, returning the `Site.id`, or
   * null when the ray hits no site. Same coordinate convention as `pickUnit`,
   * and it works for a caller-supplied `siteObject` too: the reverse index is
   * keyed on whatever top-level object the view manages for the site.
   *
   * Mirror image of `pickUnit`: unit hits are skipped here, so a unit standing
   * on a site disc does not hide the site behind it. The consequence is that a
   * click on such a unit resolves to the *unit* via `pickUnit` **and** to the
   * *site* via `pickSite` — the two picks are deliberately independent and the
   * caller decides precedence (typically: try `pickUnit` first and only fall
   * back to `pickSite` when it returns null).
   */
  pickSite(pointer: { x: number; y: number }): string | null;
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

/** Bookkeeping for one unit's health bar, kept so `sync()` can update it allocation-free. */
type HpBarEntry = {
  readonly group: THREE.Group;
  readonly fill: THREE.Sprite;
  /**
   * hp fraction last written to `fill`'s scale and color, so `syncHpBar` only
   * touches the sprite when the unit actually took damage instead of every
   * frame for every unit — same caching idea as `SiteEntry.lastOwnerFactionId`.
   */
  lastFrac: number;
};

/**
 * A floating two-sprite health bar named `game:hp:{unitId}`. `THREE.Sprite`
 * billboards in the vertex shader, so the bar faces the camera with no
 * per-frame `lookAt` from us. Sprites without a `map` render as a flat colored
 * quad, so no texture is created or owned here.
 *
 * Starts hidden with a full fill, matching a freshly spawned unit's
 * `hp === maxHp` (the simulation sets `maxHp` from the spawn hp and never
 * regenerates), so the first `syncHpBar` correctly finds nothing to do.
 */
function createHealthBar(unitId: UnitId): HpBarEntry {
  const group = new THREE.Group();
  group.name = `game:hp:${unitId}`;
  group.position.y = HP_BAR_LIFT;
  group.visible = false;

  const background = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: '#12161c',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  background.scale.set(HP_BAR_WIDTH, HP_BAR_THICKNESS, 1);
  background.renderOrder = 11;
  group.add(background);

  const fill = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: HP_COLOR_FULL,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  // Both sprites sit exactly on the group's origin; the fill is left-anchored
  // through `center` rather than by offsetting `position.x` to
  // -(1 - frac) * HP_BAR_WIDTH / 2. A position offset lives in the parent's
  // local space, and the parent here is the unit object, whose `rotation.y`
  // tracks the unit's heading — the fill would swing around the unit as it
  // turned. `center` is applied after billboarding, in the sprite's own
  // screen-aligned plane, so it is immune to that rotation. `syncHpBar`
  // keeps `center.x * scale.x === HP_BAR_WIDTH / 2`, pinning the left edge
  // while the right one drains inward.
  fill.center.set(0.5, 0.5);
  fill.scale.set(HP_BAR_WIDTH, HP_BAR_THICKNESS, 1);
  fill.renderOrder = 12;
  group.add(fill);

  // Sprites are raycastable by default, and a bar hovering above its unit
  // would both widen that unit's hit area and shadow the site behind it.
  // Opting them out keeps pickUnit/pickSite behaving exactly as they do
  // without health bars.
  background.raycast = () => {};
  fill.raycast = () => {};

  return { group, fill, lastFrac: 1 };
}

/**
 * Remove-time cleanup shared by `removeMesh` and `dispose()`. `THREE.Sprite`
 * is not a `THREE.Mesh`, so it needs its own branch — and its geometry is a
 * single module-level buffer shared by every sprite three creates, so only the
 * material may be disposed.
 */
function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    } else if (o instanceof THREE.Sprite) {
      o.material.dispose();
    }
  });
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
  const healthBars = options?.healthBars === true;
  // Empty and never written when `healthBars` is false — every read of it is
  // guarded by that flag, so disabling the option costs nothing per frame.
  const hpBars = new Map<UnitId, HpBarEntry>();
  let followId: UnitId | null = null;
  let selectedId: UnitId | null = null;
  const selectionRing = createSelectionRing();
  group.add(selectionRing);

  // Sites are fixed for the simulation's lifetime: built once here, no add/remove path.
  // Deliberately NOT entered into `unitByObject` — see pickUnit below.
  const neutralSiteColor = options?.neutralSiteColor ?? DEFAULT_NEUTRAL_SITE_COLOR;
  const siteEntries: SiteEntry[] = [];
  // Reverse index: top-level site object → site id, for pickSite's parent walk.
  // The counterpart of `unitByObject`; the two are kept strictly disjoint so a
  // pick resolves to exactly one kind of thing.
  const siteByObject = new Map<THREE.Object3D, string>();
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
    siteByObject.set(obj, site.id);
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
  /** Scratch target for the health-bar color lerp; see `syncHpBar`. */
  const hpColor = new THREE.Color();

  const addUnit = (unit: Unit): void => {
    const obj = options?.unitObject?.(unit) ?? defaultMarker(unit, options?.factionColors);
    obj.name = `game:unit:${unit.id}`;
    obj.position.set(unit.position.x, unit.position.y, unit.position.z);
    obj.rotation.y = unit.heading;
    group.add(obj);
    objects.set(unit.id, obj);
    unitByObject.set(obj, unit.id);
    if (healthBars) {
      // Parented to the unit object, so it inherits its position for free and
      // is disposed by removeMesh's traversal along with everything else.
      const bar = createHealthBar(unit.id);
      obj.add(bar.group);
      hpBars.set(unit.id, bar);
    }
  };

  const removeMesh = (id: UnitId): void => {
    const obj = objects.get(id);
    if (!obj) return;
    group.remove(obj);
    disposeObject3D(obj);
    objects.delete(id);
    unitByObject.delete(obj);
    hpBars.delete(id);
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

  /**
   * Drain one unit's health bar to match its live hp. Allocation-free: the
   * color lerp runs through the shared `hpColor` scratch and the sprite is
   * only written when the fraction actually moved — hp changes on combat
   * ticks, not every frame, so the steady state is one float compare per unit.
   */
  const syncHpBar = (entry: HpBarEntry, unit: Unit): void => {
    // maxHp <= 0 is degenerate (a unit spawned with hp 0); report it as full so
    // the bar stays hidden rather than showing a permanently empty red stub.
    const frac = unit.maxHp > 0 ? Math.min(Math.max(unit.hp / unit.maxHp, 0), 1) : 1;
    const visible = frac < 1;
    if (entry.group.visible !== visible) entry.group.visible = visible;
    if (!visible || entry.lastFrac === frac) return;
    entry.fill.scale.x = HP_BAR_WIDTH * frac;
    // Keeps center.x * scale.x === HP_BAR_WIDTH / 2, i.e. the left edge pinned.
    // frac is > 0 here only when the unit is alive; guard the division anyway.
    entry.fill.center.x = frac > 0 ? 0.5 / frac : 0.5;
    hpColor.copy(HP_COLOR_EMPTY).lerp(HP_COLOR_FULL, frac);
    entry.fill.material.color.copy(hpColor);
    entry.lastFrac = frac;
  };

  const sync = (): void => {
    for (const [id, obj] of objects) {
      const u = simulation.getUnit(id);
      if (!u) continue;
      obj.position.set(u.position.x, u.position.y, u.position.z);
      obj.rotation.y = u.heading;
      if (healthBars) {
        const bar = hpBars.get(id);
        if (bar) syncHpBar(bar, u);
      }
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

  /**
   * Shared body of `pickUnit`/`pickSite`, unchanged from what `pickUnit` did
   * on its own: cast a ray from client pixel coords through the game group and
   * return the first hit that resolves — by walking up the parent chain — to an
   * entry of `index`. A hit that resolves to nothing, or to an object held in
   * the *other* index, is skipped and the scan continues to the hit behind it.
   * `unitByObject` and `siteByObject` are disjoint, so the two picks see
   * exactly the mirror image of each other's world.
   */
  function pickFromIndex<T>(
    pointer: { x: number; y: number },
    index: ReadonlyMap<THREE.Object3D, T>,
  ): T | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((pointer.x - rect.left) / rect.width) * 2 - 1,
      -(((pointer.y - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, renderer.camera);
    const hits = raycaster.intersectObjects(group.children, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !index.has(o)) o = o.parent;
      if (o) {
        const value = index.get(o);
        if (value !== undefined) return value;
      }
    }
    return null;
  }

  function pickUnit(pointer: { x: number; y: number }): UnitId | null {
    return pickFromIndex(pointer, unitByObject);
  }

  function pickSite(pointer: { x: number; y: number }): string | null {
    return pickFromIndex(pointer, siteByObject);
  }

  return {
    group,
    simulation,
    followUnit,
    pickUnit,
    pickSite,
    selectUnit,
    getSelectedUnit,
    dispose(): void {
      off();
      offFrame();
      renderer.setFollowTarget(null);
      for (const id of [...objects.keys()]) removeMesh(id);
      // Unit objects (and the health bars parented to them) were already torn
      // down by the removeMesh loop above, which shares this same traversal.
      for (const entry of siteEntries) {
        group.remove(entry.obj);
        disposeObject3D(entry.obj);
      }
      siteByObject.clear();
      group.remove(selectionRing);
      selectionRing.geometry.dispose();
      (selectionRing.material as THREE.Material).dispose();
      renderer.scene.remove(group);
    },
  };
}
