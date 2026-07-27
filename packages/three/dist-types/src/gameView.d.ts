import * as THREE from 'three';
import type { GameSimulation, Site, Unit, UnitId } from '@map-engine/game';
import type { ThreeMapRenderer } from './renderer';
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
    pickUnit(pointer: {
        x: number;
        y: number;
    }): UnitId | null;
    selectUnit(id: UnitId | null): void;
    getSelectedUnit(): UnitId | null;
    /** Detach everything: unsubscribe, remove + dispose meshes, stop follow. */
    dispose(): void;
}
export declare function createGameView(renderer: ThreeMapRenderer, simulation: GameSimulation, options?: GameViewOptions): GameView;
