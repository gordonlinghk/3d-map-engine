import type { MapLayerId, MapWorld } from '@map-engine/core';

/**
 * Structural interface of the renderer used by the UI. `ThreeMapRenderer`
 * satisfies it — the UI package deliberately avoids importing Three.js.
 */
export type CameraMode = 'orbit' | 'fly' | 'walk';
export type EnvironmentMode = 'day' | 'golden-hour' | 'night';

export interface MapRendererLike {
  readonly camera: { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } };
  readonly domElement: HTMLCanvasElement;
  setCameraMode(mode: CameraMode): void;
  getCameraMode(): CameraMode;
  setEnvironment(mode: EnvironmentMode): void;
  setLayerVisibility(layer: MapLayerId, visible: boolean): void;
  focusObject(objectId: string): Promise<void>;
  projectToScreen(pos: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    visible: boolean;
  };
  getObjectAnchor(objectId: string): { x: number; y: number; z: number } | null;
  setSelected(objectId: string | null): void;
  getSelected(): string | null;
  goHome(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (payload: any) => void): () => void;
  onFrame(cb: (dt: number) => void): () => void;
}

export type EngineContextValue = {
  renderer: MapRendererLike;
  world: MapWorld;
};

/**
 * Structural shape of a geocoding candidate (implemented by @map-engine/osm's
 * `CityCandidate` — the UI package deliberately avoids importing it).
 */
export type CityCandidateLike = {
  id: string;
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
  bbox?: [number, number, number, number];
  label: string;
};

/** Structural interface of the building editor (implemented in @map-engine/three). */
export interface BuildingEditorLike {
  setEnabled(v: boolean): void;
  getState(): { enabled: boolean; addMode: boolean; canUndo: boolean; canRedo: boolean; tick: number };
  onChange(cb: () => void): () => void;
  getBuilding(id: string): {
    id: string;
    name: string;
    floors: number;
    height: number;
  } | null;
  setFloors(id: string, floors: number): void;
  rename(id: string, name: string, description?: string): void;
  rotate(id: string, degrees: number): void;
  deleteBuilding(id: string): void;
  setAddMode(v: boolean): void;
  undo(): void;
  redo(): void;
}
