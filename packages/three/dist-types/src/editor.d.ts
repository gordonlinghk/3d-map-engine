import type { BuildingInfo, EditOverlay, MapWorld, PoiIcon, PoiInfo } from '@map-engine/core';
import type { ThreeMapRenderer } from './renderer';
export type EditorState = {
    enabled: boolean;
    addMode: boolean;
    poiMode: boolean;
    canUndo: boolean;
    canRedo: boolean;
    /** Bumped on every change so UIs can re-render. */
    tick: number;
};
export type BuildingEditor = {
    setEnabled(v: boolean): void;
    getState(): EditorState;
    onChange(cb: () => void): () => void;
    getBuilding(id: string): BuildingInfo | null;
    setFloors(id: string, floors: number): void;
    rename(id: string, name: string, description?: string): void;
    rotate(id: string, degrees: number): void;
    deleteBuilding(id: string): void;
    setAddMode(v: boolean): void;
    getPoi(id: string): PoiInfo | null;
    setPoiMode(v: boolean): void;
    renamePoi(id: string, name: string, description?: string): void;
    setPoiIcon(id: string, icon: PoiIcon): void;
    deletePoi(id: string): void;
    undo(): void;
    redo(): void;
    getOverlay(): EditOverlay;
    dispose(): void;
};
export declare function createBuildingEditor(renderer: ThreeMapRenderer, world: MapWorld, options?: {
    initialOverlay?: EditOverlay;
    onOverlayChange?: (overlay: EditOverlay) => void;
}): BuildingEditor;
