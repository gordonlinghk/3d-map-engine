import * as THREE from 'three';
import type { GameSimulation, Unit, UnitId } from '@map-engine/game';
import type { ThreeMapRenderer } from './renderer';
export type GameViewOptions = {
    /** Factory for a unit's 3D object. Default: a small colored arrow marker. */
    unitObject?: (unit: Unit) => THREE.Object3D;
};
export interface GameView {
    readonly group: THREE.Group;
    readonly simulation: GameSimulation;
    /** Follow a unit with the camera; pass null to stop following. */
    followUnit(id: UnitId | null): void;
    /** Detach everything: unsubscribe, remove + dispose meshes, stop follow. */
    dispose(): void;
}
export declare function createGameView(renderer: ThreeMapRenderer, simulation: GameSimulation, options?: GameViewOptions): GameView;
