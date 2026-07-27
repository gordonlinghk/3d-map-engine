import { createWorldHeightSampler } from '@map-engine/core';
import type { MapWorld, Vec2, Vec3 } from '@map-engine/core';
import {
  buildGraphIndex,
  findPath,
  nearestNode,
  type EdgeCostFn,
  type PathResult,
  type RoadGraphIndex,
} from './pathfinding';

/**
 * A tiny, deterministic game-logic simulation layered on a MapWorld.
 *
 * It owns a set of **units** that move along the road graph. Movement is pure
 * data: `tick(dt)` advances every moving unit by `speed * dt` world units along
 * its route, samples terrain height so units hug the ground, updates `heading`,
 * and emits ordered events (spawn / waypoint / arrival / removal). No Three.js,
 * no DOM — the renderer binding (`@map-engine/three` `createGameView`) reads
 * this state each frame and syncs meshes.
 *
 * Units may also belong to a **faction** and fight: each `tick(dt)` resolves
 * engagement, movement and damage in three fixed phases (see `tick` below), so
 * combat is as reproducible as movement.
 *
 * On top of units it can own two optional, construction-time collections:
 * **sites** — fixed capturable map points that change hands when one faction
 * holds them uncontested — and **factions**, which accrue resources from the
 * sites they own and spend them on {@link GameSimulation.trainUnit}. A
 * simulation created without either behaves exactly like one from before they
 * existed, down to the event stream.
 *
 * Determinism: given the same world, the same construction options, the same
 * spawn/command calls and the same `dt` sequence, unit positions and hp, site
 * ownership and capture progress, faction resources and the event stream are
 * identical every run. Units, sites and factions are iterated in insertion
 * order and events flushed in emission order; targeting ties break on unit id.
 * Hp never regenerates.
 */

export type UnitId = string;
/** `'fighting'` = engaged with an enemy this tick, so movement is suspended. */
export type UnitState = 'idle' | 'moving' | 'arrived' | 'fighting';

export type Unit = {
  readonly id: UnitId;
  /**
   * Current world position; y hugs the terrain. The simulation owns and mutates
   * this in place each `tick` — read it freely, but do not mutate it (or any
   * field) externally or you will corrupt movement. `getUnit`/`listUnits`
   * return live references, not snapshots.
   */
  position: Vec3;
  /** Facing direction in radians: `atan2(dirX, dirZ)`. */
  heading: number;
  /** Travel speed in world units per second. */
  speed: number;
  state: UnitState;
  /** The road-node route currently being followed (null when idle/arrived). */
  path: PathResult | null;
  /** Distance travelled along the current movement, in world units. */
  progress: number;
  /** Caller-defined tag, e.g. 'soldier', 'cart'. Purely informational. */
  kind: string;
  /**
   * Combat allegiance. `null` = non-combatant: it never attacks and is never
   * targeted. Units fight only units of a *different* non-null faction.
   */
  factionId: string | null;
  /** Current health. Reaches `<= 0` → the unit is defeated and removed. */
  hp: number;
  /** Health at spawn; never changes (hp never regenerates). */
  maxHp: number;
  /** Damage per second dealt to the current target. `<= 0` = never attacks. */
  attackDamage: number;
  /** Engagement radius in world units (XZ distance). */
  attackRange: number;
  /** Free-form caller data. Never read by the simulation. */
  data: Record<string, unknown>;
};

export type SpawnOptions = {
  /** Explicit id. Auto-generated (`unit:{n}`) when omitted. Must be unique. */
  id?: UnitId;
  /** Start position (world XZ, `.y` = world z). Snapped to ground height. */
  position?: Vec2;
  /** Alternative to `position`: start at this road node. */
  atNode?: string;
  /** World units per second. Default 24. */
  speed?: number;
  kind?: string;
  /** Combat allegiance. Omitted/undefined → `null` (non-combatant). */
  factionId?: string;
  /** Starting (and max) health. Default 100. */
  hp?: number;
  /** Damage per second. Default 10. */
  attackDamage?: number;
  /** Engagement radius in world units (XZ). Default 8. */
  attackRange?: number;
  data?: Record<string, unknown>;
};

/**
 * A capturable map point. Sites are fixed at construction: id, position and the
 * capture/income parameters never change. Ownership, the capturing faction and
 * capture progress are mutated by `tick` — `listSites`/`getSite` hand back live
 * references, so read them freely but never write them.
 */
export type Site = {
  readonly id: string;
  /** Display label. Defaults to `id`. */
  readonly name: string;
  /** World position; `y` is the ground height sampled once, at construction. */
  readonly position: Vec3;
  /** Hold radius in world units (XZ distance, inclusive). */
  readonly captureRadius: number;
  /** Seconds of sole uncontested presence needed to flip ownership. */
  readonly captureTime: number;
  /** Resources per second paid to the owning faction. */
  readonly income: number;
  /** Owning faction, or null when neutral. */
  ownerFactionId: string | null;
  /** Faction currently accruing progress; null whenever `captureProgress` is 0. */
  capturingFactionId: string | null;
  /** Seconds accrued toward `captureTime` by `capturingFactionId`. */
  captureProgress: number;
  /** Free-form caller data. Never read by the simulation. */
  readonly data: Record<string, unknown>;
};

export type SiteDefinition = {
  /** Unique id; a duplicate throws at construction. */
  id: string;
  name?: string;
  /** World XZ (`.y` = world z), like `SpawnOptions.position`. Snapped to ground. */
  position: Vec2;
  /**
   * Initial owner; omitted = neutral. May name a faction absent from
   * `GameSimulationOptions.factions` — legal, the income is simply paid to
   * nobody.
   */
  ownerFactionId?: string;
  /** Default 12. Non-finite or `<= 0` falls back to the default. */
  captureRadius?: number;
  /** Default 5. Non-finite or `<= 0` falls back to the default. */
  captureTime?: number;
  /** Default 1. Non-finite or negative becomes 0 (a site paying nothing is legal). */
  income?: number;
  data?: Record<string, unknown>;
};

/** A faction that holds resources and can train units. */
export type FactionDefinition = {
  /** Unique id; a duplicate throws at construction. */
  id: string;
  /** Starting stock. Default 0. Non-finite or negative becomes 0. */
  resources?: number;
  /** Resources per second earned regardless of sites. Default 0. */
  income?: number;
};

/**
 * Live faction bookkeeping. `resources` is mutated every `tick` — read it, never
 * write it. Units may carry a `factionId` that was never registered as a
 * faction: combat is unaffected, but such a faction accrues nothing and cannot
 * train.
 */
export type FactionState = {
  readonly id: string;
  /** Resources per second earned regardless of sites. */
  readonly baseIncome: number;
  resources: number;
};

export type TrainOptions = {
  /** Where to train. Must exist and be owned by the training faction. */
  siteId: string;
  /** Resources to deduct. Must be finite and `>= 0`. */
  cost: number;
  /** Explicit id for the new unit; a duplicate throws, as `spawnUnit` does. */
  id?: UnitId;
  /** Forwarded to the spawn. Position and faction are set by `trainUnit`. */
  unit?: Omit<SpawnOptions, 'id' | 'position' | 'atNode' | 'factionId'>;
};

export type GameEvent =
  | { type: 'unit:spawned'; unitId: UnitId }
  | { type: 'unit:waypoint'; unitId: UnitId; nodeIndex: number }
  | { type: 'unit:arrived'; unitId: UnitId }
  /** One attacker's damage for one tick (`attackDamage * dt`). */
  | { type: 'unit:combat'; attackerId: UnitId; defenderId: UnitId; damage: number }
  /** Emitted immediately before the `unit:removed` of a unit killed in combat. */
  | { type: 'unit:defeated'; unitId: UnitId; attackerId: UnitId }
  | { type: 'unit:removed'; unitId: UnitId }
  /**
   * A faction started accruing capture progress on a site: its first tick as the
   * sole attacker, or the tick it took over from a different attacker (progress
   * resets to 0 either way).
   */
  | { type: 'site:capture-started'; siteId: string; factionId: string }
  /** A site changed hands. `previousOwnerFactionId` is null for a neutral site. */
  | {
      type: 'site:captured';
      siteId: string;
      factionId: string;
      previousOwnerFactionId: string | null;
    };

export interface GameSimulation {
  readonly index: RoadGraphIndex;
  spawnUnit(opts?: SpawnOptions): Unit;
  removeUnit(id: UnitId): void;
  getUnit(id: UnitId): Unit | undefined;
  listUnits(): Unit[];
  /**
   * Route a unit to a world XZ target (`.y` = world z), snapping both the unit's
   * current position and the target to the nearest road nodes. Returns false
   * (leaving the unit unchanged) when the unit is unknown or no route exists.
   */
  moveUnitTo(id: UnitId, target: Vec2): boolean;
  /** Follow an explicit precomputed node route. Returns false if unit unknown. */
  setUnitPath(id: UnitId, path: PathResult): boolean;
  /** Stop a unit where it is (state → 'idle', clears its route). */
  stopUnit(id: UnitId): void;
  /** Every site, in the order declared at construction. Live references. */
  listSites(): Site[];
  getSite(id: string): Site | undefined;
  /** Every registered faction, in registration order. Live references. */
  listFactions(): FactionState[];
  getFaction(id: string): FactionState | undefined;
  /**
   * Pay `opts.cost` out of the faction's resources and spawn a unit of that
   * faction at the site's position (state `'idle'`; `unit:spawned` is emitted
   * synchronously, exactly as with `spawnUnit`).
   *
   * Returns null — changing nothing and emitting nothing — when the faction is
   * not registered, the site is unknown, the site is not owned by that faction,
   * `cost` is negative or not finite, or the faction cannot afford it. Throws
   * only for a duplicate unit id — whether `opts.id` is explicit or, when
   * omitted, the id `spawnUnit` would otherwise auto-generate — and always
   * does so before spending anything.
   */
  trainUnit(factionId: string, opts: TrainOptions): Unit | null;
  /**
   * Advance the simulation by `dt` seconds and flush the resulting events.
   *
   * Five phases, in this order (all `dt > 0` only):
   * 1. **Engagement**, evaluated on tick-start positions: every unit with a
   *    non-null `factionId` and `attackDamage > 0` targets the nearest living
   *    enemy (different non-null faction) within `attackRange`, ties broken by
   *    smaller unit id.
   * 2. **Movement**: units without a target move as usual; units with one do not
   *    advance at all this tick (route and progress preserved, `state` →
   *    `'fighting'`).
   * 3. **Damage**: every engagement's `attackDamage * dt` is computed from the
   *    phase-1 targeting and only then applied, so mutual kills are symmetric.
   *    Units brought to `hp <= 0` are removed.
   * 4. **Capture**, on post-movement positions and the post-damage unit set (a
   *    unit killed this tick never counts). Per site, in declaration order, the
   *    factions *present* are those of units within `captureRadius`
   *    (non-combatants never count) and the *attackers* are the present
   *    factions other than the owner:
   *    - exactly one attacker and the owner absent → that faction becomes
   *      `capturingFactionId` (resetting progress and emitting
   *      `site:capture-started` if it wasn't already), then `captureProgress`
   *      grows by `dt`; reaching `captureTime` flips `ownerFactionId` and emits
   *      `site:captured` (both events can fire for one site in one tick);
   *    - contested (owner present alongside an attacker, or two or more
   *      attacking factions) → progress and capturer frozen, no events;
   *    - no attackers → progress decays by `dt`, and reaching 0 clears the
   *      capturer.
   * 5. **Income**: every registered faction, in registration order, gains
   *    `(baseIncome + the income of the sites it owns) * dt`, using ownership as
   *    of *after* phase 4 — so a site captured this tick already pays this tick.
   *    Sites owned by an unregistered faction pay nobody. No events.
   *
   * Event order within one tick is fixed: movement events (waypoint/arrival) in
   * unit insertion order, then one `unit:combat` per attacker in attacker
   * insertion order, then — per defeated unit in insertion order —
   * `unit:defeated` immediately followed by `unit:removed`, and finally site
   * events in site declaration order (`site:capture-started` before
   * `site:captured` for the same site).
   */
  tick(dt: number): void;
  /**
   * Subscribe to the event stream. Returns an unsubscribe function. Most events
   * fire during `tick`, but note that `spawnUnit` emits `unit:spawned`
   * synchronously (before you can subscribe — seed from `listUnits()` too, as
   * `createGameView` does), `removeUnit` emits `unit:removed` synchronously, and
   * a zero-distance `moveUnitTo`/`setUnitPath` emits `unit:arrived` during that
   * call rather than on the next `tick`.
   */
  on(handler: (e: GameEvent) => void): () => void;
}

export type GameSimulationOptions = {
  /** Override terrain sampling. Defaults to the world's height field. */
  heightSampler?: (x: number, z: number) => number;
  /** Constant lift above the ground, in world units. Default 0. */
  groundOffset?: number;
  /**
   * Per-edge cost weighting for the road graph this simulation routes on (see
   * `buildGraphIndex` / {@link EdgeCostFn}). Applied once, at construction.
   */
  edgeCost?: EdgeCostFn;
  /**
   * Capturable sites, fixed for the simulation's lifetime. Omit for a
   * unit-only simulation.
   */
  sites?: SiteDefinition[];
  /**
   * Factions that hold resources and can train units. Combat does not require
   * registration — a unit's `factionId` is independent of this list.
   */
  factions?: FactionDefinition[];
};

/** Internal per-unit movement geometry (arc-length parameterised polyline). */
type Mover = {
  points: Vec3[];
  /** Cumulative XZ arc length at each point (`cumulative[0] === 0`). */
  cumulative: number[];
  total: number;
  /** Arc-length + path-node-index for each point that is a road node. */
  waypoints: { arc: number; nodeIndex: number }[];
  nextWaypoint: number;
};

/** A finite positive number, else the default — for radii and durations. */
function positiveOr(v: number | undefined, fallback: number): number {
  return v === undefined || !Number.isFinite(v) || v <= 0 ? fallback : v;
}

/** A finite non-negative number: undefined → default, junk or negative → 0. */
function nonNegativeOr(v: number | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  return !Number.isFinite(v) || v < 0 ? 0 : v;
}

export function createGameSimulation(
  world: MapWorld,
  opts: GameSimulationOptions = {},
): GameSimulation {
  const index = buildGraphIndex(world.roadGraph, { edgeCost: opts.edgeCost });
  const sampleRaw = opts.heightSampler ?? createWorldHeightSampler(world);
  const waterLevel = world.config.waterLevel;
  const groundOffset = opts.groundOffset ?? 0;
  const groundY = (x: number, z: number): number =>
    Math.max(sampleRaw(x, z), waterLevel) + groundOffset;

  const units = new Map<UnitId, Unit>();
  const movers = new Map<UnitId, Mover>();
  /**
   * State a unit held when it entered combat, so leaving combat restores it
   * instead of guessing. Re-recorded on every fresh entry into `'fighting'`, so
   * `stopUnit`/`moveUnitTo` calls made mid-fight win over the stale value.
   */
  const preFightState = new Map<UnitId, UnitState>();

  // Sites and factions are built once, here: insertion order is the declaration
  // order every phase and getter iterates in, which is what makes capture and
  // income accumulation reproducible.
  const sites = new Map<string, Site>();
  for (const def of opts.sites ?? []) {
    if (sites.has(def.id)) throw new Error(`Site id already exists: ${def.id}`);
    const x = def.position.x;
    const z = def.position.y;
    sites.set(def.id, {
      id: def.id,
      name: def.name ?? def.id,
      position: { x, y: groundY(x, z), z },
      captureRadius: positiveOr(def.captureRadius, 12),
      captureTime: positiveOr(def.captureTime, 5),
      income: nonNegativeOr(def.income, 1),
      ownerFactionId: def.ownerFactionId ?? null,
      capturingFactionId: null,
      captureProgress: 0,
      data: def.data ?? {},
    });
  }
  const factions = new Map<string, FactionState>();
  for (const def of opts.factions ?? []) {
    if (factions.has(def.id)) throw new Error(`Faction id already exists: ${def.id}`);
    factions.set(def.id, {
      id: def.id,
      baseIncome: nonNegativeOr(def.income, 0),
      resources: nonNegativeOr(def.resources, 0),
    });
  }

  const handlers = new Set<(e: GameEvent) => void>();
  const pending: GameEvent[] = [];
  let autoId = 0;

  let flushing = false;
  const emit = (e: GameEvent): void => {
    pending.push(e);
  };
  const flush = (): void => {
    // A handler may re-enter (spawn/remove/move a unit, which emits + flushes).
    // Guard so nested calls just append to `pending`; the single top-level loop
    // delivers every event in strict emission order to every subscriber.
    if (flushing) return;
    flushing = true;
    try {
      while (pending.length > 0) {
        const e = pending.shift()!;
        for (const h of handlers) h(e);
      }
    } finally {
      flushing = false;
    }
  };

  /** Build arc-length geometry for a polyline; mark which points are nodes. */
  const buildMover = (points: Vec3[], nodeIndexAt: (i: number) => number | null): Mover => {
    const cumulative: number[] = [0];
    const waypoints: { arc: number; nodeIndex: number }[] = [];
    const first = nodeIndexAt(0);
    if (first !== null) waypoints.push({ arc: 0, nodeIndex: first });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
      const ni = nodeIndexAt(i);
      if (ni !== null) waypoints.push({ arc: cumulative[i]!, nodeIndex: ni });
    }
    return {
      points,
      cumulative,
      total: cumulative[cumulative.length - 1] ?? 0,
      waypoints,
      // Waypoint at arc 0 (the start node) is not "reached by travelling".
      nextWaypoint: waypoints.length > 0 && waypoints[0]!.arc === 0 ? 1 : 0,
    };
  };

  const positionAlong = (mover: Mover, s: number, out: Vec3): void => {
    const cum = mover.cumulative;
    if (s <= 0) {
      const p = mover.points[0]!;
      out.x = p.x;
      out.z = p.z;
      return;
    }
    let lo = 0;
    while (lo < cum.length - 2 && cum[lo + 1]! < s) lo++;
    const a = mover.points[lo]!;
    const b = mover.points[lo + 1]!;
    const segLen = cum[lo + 1]! - cum[lo]! || 1;
    const t = Math.min(Math.max((s - cum[lo]!) / segLen, 0), 1);
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
  };

  const beginMovement = (unit: Unit, mover: Mover, path: PathResult): void => {
    if (mover.total <= 1e-6) {
      // Already there — nothing to travel.
      movers.delete(unit.id);
      unit.path = path;
      unit.progress = 0;
      unit.state = 'arrived';
      emit({ type: 'unit:arrived', unitId: unit.id });
      return;
    }
    movers.set(unit.id, mover);
    unit.path = path;
    unit.progress = 0;
    unit.state = 'moving';
  };

  const spawnUnit = (o: SpawnOptions = {}): Unit => {
    const id = o.id ?? `unit:${autoId++}`;
    if (units.has(id)) throw new Error(`Unit id already exists: ${id}`);
    let x: number;
    let z: number;
    if (o.atNode) {
      const p = index.nodeById.get(o.atNode);
      if (!p) throw new Error(`Unknown road node: ${o.atNode}`);
      x = p.x;
      z = p.z;
    } else if (o.position) {
      x = o.position.x;
      z = o.position.y;
    } else {
      x = 0;
      z = 0;
    }
    const hp = o.hp ?? 100;
    const unit: Unit = {
      id,
      position: { x, y: groundY(x, z), z },
      heading: 0,
      speed: o.speed ?? 24,
      state: 'idle',
      path: null,
      progress: 0,
      kind: o.kind ?? 'unit',
      factionId: o.factionId ?? null,
      hp,
      maxHp: hp,
      attackDamage: o.attackDamage ?? 10,
      attackRange: o.attackRange ?? 8,
      data: o.data ?? {},
    };
    units.set(id, unit);
    emit({ type: 'unit:spawned', unitId: id });
    flush();
    return unit;
  };

  const removeUnit = (id: UnitId): void => {
    if (!units.has(id)) return;
    units.delete(id);
    movers.delete(id);
    preFightState.delete(id);
    emit({ type: 'unit:removed', unitId: id });
    flush();
  };

  const stopUnit = (id: UnitId): void => {
    const unit = units.get(id);
    if (!unit) return;
    movers.delete(id);
    preFightState.delete(id);
    unit.path = null;
    unit.progress = 0;
    unit.state = 'idle';
  };

  const moveUnitTo = (id: UnitId, target: Vec2): boolean => {
    const unit = units.get(id);
    if (!unit) return false;
    const from = nearestNode(index, unit.position.x, unit.position.z);
    const to = nearestNode(index, target.x, target.y);
    if (!from || !to) return false;
    const path = findPath(index, from, to);
    if (!path.found) return false;

    // Movement polyline: current position → road nodes → exact target.
    const targetPoint: Vec3 = { x: target.x, y: groundY(target.x, target.y), z: target.y };
    const points: Vec3[] = [{ ...unit.position }, ...path.points.map((p) => ({ ...p })), targetPoint];
    // Point i (for i in 1..path.nodes.length) is road node index i-1.
    const beginMover = buildMover(points, (i) =>
      i >= 1 && i <= path.nodes.length ? i - 1 : null,
    );
    beginMovement(unit, beginMover, path);
    flush();
    return true;
  };

  const setUnitPath = (id: UnitId, path: PathResult): boolean => {
    const unit = units.get(id);
    if (!unit) return false;
    if (!path.found || path.points.length === 0) {
      stopUnit(id);
      return false;
    }
    const points = path.points.map((p) => ({ ...p }));
    const mover = buildMover(points, (i) => i);
    beginMovement(unit, mover, path);
    flush();
    return true;
  };

  /**
   * Phase 1 — engagement, resolved on tick-start positions so the outcome does
   * not depend on who moved first. Returns attackerId → defenderId for every
   * unit that found an enemy: nearest (XZ) living unit of a different non-null
   * faction within range, ties broken by smaller unit id.
   */
  const selectTargets = (): Map<UnitId, UnitId> => {
    const targets = new Map<UnitId, UnitId>();
    for (const unit of units.values()) {
      if (unit.factionId === null || unit.attackDamage <= 0) continue;
      let bestId: UnitId | null = null;
      let bestD = Infinity;
      for (const other of units.values()) {
        if (other === unit || other.factionId === null) continue;
        if (other.factionId === unit.factionId) continue;
        const dx = other.position.x - unit.position.x;
        const dz = other.position.z - unit.position.z;
        const d = Math.hypot(dx, dz);
        if (d > unit.attackRange) continue;
        if (d < bestD || (d === bestD && bestId !== null && other.id < bestId)) {
          bestD = d;
          bestId = other.id;
        }
      }
      if (bestId !== null) targets.set(unit.id, bestId);
    }
    return targets;
  };

  /**
   * Phase 3 — damage. Every hit is computed from phase-1 targeting *before* any
   * hp is written, so two units in range can kill each other on the same tick.
   * Only units damaged this tick can be defeated (an attacker is required for
   * `unit:defeated`; a unit spawned at `hp <= 0` that nobody attacks survives).
   */
  const resolveCombat = (targets: Map<UnitId, UnitId>, dt: number): void => {
    if (targets.size === 0) return;
    // Attacker insertion order.
    const hits: { attackerId: UnitId; defenderId: UnitId; damage: number }[] = [];
    for (const unit of units.values()) {
      const defenderId = targets.get(unit.id);
      if (defenderId === undefined) continue;
      hits.push({ attackerId: unit.id, defenderId, damage: unit.attackDamage * dt });
    }
    const damaged = new Set<UnitId>();
    for (const hit of hits) {
      const defender = units.get(hit.defenderId);
      if (!defender) continue;
      defender.hp -= hit.damage;
      damaged.add(hit.defenderId);
    }
    for (const hit of hits) emit({ type: 'unit:combat', ...hit });
    // Defeated in defeated-unit insertion order; attacker = earliest hit on it.
    const defeated: { unitId: UnitId; attackerId: UnitId }[] = [];
    for (const unit of units.values()) {
      if (!damaged.has(unit.id) || unit.hp > 0) continue;
      const killer = hits.find((h) => h.defenderId === unit.id)!;
      defeated.push({ unitId: unit.id, attackerId: killer.attackerId });
    }
    for (const { unitId, attackerId } of defeated) {
      units.delete(unitId);
      movers.delete(unitId);
      preFightState.delete(unitId);
      emit({ type: 'unit:defeated', unitId, attackerId });
      emit({ type: 'unit:removed', unitId });
    }
  };

  /**
   * Phase 4 — capture, on post-movement positions and the post-damage unit set.
   * Sites are walked in declaration order and each is decided independently by
   * who stands inside it: sole attacker accrues, contested freezes, empty
   * decays. Only ownership flips and capturer changes emit events; progress is
   * polled (`getSite`) rather than broadcast, so a fight over a site does not
   * flood the event stream the way per-tick progress events would.
   */
  const resolveCapture = (dt: number): void => {
    if (sites.size === 0) return;
    for (const site of sites.values()) {
      const owner = site.ownerFactionId;
      // Factions with at least one unit inside the radius. Non-combatants
      // (null faction) never hold ground.
      const present = new Set<string>();
      for (const unit of units.values()) {
        if (unit.factionId === null) continue;
        if (present.has(unit.factionId)) continue;
        const dx = unit.position.x - site.position.x;
        const dz = unit.position.z - site.position.z;
        if (Math.hypot(dx, dz) <= site.captureRadius) present.add(unit.factionId);
      }
      let attackers = 0;
      let soleAttacker: string | null = null;
      for (const factionId of present) {
        if (factionId === owner) continue;
        attackers++;
        soleAttacker = factionId;
      }
      const ownerPresent = owner !== null && present.has(owner);

      if (attackers === 1 && !ownerPresent && soleAttacker !== null) {
        if (site.capturingFactionId !== soleAttacker) {
          site.capturingFactionId = soleAttacker;
          site.captureProgress = 0;
          emit({ type: 'site:capture-started', siteId: site.id, factionId: soleAttacker });
        }
        site.captureProgress += dt;
        if (site.captureProgress >= site.captureTime) {
          site.ownerFactionId = soleAttacker;
          site.capturingFactionId = null;
          site.captureProgress = 0;
          emit({
            type: 'site:captured',
            siteId: site.id,
            factionId: soleAttacker,
            previousOwnerFactionId: owner,
          });
        }
      } else if (attackers === 0) {
        site.captureProgress = Math.max(0, site.captureProgress - dt);
        if (site.captureProgress === 0) site.capturingFactionId = null;
      }
      // Otherwise contested: progress and capturer are frozen, silently.
    }
  };

  /**
   * Phase 5 — income, on post-capture ownership, so a site taken this tick
   * already pays for it. Site income is summed in declaration order and
   * factions credited in registration order, keeping the float arithmetic
   * bit-for-bit reproducible.
   */
  const resolveIncome = (dt: number): void => {
    if (factions.size === 0) return;
    const fromSites = new Map<string, number>();
    for (const site of sites.values()) {
      const owner = site.ownerFactionId;
      if (owner === null) continue;
      fromSites.set(owner, (fromSites.get(owner) ?? 0) + site.income);
    }
    for (const faction of factions.values()) {
      faction.resources += (faction.baseIncome + (fromSites.get(faction.id) ?? 0)) * dt;
    }
  };

  const trainUnit = (factionId: string, o: TrainOptions): Unit | null => {
    const faction = factions.get(factionId);
    if (!faction) return null;
    const site = sites.get(o.siteId);
    if (!site || site.ownerFactionId !== factionId) return null;
    if (!Number.isFinite(o.cost) || o.cost < 0) return null;
    if (faction.resources < o.cost) return null;
    // Validate the id — explicit, or the auto-generated candidate spawnUnit
    // would otherwise assign — before spending, so a throw always leaves
    // resources untouched, even when an omitted id happens to collide with a
    // unit the caller created earlier under that literal auto-generated id.
    const candidateId = o.id ?? `unit:${autoId}`;
    if (units.has(candidateId)) throw new Error(`Unit id already exists: ${candidateId}`);
    faction.resources -= o.cost;
    return spawnUnit({
      ...o.unit,
      id: o.id,
      position: { x: site.position.x, y: site.position.z },
      factionId,
    });
  };

  const tick = (dt: number): void => {
    if (dt > 0) {
      const targets = selectTargets();
      for (const unit of units.values()) {
        // Phase 2 — engaged units hold position (route + progress preserved).
        if (targets.has(unit.id)) {
          if (unit.state !== 'fighting') {
            preFightState.set(unit.id, unit.state);
            unit.state = 'fighting';
          }
          continue;
        }
        if (unit.state === 'fighting') {
          // Disengaged: resume travel, or fall back to the pre-fight resting
          // state ('arrived' is preserved rather than re-fired).
          unit.state = movers.has(unit.id)
            ? 'moving'
            : preFightState.get(unit.id) === 'arrived'
              ? 'arrived'
              : 'idle';
          preFightState.delete(unit.id);
        }
        if (unit.state !== 'moving') continue;
        const mover = movers.get(unit.id);
        if (!mover) {
          unit.state = 'idle';
          continue;
        }
        const prev = unit.progress;
        unit.progress = Math.min(prev + unit.speed * dt, mover.total);

        // Facing: sample a hair ahead so heading stays stable at the end.
        const ahead = new Vec3Tmp();
        positionAlong(mover, Math.min(unit.progress + 0.5, mover.total), ahead);
        positionAlong(mover, unit.progress, unit.position);
        unit.position.y = groundY(unit.position.x, unit.position.z);
        const dx = ahead.x - unit.position.x;
        const dz = ahead.z - unit.position.z;
        if (dx * dx + dz * dz > 1e-8) unit.heading = Math.atan2(dx, dz);

        // Waypoint crossings (in order).
        while (
          mover.nextWaypoint < mover.waypoints.length &&
          unit.progress >= mover.waypoints[mover.nextWaypoint]!.arc
        ) {
          emit({
            type: 'unit:waypoint',
            unitId: unit.id,
            nodeIndex: mover.waypoints[mover.nextWaypoint]!.nodeIndex,
          });
          mover.nextWaypoint++;
        }

        if (unit.progress >= mover.total) {
          movers.delete(unit.id);
          unit.state = 'arrived';
          emit({ type: 'unit:arrived', unitId: unit.id });
        }
      }
      resolveCombat(targets, dt);
      resolveCapture(dt);
      resolveIncome(dt);
    }
    flush();
  };

  return {
    index,
    spawnUnit,
    removeUnit,
    getUnit: (id) => units.get(id),
    listUnits: () => [...units.values()],
    moveUnitTo,
    setUnitPath,
    stopUnit,
    listSites: () => [...sites.values()],
    getSite: (id) => sites.get(id),
    listFactions: () => [...factions.values()],
    getFaction: (id) => factions.get(id),
    trainUnit,
    tick,
    on(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

/** Minimal mutable XZ scratch vector (avoids allocating a Vec3 per frame). */
class Vec3Tmp {
  x = 0;
  y = 0;
  z = 0;
}
