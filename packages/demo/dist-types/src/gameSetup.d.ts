import type { MapWorld } from '@map-engine/core';
import type { AiController, GameSimulation } from '@map-engine/game';
import type { GameView, ThreeMapRenderer } from '@map-engine/three';
/**
 * Opt-in game-layer demo — fully inert unless `?game=1` is present, so it
 * cannot affect the default demo or the existing e2e suite.
 *
 * C8 adds capturable sites, faction resources and (behind `?ai=1`) an AI
 * opponent on top of the C1/C7 unit-movement-and-combat sandbox. This module
 * derives sites/factions from the *demo's* knowledge of the world (historical
 * vs procedural/OSM) — `@map-engine/game` itself never learns about
 * historical or procedural worlds.
 */
export type GameDemoHandles = {
    sim: GameSimulation;
    view: GameView;
    ais: AiController[];
    /** Removes the click handler, the HUD element + its stylesheet, the AI frame hook and the view. */
    dispose(): void;
};
export declare function setupGameDemo(renderer: ThreeMapRenderer, world: MapWorld, params: URLSearchParams): GameDemoHandles | null;
