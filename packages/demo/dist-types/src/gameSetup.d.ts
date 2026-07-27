import type { MapWorld } from '@map-engine/core';
import type { UnitId } from '@map-engine/game';
import type { ThreeMapRenderer } from '@map-engine/three';
import type { Scenario } from './game/scenario';
/**
 * Scenario-driven game controller for the demo.
 *
 * C9 attaches the game layer to the **Three Kingdoms historical map only**: a
 * fixed `Scenario` (`JINGZHOU_219`) names the cities, factions, colors, unit
 * stats and win/lose copy, and this module turns that into a
 * `@map-engine/game` simulation plus a `@map-engine/three` view. On procedural
 * or OSM worlds `?game=1` is completely inert — `setupGameDemo` returns null
 * and nothing is created (the C8 procedural sandbox, its BFS spawn picks and
 * its DOM HUD are gone).
 *
 * The controller is UI-agnostic: it owns simulation + view + input and exposes
 * a small observable snapshot (`getState`/`subscribe`) plus screen-space city
 * labels, so the React layer can render a lobby, a status bar and an end
 * overlay without knowing anything about Three.js or `@map-engine/game`.
 *
 * Lifecycle: `setupGameDemo` only ever produces a **lobby** — no simulation, no
 * view, no listeners. `start(factionId)` builds everything; `dispose()` undoes
 * whatever exists in whichever phase it runs, so it is safe under React
 * StrictMode's mount/unmount/mount.
 */
export type GamePhase = 'lobby' | 'playing' | 'won' | 'lost';
export type FactionStatus = {
    id: string;
    name: string;
    color: string;
    /** Sites currently owned. */
    cityCount: number;
    resources: number;
    unitCount: number;
    isPlayer: boolean;
};
export type GameSelection = {
    kind: 'unit';
    id: UnitId;
    factionId: string | null;
    hp: number;
    maxHp: number;
    isPlayerUnit: boolean;
} | {
    kind: 'site';
    id: string;
    cityId: string;
    name: string;
    owner: string | null;
    isPlayerOwned: boolean;
} | null;
export type GameUiState = {
    phase: GamePhase;
    /** null in the lobby. */
    playerFactionId: string | null;
    /**
     * Scenario faction order. In the lobby these are scenario-derived
     * (`cityCount` = declared cities, `resources` = starting stock, no units).
     */
    factions: FactionStatus[];
    totalSites: number;
    trainCost: number;
    /** phase 'playing' && the selection is an owned site && player can afford it. */
    canTrain: boolean;
    selection: GameSelection;
    /** Bumped (new object, seq+1) on every successful move command — the UI renders a ground ping. World coords. */
    lastCommand: {
        x: number;
        z: number;
        seq: number;
    } | null;
    /** Monotonic; bumped whenever any of the above changed. */
    version: number;
};
export type CityLabel = {
    cityId: string;
    name: string;
    /** Owner's scenario color, or the neutral grey when the owner is not a scenario faction. */
    ownerColor: string;
    x: number;
    y: number;
    /** On-screen and in front of the camera. */
    visible: boolean;
};
export type GameController = {
    scenario: Scenario;
    /** Stable snapshot reference until `version` bumps. */
    getState(): GameUiState;
    /** Called (sync or next frame) after `version` bumps; NOT every frame. */
    subscribe(cb: () => void): () => void;
    /** Fresh screen-space projections of the scenario's cities. Call from the UI's own rAF; do not cache. */
    getCityLabels(): CityLabel[];
    /**
     * lobby → playing. Creates sim + view + AIs, spawns starting units, focuses
     * the camera on the scenario region. No-op unless the phase is 'lobby' and
     * the id names a scenario faction.
     */
    start(playerFactionId: string): void;
    /** `trainUnit` at the selected own site. False (no state change) when `canTrain` is false. */
    train(): boolean;
    clearSelection(): void;
    dispose(): void;
};
/**
 * True when this URL asks for the game on a historical map — the App uses it to
 * swap `AtlasUI` for the game UI. Deliberately independent of `setupGameDemo`'s
 * own gate (which inspects the loaded world) so the UI can decide before the
 * world has finished booting.
 */
export declare function isGameModeUrl(params: URLSearchParams): boolean;
export declare function setupGameDemo(renderer: ThreeMapRenderer, world: MapWorld, params: URLSearchParams): GameController | null;
