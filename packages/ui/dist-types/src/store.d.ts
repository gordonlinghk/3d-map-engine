import type { CameraMode, EnvironmentMode } from './types';
import type { CategoryChip } from './entries';
export type AtlasUiState = {
    selectedId: string | null;
    hoveredId: string | null;
    cameraMode: CameraMode;
    environment: EnvironmentMode;
    chip: CategoryChip;
    query: string;
    panelOpen: boolean;
    setSelectedId(id: string | null): void;
    setHoveredId(id: string | null): void;
    setCameraMode(mode: CameraMode): void;
    setEnvironment(mode: EnvironmentMode): void;
    setChip(chip: CategoryChip): void;
    setQuery(q: string): void;
    setPanelOpen(open: boolean): void;
};
export declare const useAtlasStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AtlasUiState>>;
