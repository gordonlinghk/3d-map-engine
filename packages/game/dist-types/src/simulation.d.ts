import type { MapWorld, Vec2, Vec3 } from '@map-engine/core';
import { type EdgeCostFn, type PathResult, type RoadGraphIndex } from './pathfinding';
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
export type GameEvent = {
    type: 'unit:spawned';
    unitId: UnitId;
} | {
    type: 'unit:waypoint';
    unitId: UnitId;
    nodeIndex: number;
} | {
    type: 'unit:arrived';
    unitId: UnitId;
}
/** One attacker's damage for one tick (`attackDamage * dt`). */
 | {
    type: 'unit:combat';
    attackerId: UnitId;
    defenderId: UnitId;
    damage: number;
}
/** Emitted immediately before the `unit:removed` of a unit killed in combat. */
 | {
    type: 'unit:defeated';
    unitId: UnitId;
    attackerId: UnitId;
} | {
    type: 'unit:removed';
    unitId: UnitId;
}
/**
 * A faction started accruing capture progress on a site: its first tick as the
 * sole attacker, or the tick it took over from a different attacker (progress
 * resets to 0 either way).
 */
 | {
    type: 'site:capture-started';
    siteId: string;
    factionId: string;
}
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
export declare function createGameSimulation(world: MapWorld, opts?: GameSimulationOptions): GameSimulation;
