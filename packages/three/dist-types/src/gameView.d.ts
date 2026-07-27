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
    pickUnit(pointer: {
        x: number;
        y: number;
    }): UnitId | null;
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
    pickSite(pointer: {
        x: number;
        y: number;
    }): string | null;
    selectUnit(id: UnitId | null): void;
    getSelectedUnit(): UnitId | null;
    /** Detach everything: unsubscribe, remove + dispose meshes, stop follow. */
    dispose(): void;
}
export declare function createGameView(renderer: ThreeMapRenderer, simulation: GameSimulation, options?: GameViewOptions): GameView;
