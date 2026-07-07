import type { MapWorld, Vec2, Vec3 } from '@map-engine/core';
import { type PathResult, type RoadGraphIndex } from './pathfinding';
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
 * Determinism: given the same world, the same spawn calls and the same `dt`
 * sequence, unit positions and the event stream are identical every run. Units
 * are ticked and events flushed in insertion order.
 */
export type UnitId = string;
export type UnitState = 'idle' | 'moving' | 'arrived';
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
    data?: Record<string, unknown>;
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
} | {
    type: 'unit:removed';
    unitId: UnitId;
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
    /** Advance all moving units and flush the resulting events to subscribers. */
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
};
export declare function createGameSimulation(world: MapWorld, opts?: GameSimulationOptions): GameSimulation;
