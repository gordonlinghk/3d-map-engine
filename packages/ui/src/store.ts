import { create } from 'zustand';
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

export const useAtlasStore = create<AtlasUiState>((set) => ({
  selectedId: null,
  hoveredId: null,
  cameraMode: 'orbit',
  environment: 'day',
  chip: 'All',
  query: '',
  panelOpen: true,
  setSelectedId: (selectedId) => set({ selectedId }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setEnvironment: (environment) => set({ environment }),
  setChip: (chip) => set({ chip }),
  setQuery: (query) => set({ query }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
